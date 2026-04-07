import { computed, inject } from '@angular/core';
import {
  signalStore,
  withState,
  withMethods,
  withComputed,
  patchState,
} from '@ngrx/signals';
import type { LobbyState, Player, GameConfig, Item, TierName } from '@shared/types';
import type {
  LeaderboardEntry,
  LobbyUpdatePayload,
  TimerTickPayload,
  RematchCountdownPayload,
  HostChangedPayload,
  JoinedAsSpectatorPayload,
  TierListRouletteStartPayload,
  TierListRouletteResultPayload,
  TierListRoundStartPayload,
  TierListVoteStatusPayload,
  TierListSuspenseStartPayload,
  TierListRoundResultPayload,
  TierListGameEndedPayload,
  PlayerTierVote,
  PlayerProximityScore,
} from '@shared/ws-messages';
import { SERVER_MSG } from '@shared/ws-messages';
import type { TierListResult } from '@shared/types';
import { Subscription } from 'rxjs';
import { WebSocketService } from './websocket.service';

export interface VoteStatus {
  playerId: string;
  hasVoted: boolean;
}

export interface TierListGameState {
  phase: LobbyState | null;
  lobbyCode: string | null;
  players: Player[];
  hostId: string | null;
  config: GameConfig | null;
  currentPlayerId: string | null;
  isHost: boolean;
  isSpectator: boolean;

  // Roulette
  rouletteThemes: string[];
  selectedTheme: string | null;
  themeItems: Item[];

  // Current round
  currentRound: number;
  totalRounds: number;
  currentItem: Item | null;
  timerSeconds: number;
  voteStatuses: VoteStatus[];

  // Tier list built over rounds
  tierListResult: TierListResult | null;

  // Round results
  roundVotes: PlayerTierVote[];
  roundScores: PlayerProximityScore[];
  roundFinalTier: TierName | null;
  roundAverageValue: number;
  roundItem: Item | null;

  // Leaderboard & end game
  leaderboard: LeaderboardEntry[];
  winnerId: string | null;
  isTie: boolean;
  rematchCountdown: number;
}

const initialState: TierListGameState = {
  phase: null,
  lobbyCode: null,
  players: [],
  hostId: null,
  config: null,
  currentPlayerId: null,
  isHost: false,
  isSpectator: false,

  rouletteThemes: [],
  selectedTheme: null,
  themeItems: [],

  currentRound: 0,
  totalRounds: 0,
  currentItem: null,
  timerSeconds: 0,
  voteStatuses: [],

  tierListResult: null,

  roundVotes: [],
  roundScores: [],
  roundFinalTier: null,
  roundAverageValue: 0,
  roundItem: null,

  leaderboard: [],
  winnerId: null,
  isTie: false,
  rematchCountdown: 0,
};

export const TierListGameStateService = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed((store) => ({
    currentPlayer: computed(() => {
      const id = store.currentPlayerId();
      return store.players().find((p) => p.id === id) ?? null;
    }),
    activePlayers: computed(() =>
      store.players().filter((p) => !p.isSpectator && p.isConnected)
    ),
    spectators: computed(() =>
      store.players().filter((p) => p.isSpectator)
    ),
    isRoulette: computed(() => store.phase() === 'roulette'),
    isPlaying: computed(() => store.phase() === 'playing'),
    isSuspense: computed(() => store.phase() === 'suspense'),
    isRoundResults: computed(() => store.phase() === 'round_results'),
    isResults: computed(() => store.phase() === 'results'),
    isWaiting: computed(() => store.phase() === 'waiting'),
    isRematchCountdown: computed(() => store.phase() === 'rematch_countdown'),
  })),
  withMethods((store) => {
    const ws = inject(WebSocketService);
    const subscription = new Subscription();

    return {
      init(lobbyCode: string, currentPlayerId: string): void {
        patchState(store, { lobbyCode, currentPlayerId, phase: 'waiting' });
        this._subscribeToMessages();
      },

      reset(): void {
        subscription.unsubscribe();
        patchState(store, { ...initialState });
      },

      setCurrentPlayer(playerId: string): void {
        patchState(store, { currentPlayerId: playerId });
        const player = store.players().find((p) => p.id === playerId);
        if (player) {
          patchState(store, {
            isHost: player.isHost,
            isSpectator: player.isSpectator,
          });
        }
      },

      _subscribeToMessages(): void {
        // Lobby updates (shared with ranking game)
        subscription.add(
          ws.on<LobbyUpdatePayload>(SERVER_MSG.LOBBY_UPDATE).subscribe((payload) => {
            const currentId = store.currentPlayerId();
            const me = payload.players.find((p) => p.id === currentId);
            patchState(store, {
              players: payload.players,
              hostId: payload.hostId,
              config: payload.config,
              isHost: me?.isHost ?? false,
              isSpectator: me?.isSpectator ?? false,
            });
          })
        );

        // Roulette start
        subscription.add(
          ws.on<TierListRouletteStartPayload>(SERVER_MSG.TIERLIST_ROULETTE_START).subscribe((payload) => {
            patchState(store, {
              phase: 'roulette',
              rouletteThemes: payload.themes,
              selectedTheme: null,
              themeItems: [],
              voteStatuses: [],
              leaderboard: [],
              winnerId: null,
              isTie: false,
              rematchCountdown: 0,
              tierListResult: null,
            });
          })
        );

        // Roulette result
        subscription.add(
          ws.on<TierListRouletteResultPayload>(SERVER_MSG.TIERLIST_ROULETTE_RESULT).subscribe((payload) => {
            patchState(store, {
              selectedTheme: payload.theme,
              themeItems: payload.items,
              totalRounds: payload.items.length,
            });
          })
        );

        // Round start
        subscription.add(
          ws.on<TierListRoundStartPayload>(SERVER_MSG.TIERLIST_ROUND_START).subscribe((payload) => {
            patchState(store, {
              phase: 'playing',
              currentRound: payload.roundIndex + 1,
              totalRounds: payload.totalItems,
              currentItem: payload.item,
              timerSeconds: payload.timerSeconds,
              voteStatuses: [],
              roundVotes: [],
              roundScores: [],
              roundFinalTier: null,
              roundAverageValue: 0,
              roundItem: null,
            });
          })
        );

        // Vote status
        subscription.add(
          ws.on<TierListVoteStatusPayload>(SERVER_MSG.TIERLIST_VOTE_STATUS).subscribe((payload) => {
            const current = store.voteStatuses();
            const existing = current.findIndex((v) => v.playerId === payload.playerId);
            const updated = existing >= 0
              ? current.map((v, i) => i === existing ? { playerId: payload.playerId, hasVoted: payload.hasVoted } : v)
              : [...current, { playerId: payload.playerId, hasVoted: payload.hasVoted }];
            patchState(store, { voteStatuses: updated });
          })
        );

        // Timer tick
        subscription.add(
          ws.on<TimerTickPayload>(SERVER_MSG.TIMER_TICK).subscribe((payload) => {
            patchState(store, { timerSeconds: payload.secondsRemaining });
          })
        );

        // Suspense start
        subscription.add(
          ws.on<TierListSuspenseStartPayload>(SERVER_MSG.TIERLIST_SUSPENSE_START).subscribe((payload) => {
            patchState(store, {
              phase: 'suspense',
              voteStatuses: [],
            });
          })
        );

        // Round result — accumulate tier list progressively
        subscription.add(
          ws.on<TierListRoundResultPayload>(SERVER_MSG.TIERLIST_ROUND_RESULT).subscribe((payload) => {
            // Build updated tier list result by adding this round's item to its final tier
            const current = store.tierListResult();
            const TIER_COLORS_MAP: Record<string, string> = {
              S: '#FF7F7F', A: '#FFBF7F', B: '#FFDF7F',
              C: '#BFFF7F', D: '#7FBFFF', F: '#FF7FBF',
            };
            const allTiers: TierName[] = ['S', 'A', 'B', 'C', 'D', 'F'];
            const updatedTierList: TierListResult = current
              ? {
                  tiers: current.tiers.map(t => ({
                    ...t,
                    items: t.tier === payload.finalTier
                      ? [...t.items, payload.item]
                      : [...t.items],
                  })),
                }
              : {
                  tiers: allTiers.map(t => ({
                    tier: t,
                    color: TIER_COLORS_MAP[t],
                    items: t === payload.finalTier ? [payload.item] : [],
                  })),
                };

            patchState(store, {
              phase: 'round_results',
              roundItem: payload.item,
              roundFinalTier: payload.finalTier,
              roundAverageValue: payload.averageValue,
              roundVotes: payload.votes,
              roundScores: payload.scores,
              leaderboard: payload.leaderboard,
              tierListResult: updatedTierList,
            });
          })
        );

        // Game ended
        subscription.add(
          ws.on<TierListGameEndedPayload>(SERVER_MSG.TIERLIST_GAME_ENDED).subscribe((payload) => {
            patchState(store, {
              phase: 'results',
              tierListResult: payload.tierList,
              leaderboard: payload.leaderboard,
              winnerId: payload.winnerId,
              isTie: payload.isTie,
            });
          })
        );

        // Rematch countdown
        subscription.add(
          ws.on<RematchCountdownPayload>(SERVER_MSG.REMATCH_COUNTDOWN).subscribe((payload) => {
            patchState(store, {
              phase: 'rematch_countdown',
              rematchCountdown: payload.secondsRemaining,
            });
          })
        );

        // Host changed
        subscription.add(
          ws.on<HostChangedPayload>(SERVER_MSG.HOST_CHANGED).subscribe((payload) => {
            const isNewHost = payload.newHostId === store.currentPlayerId();
            patchState(store, {
              hostId: payload.newHostId,
              isHost: isNewHost,
            });
          })
        );

        // Joined as spectator
        subscription.add(
          ws.on<JoinedAsSpectatorPayload>(SERVER_MSG.JOINED_AS_SPECTATOR).subscribe((payload) => {
            patchState(store, {
              phase: payload.gameState,
              currentRound: payload.currentRound,
              leaderboard: payload.leaderboard,
              isSpectator: true,
            });
          })
        );
      },
    };
  })
);
