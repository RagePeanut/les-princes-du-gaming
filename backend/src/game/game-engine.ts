// GameEngine — orchestrates round lifecycle, scoring, rematch flow
// Uses callbacks for broadcasting so it doesn't depend on WebSocket directly.

import { Lobby, GameSession, RoundData, Item } from '../../../shared/types';
import { LeaderboardEntry, PlayerScore } from '../../../shared/ws-messages';
import { ItemStore } from '../items/item-store';
import {
  computeConsensusScores,
  updateCumulativeScores,
  buildLeaderboard,
} from '../scoring/scoring-engine';
import { startTimer, stopTimer } from './timer-manager';

export interface GameEngineCallbacks {
  onTimerTick: (lobbyCode: string, secondsRemaining: number) => void;
  onRoundStart: (lobbyCode: string, roundIndex: number, items: Item[], timerSeconds: number) => void;
  onRoundEnd: (
    lobbyCode: string,
    roundIndex: number,
    averageRanking: string[],
    scores: PlayerScore[],
    leaderboard: LeaderboardEntry[]
  ) => void;
  onGameEnd: (lobbyCode: string, leaderboard: LeaderboardEntry[], winnerId: string, isTie: boolean) => void;
  onRematchCountdown: (lobbyCode: string, secondsRemaining: number) => void;
  onRematchStart: (lobbyCode: string, roundIndex: number, items: Item[], timerSeconds: number) => void;
  onBetweenRoundsTick: (lobbyCode: string, secondsRemaining: number) => void;
}

export class GameEngine {
  private itemStore: ItemStore;
  private callbacks: GameEngineCallbacks;

  constructor(itemStore: ItemStore, callbacks: GameEngineCallbacks) {
    this.itemStore = itemStore;
    this.callbacks = callbacks;
  }

  /**
   * Initialize a new GameSession on the lobby and start the first round.
   */
  startGame(lobby: Lobby): void {
    const session: GameSession = {
      currentRound: 0,
      totalRounds: lobby.config.rounds,
      rounds: [],
      usedItemIds: new Set<string>(),
      cumulativeScores: new Map<string, number>(),
    };

    // Initialize cumulative scores for all active (non-spectator) players
    for (const [playerId, player] of lobby.players) {
      if (!player.isSpectator) {
        session.cumulativeScores.set(playerId, 0);
      }
    }

    lobby.gameSession = session;
    lobby.state = 'playing';

    this.startRound(lobby);
  }

  /**
   * Select items for the current round, create RoundData, start the timer.
   */
  startRound(lobby: Lobby): void {
    const session = lobby.gameSession!;
    const items = this.itemStore.selectItems(
      lobby.config.mode,
      session.usedItemIds
    );

    // Track used items
    for (const item of items) {
      session.usedItemIds.add(item.id);
    }

    const roundData: RoundData = {
      roundIndex: session.currentRound,
      items,
      rankings: new Map<string, string[]>(),
      averageRanking: [],
      scores: new Map<string, number>(),
      timerStartedAt: Date.now(),
      isComplete: false,
    };

    session.rounds.push(roundData);
    lobby.state = 'playing';

    this.callbacks.onRoundStart(
      lobby.code,
      roundData.roundIndex,
      items,
      lobby.config.timerSeconds
    );

    // Start countdown timer (only if timer is enabled)
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
        }
      );
    }
  }

  /**
   * Record a player's ranking submission.
   * Rejects spectators and validates item IDs.
   * Triggers early completion if all active players have submitted.
   */
  submitRanking(lobby: Lobby, playerId: string, ranking: string[]): { error?: string } {
    const player = lobby.players.get(playerId);
    if (!player) {
      return { error: 'Player not found in lobby.' };
    }

    if (player.isSpectator) {
      return { error: 'Spectators cannot submit rankings.' };
    }

    const session = lobby.gameSession;
    if (!session) {
      return { error: 'No active game session.' };
    }

    const currentRound = session.rounds[session.currentRound];
    if (!currentRound || currentRound.isComplete) {
      return { error: 'Round is not active.' };
    }

    // Validate that ranking contains exactly the current round's item IDs
    const expectedIds = new Set(currentRound.items.map((item) => item.id));
    if (ranking.length !== expectedIds.size) {
      return { error: "Invalid ranking — items don't match current round." };
    }
    for (const id of ranking) {
      if (!expectedIds.has(id)) {
        return { error: "Invalid ranking — items don't match current round." };
      }
    }

    currentRound.rankings.set(playerId, ranking);

    // Check for early completion: all active (non-spectator) connected players submitted
    const activePlayers = Array.from(lobby.players.values()).filter(
      (p) => !p.isSpectator && p.isConnected
    );
    const allSubmitted = activePlayers.every((p) =>
      currentRound.rankings.has(p.id)
    );

    if (allSubmitted) {
      stopTimer(lobby.code);
      this.endRound(lobby);
    }

    return {};
  }

  /**
   * End the current round: fill in default rankings for non-submitters,
   * compute scores, update leaderboard, and advance to next round or game end.
   */
  endRound(lobby: Lobby): void {
    const session = lobby.gameSession!;
    const currentRound = session.rounds[session.currentRound];

    if (!currentRound || currentRound.isComplete) {
      return; // Already ended or no round data (guard against double-call)
    }
    currentRound.isComplete = true;

    // Fill default rankings for active players who didn't submit
    const defaultOrder = currentRound.items.map((item) => item.id);
    const activePlayers = Array.from(lobby.players.values()).filter(
      (p) => !p.isSpectator
    );
    for (const player of activePlayers) {
      if (!currentRound.rankings.has(player.id)) {
        currentRound.rankings.set(player.id, [...defaultOrder]);
      }
    }

    // Compute consensus scores
    const itemIds = currentRound.items.map((item) => item.id);
    const roundScores = computeConsensusScores(currentRound.rankings, itemIds);
    currentRound.scores = roundScores;

    // Compute average ranking (sort items by average position)
    const avgPositions = this.computeAveragePositions(currentRound.rankings, itemIds);
    currentRound.averageRanking = [...itemIds].sort(
      (a, b) => avgPositions.get(a)! - avgPositions.get(b)!
    );

    // Update cumulative scores
    updateCumulativeScores(session.cumulativeScores, roundScores);

    // Build leaderboard
    const { leaderboard } = buildLeaderboard(
      session.cumulativeScores,
      lobby.players
    );

    // Build per-player scores for broadcast
    const playerScores: PlayerScore[] = [];
    for (const [playerId, score] of roundScores) {
      const player = lobby.players.get(playerId);
      if (player) {
        playerScores.push({
          playerId,
          username: player.username,
          avatarDataUri: player.avatarDataUri,
          score,
        });
      }
    }

    // Check if not enough players remain to continue (minimum 3 required)
    const connectedActivePlayers = Array.from(lobby.players.values()).filter(
      (p) => !p.isSpectator && p.isConnected
    );
    const notEnoughPlayers = connectedActivePlayers.length < 3;

    // Check if this was the last round
    const isLastRound = session.currentRound >= session.totalRounds - 1;

    if (isLastRound || notEnoughPlayers) {
      lobby.state = 'results';
      const { leaderboard: finalLeaderboard, winnerId, isTie } = buildLeaderboard(
        session.cumulativeScores,
        lobby.players
      );

      // Broadcast round end first, then game end
      this.callbacks.onRoundEnd(
        lobby.code,
        currentRound.roundIndex,
        currentRound.averageRanking,
        playerScores,
        finalLeaderboard
      );

      lobby.previousWinnerId = winnerId;

      this.callbacks.onGameEnd(lobby.code, finalLeaderboard, winnerId, isTie);

      // Start 30-second rematch countdown
      this.startRematchCountdown(lobby);
    } else {
      lobby.state = 'round_results';
      session.currentRound += 1;

      this.callbacks.onRoundEnd(
        lobby.code,
        currentRound.roundIndex,
        currentRound.averageRanking,
        playerScores,
        leaderboard
      );

      // Start between-rounds auto-advance timer if configured
      if (lobby.config.timeBetweenRounds >= 0) {
        const timerKey = `betweenRounds:${lobby.code}`;
        startTimer(
          timerKey,
          lobby.config.timeBetweenRounds,
          (secondsRemaining) => {
            this.callbacks.onBetweenRoundsTick(lobby.code, secondsRemaining);
          },
          () => {
            this.nextRound(lobby);
          }
        );
      }
    }
  }

  /**
   * Advance to the next round (called by host after viewing round results).
   * If not enough players remain (< 3), end the game instead.
   */
  nextRound(lobby: Lobby): void {
    if (lobby.state !== 'round_results') {
      return;
    }
    stopTimer(`betweenRounds:${lobby.code}`);

    // Check if enough players remain to continue
    const connectedActivePlayers = Array.from(lobby.players.values()).filter(
      (p) => !p.isSpectator && p.isConnected
    );
    if (connectedActivePlayers.length < 3) {
      this.forceGameEnd(lobby);
      return;
    }

    this.startRound(lobby);
  }

  /**
   * Force-end the game when not enough players remain (< 3).
   * Broadcasts game end with current leaderboard and starts rematch countdown.
   */
  private forceGameEnd(lobby: Lobby): void {
    const session = lobby.gameSession!;
    lobby.state = 'results';

    const { leaderboard, winnerId, isTie } = buildLeaderboard(
      session.cumulativeScores,
      lobby.players
    );

    lobby.previousWinnerId = winnerId;

    this.callbacks.onGameEnd(lobby.code, leaderboard, winnerId, isTie);

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
      }
    );
  }

  /**
   * Start a rematch: promote spectators, assign crown to previous winner,
   * reset game session, and start the first round.
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

    // Create new game session
    const session: GameSession = {
      currentRound: 0,
      totalRounds: lobby.config.rounds,
      rounds: [],
      usedItemIds: new Set<string>(),
      cumulativeScores: new Map<string, number>(),
    };

    for (const [playerId, player] of lobby.players) {
      if (!player.isSpectator) {
        session.cumulativeScores.set(playerId, 0);
      }
    }

    lobby.gameSession = session;
    lobby.state = 'playing';

    // Select items for first round
    const items = this.itemStore.selectItems(
      lobby.config.mode,
      session.usedItemIds
    );
    for (const item of items) {
      session.usedItemIds.add(item.id);
    }

    const roundData: RoundData = {
      roundIndex: 0,
      items,
      rankings: new Map<string, string[]>(),
      averageRanking: [],
      scores: new Map<string, number>(),
      timerStartedAt: Date.now(),
      isComplete: false,
    };

    session.rounds.push(roundData);

    this.callbacks.onRematchStart(
      lobby.code,
      0,
      items,
      lobby.config.timerSeconds
    );

    // Start countdown timer for the first round
    startTimer(
      lobby.code,
      lobby.config.timerSeconds,
      (secondsRemaining) => {
        this.callbacks.onTimerTick(lobby.code, secondsRemaining);
      },
      () => {
        this.endRound(lobby);
      }
    );
  }

  /**
   * Compute average position for each item across all rankings.
   */
  private computeAveragePositions(
    rankings: Map<string, string[]>,
    itemIds: string[]
  ): Map<string, number> {
    const playerIds = Array.from(rankings.keys());
    const avgPosition = new Map<string, number>();

    for (const itemId of itemIds) {
      let sum = 0;
      for (const playerId of playerIds) {
        const rank = rankings.get(playerId)!;
        sum += rank.indexOf(itemId) + 1; // 1-indexed
      }
      avgPosition.set(itemId, sum / playerIds.length);
    }

    return avgPosition;
  }
}
