// TierListGameEngine — orchestrates tier list game lifecycle:
// roulette → rounds (vote → suspense → result) → game end → rematch
// Uses callbacks for broadcasting so it doesn't depend on WebSocket directly.

import {
  Lobby,
  TierListGameSession,
  TierListRoundData,
  TierListResult,
  Item,
  TierName,
  TIER_VALUES,
  TIER_COLORS,
} from '../../../shared/types';
import {
  LeaderboardEntry,
  PlayerTierVote,
  PlayerProximityScore,
} from '../../../shared/ws-messages';
import { ItemStore } from '../items/item-store';
import {
  computeAverageAndTier,
  computeRoundScores,
  updateCumulativeScores,
  buildTierListLeaderboard,
} from './tierlist-scoring-engine';
import { startTimer, stopTimer } from '../game/timer-manager';

export interface TierListGameEngineCallbacks {
  onRouletteStart: (lobbyCode: string, themes: string[]) => void;
  onRouletteResult: (lobbyCode: string, theme: string, items: Item[]) => void;
  onTierListRoundStart: (
    lobbyCode: string,
    roundIndex: number,
    item: Item,
    totalItems: number,
    timerSeconds: number,
  ) => void;
  onVoteStatus: (lobbyCode: string, playerId: string, hasVoted: boolean) => void;
  onSuspenseStart: (lobbyCode: string, roundIndex: number) => void;
  onTierListRoundResult: (
    lobbyCode: string,
    roundIndex: number,
    item: Item,
    finalTier: TierName,
    averageValue: number,
    votes: PlayerTierVote[],
    scores: PlayerProximityScore[],
    leaderboard: LeaderboardEntry[],
  ) => void;
  onTierListGameEnded: (
    lobbyCode: string,
    tierList: TierListResult,
    leaderboard: LeaderboardEntry[],
    winnerId: string,
    isTie: boolean,
  ) => void;
  onTimerTick: (lobbyCode: string, secondsRemaining: number) => void;
  onRematchCountdown: (lobbyCode: string, secondsRemaining: number) => void;
}

export class TierListGameEngine {
  private itemStore: ItemStore;
  private callbacks: TierListGameEngineCallbacks;
  /** Tracks which players have confirmed their vote for the current round */
  private confirmedPlayers = new Set<string>();

  constructor(itemStore: ItemStore, callbacks: TierListGameEngineCallbacks) {
    this.itemStore = itemStore;
    this.callbacks = callbacks;
  }

  /**
   * Initialize a new TierListGameSession on the lobby and start the roulette.
   * Selects a theme from categories with ≥5 items, shuffles items, sends roulette.
   */
  startGame(lobby: Lobby): void {
    let theme: string;
    let items: Item[];

    if (lobby.config.mode === 'random') {
      // Random mode: pick 15 items randomly across all categories
      const allItems = this.itemStore.getAllItems();
      if (allItems.length < 15) {
        throw new Error('Not enough items for a random tier list game (need at least 15)');
      }

      // Fisher-Yates shuffle all items
      const shuffled = [...allItems];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      items = shuffled.slice(0, 15);
      theme = 'random';
    } else {
      // Category mode: pick a random eligible category
      const allCategories = this.itemStore.getCategories();
      const eligibleCategories = allCategories.filter(
        (cat) => this.itemStore.getItemsByCategory(cat).length >= 5,
      );

      if (eligibleCategories.length === 0) {
        throw new Error('Not enough items in any category for a tier list game');
      }

      theme = eligibleCategories[Math.floor(Math.random() * eligibleCategories.length)];
      items = [...this.itemStore.getItemsByCategory(theme)];

      // Fisher-Yates shuffle
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
      }
    }

    // Initialize tier list session
    const session: TierListGameSession = {
      theme,
      items,
      currentRound: 0,
      totalRounds: items.length,
      rounds: [],
      cumulativeScores: new Map<string, number>(),
      tierListResult: new Map<TierName, Item[]>(),
    };

    // Initialize cumulative scores for all active (non-spectator) players
    for (const [playerId, player] of lobby.players) {
      if (!player.isSpectator) {
        session.cumulativeScores.set(playerId, 0);
      }
    }

    // Initialize empty tier list result
    const tierNames: TierName[] = ['S', 'A', 'B', 'C', 'D', 'F'];
    for (const tier of tierNames) {
      session.tierListResult.set(tier, []);
    }

    lobby.tierListSession = session;

    // Skip roulette animation when mode is "random"
    if (lobby.config.mode === 'random') {
      this.callbacks.onRouletteResult(lobby.code, theme, items);
      lobby.state = 'playing';
      this.startRound(lobby);
    } else {
      lobby.state = 'roulette';

      // Compute eligible categories for the roulette display
      const allCategories = this.itemStore.getCategories();
      const rouletteThemes = allCategories.filter(
        (cat) => this.itemStore.getItemsByCategory(cat).length >= 5,
      );

      // Send roulette start with all eligible themes
      this.callbacks.onRouletteStart(lobby.code, rouletteThemes);

      // After a short delay, send the roulette result and start the first round
      // Use a 5-second delay for the roulette animation
      const rouletteTimerKey = `roulette:${lobby.code}`;
      startTimer(
        rouletteTimerKey,
        5,
        () => {}, // no tick needed for roulette
        () => {
          this.callbacks.onRouletteResult(lobby.code, theme, items);
          // Start the first round after a brief pause (1 second)
          const startTimerKey = `rouletteEnd:${lobby.code}`;
          startTimer(
            startTimerKey,
            1,
            () => {},
            () => {
              this.startRound(lobby);
            },
          );
        },
      );
    }
  }

  /**
   * Start a round with the current item, launch the vote timer.
   */
  startRound(lobby: Lobby): void {
    const session = lobby.tierListSession!;
    const item = session.items[session.currentRound];

    // Reset confirmed players for the new round
    this.confirmedPlayers.clear();

    const roundData: TierListRoundData = {
      roundIndex: session.currentRound,
      item,
      votes: new Map<string, TierName>(),
      averageValue: 0,
      finalTier: 'C',
      scores: new Map<string, number>(),
      timerStartedAt: Date.now(),
      isComplete: false,
    };

    session.rounds.push(roundData);
    lobby.state = 'playing';

    this.callbacks.onTierListRoundStart(
      lobby.code,
      roundData.roundIndex,
      item,
      session.totalRounds,
      lobby.config.timerSeconds,
    );

    // Start countdown timer
    if (lobby.config.timerSeconds >= 0) {
      startTimer(
        lobby.code,
        lobby.config.timerSeconds,
        (secondsRemaining) => {
          this.callbacks.onTimerTick(lobby.code, secondsRemaining);
        },
        () => {
          // Timer expired — end the round
          this.endRound(lobby);
        },
      );
    }
  }

  /**
   * Record a player's tier vote.
   * Validates: tier is valid, player is not spectator, no double vote, round is active.
   * Broadcasts vote status and triggers early completion if all active players voted.
   */
  submitVote(lobby: Lobby, playerId: string, tier: string, confirmed: boolean = false): { error?: string } {
    const player = lobby.players.get(playerId);
    if (!player) {
      return { error: 'Player not found in lobby.' };
    }

    if (player.isSpectator) {
      return { error: 'Spectators cannot vote.' };
    }

    const session = lobby.tierListSession;
    if (!session) {
      return { error: 'No active game session.' };
    }

    const currentRound = session.rounds[session.currentRound];
    if (!currentRound || currentRound.isComplete) {
      return { error: 'No active round.' };
    }

    // Validate tier
    const validTiers: TierName[] = ['S', 'A', 'B', 'C', 'D', 'F'];
    if (!validTiers.includes(tier as TierName)) {
      return { error: 'Invalid tier. Valid tiers are: S, A, B, C, D, F.' };
    }

    // Record the vote (overwrites previous if player changed their mind)
    currentRound.votes.set(playerId, tier as TierName);

    if (confirmed) {
      this.confirmedPlayers.add(playerId);

      // Broadcast vote status (without revealing the tier)
      this.callbacks.onVoteStatus(lobby.code, playerId, true);

      // Check for early completion: all active (non-spectator) connected players confirmed
      const activePlayers = Array.from(lobby.players.values()).filter(
        (p) => !p.isSpectator && p.isConnected,
      );
      const allConfirmed = activePlayers.every((p) =>
        this.confirmedPlayers.has(p.id)
      );

      if (allConfirmed) {
        stopTimer(lobby.code);
        this.endRound(lobby);
      }
    }

    return {};
  }

  /**
   * End the current round:
   * - Default vote (tier C) for non-voters
   * - Compute average and final tier
   * - Compute proximity scores
   * - Suspense phase (3 seconds)
   * - Broadcast result
   * - Advance to next round or end game
   */
  endRound(lobby: Lobby): void {
    const session = lobby.tierListSession!;
    const currentRound = session.rounds[session.currentRound];

    if (!currentRound || currentRound.isComplete) {
      return; // Guard against double-call
    }
    currentRound.isComplete = true;

    // Fill default votes (tier C) for active players who didn't vote
    const activePlayers = Array.from(lobby.players.values()).filter(
      (p) => !p.isSpectator,
    );
    for (const player of activePlayers) {
      if (!currentRound.votes.has(player.id)) {
        currentRound.votes.set(player.id, 'C');
      }
    }

    // Compute average and final tier
    const { average, tier: finalTier } = computeAverageAndTier(currentRound.votes);
    currentRound.averageValue = average;
    currentRound.finalTier = finalTier;

    // Compute round scores using scatter-weighted proximity scoring
    const roundScores = computeRoundScores(currentRound.votes);
    currentRound.scores = roundScores;

    // Update cumulative scores
    updateCumulativeScores(session.cumulativeScores, roundScores);

    // Add item to tier list result
    const tierItems = session.tierListResult.get(finalTier) ?? [];
    tierItems.push(currentRound.item);
    session.tierListResult.set(finalTier, tierItems);

    // Build vote details for broadcast
    const votes: PlayerTierVote[] = [];
    for (const [playerId, votedTier] of currentRound.votes) {
      const player = lobby.players.get(playerId);
      if (player) {
        votes.push({
          playerId,
          username: player.username,
          avatarHeadUrl: player.avatarHeadUrl,
          avatarAccessoryUrl: player.avatarAccessoryUrl,
          votedTier,
        });
      }
    }

    // Build score details for broadcast
    const scores: PlayerProximityScore[] = [];
    for (const [playerId, score] of roundScores) {
      const player = lobby.players.get(playerId);
      if (player) {
        scores.push({
          playerId,
          username: player.username,
          avatarHeadUrl: player.avatarHeadUrl,
          avatarAccessoryUrl: player.avatarAccessoryUrl,
          score,
        });
      }
    }

    // Build leaderboard
    const { leaderboard } = buildTierListLeaderboard(
      session.cumulativeScores,
      lobby.players,
    );

    // Start suspense phase (3 seconds)
    lobby.state = 'suspense';
    this.callbacks.onSuspenseStart(lobby.code, currentRound.roundIndex);

    const suspenseTimerKey = `suspense:${lobby.code}`;
    startTimer(
      suspenseTimerKey,
      3,
      () => {}, // no tick needed for suspense
      () => {
        // Suspense ended — broadcast result
        this.callbacks.onTierListRoundResult(
          lobby.code,
          currentRound.roundIndex,
          currentRound.item,
          finalTier,
          average,
          votes,
          scores,
          leaderboard,
        );

        // Check if this was the last round
        const isLastRound = session.currentRound >= session.totalRounds - 1;

        if (isLastRound) {
          this.endGame(lobby);
        } else {
          lobby.state = 'round_results';
          session.currentRound += 1;

          // Auto-advance to next round after configured delay
          if (lobby.config.timeBetweenRounds >= 0) {
            const betweenTimerKey = `betweenRounds:${lobby.code}`;
            startTimer(
              betweenTimerKey,
              lobby.config.timeBetweenRounds,
              () => {},
              () => {
                this.startRound(lobby);
              },
            );
          }
          // When timeBetweenRounds === -1, host must manually advance via NEXT_ROUND
        }
      },
    );
  }

  /**
   * End the game: build final tier list, leaderboard, broadcast game ended.
   */
  private endGame(lobby: Lobby): void {
    const session = lobby.tierListSession!;
    lobby.state = 'results';

    // Build TierListResult
    const tierList: TierListResult = {
      tiers: (['S', 'A', 'B', 'C', 'D', 'F'] as TierName[]).map((tier) => ({
        tier,
        color: TIER_COLORS[tier],
        items: session.tierListResult.get(tier) ?? [],
      })),
    };

    const { leaderboard, winnerId, isTie } = buildTierListLeaderboard(
      session.cumulativeScores,
      lobby.players,
    );

    lobby.previousWinnerId = winnerId;

    this.callbacks.onTierListGameEnded(
      lobby.code,
      tierList,
      leaderboard,
      winnerId,
      isTie,
    );

    // Start 30-second rematch countdown
    this.startRematchCountdown(lobby);
  }

  /**
   * Start the 30-second rematch countdown.
   */
  startRematchCountdown(lobby: Lobby): void {
    lobby.state = 'rematch_countdown';

    startTimer(
      lobby.code,
      30,
      (secondsRemaining) => {
        this.callbacks.onRematchCountdown(lobby.code, secondsRemaining);
      },
      () => {
        // Countdown expired — auto-start rematch
        this.startRematch(lobby);
      },
    );
  }

  /**
   * Manually advance to the next round (called by host via NEXT_ROUND).
   */
  nextRound(lobby: Lobby): void {
    if (lobby.state !== 'round_results') return;
    this.startRound(lobby);
  }

  /**
   * Start a rematch: promote spectators, crown previous winner,
   * remove disconnected players, new session, new roulette.
   */
  startRematch(lobby: Lobby): void {
    stopTimer(lobby.code);

    const previousWinnerId = lobby.previousWinnerId;

    // Remove disconnected players
    const disconnectedIds: string[] = [];
    for (const [playerId, player] of lobby.players) {
      if (!player.isConnected) {
        disconnectedIds.push(playerId);
      }
    }
    for (const id of disconnectedIds) {
      lobby.players.delete(id);
    }

    // Promote spectators and assign crown
    for (const [playerId, player] of lobby.players) {
      player.isSpectator = false;
      player.hasCrown = playerId === previousWinnerId;
    }

    // Start a new game (which creates a new session and roulette)
    this.startGame(lobby);
  }
}
