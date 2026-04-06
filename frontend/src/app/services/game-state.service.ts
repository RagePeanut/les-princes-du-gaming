import { computed, inject } from '@angular/core';
import {
  signalStore,
  withState,
  withMethods,
  withComputed,
  patchState,
} from '@ngrx/signals';
import type { LobbyState, Player, GameConfig, Item } from '@shared/types';
import type {
  PlayerScore,
  LeaderboardEntry,
  LobbyUpdatePayload,
  GameStartedPayload,
  TimerTickPayload,
  RoundEndedPayload,
  GameEndedPayload,
  RematchCountdownPayload,
  RematchStartedPayload,
  HostChangedPayload,
  JoinedAsSpectatorPayload,
  BetweenRoundsTickPayload,
} from '@shared/ws-messages';
import { SERVER_MSG } from '@shared/ws-messages';
import { Subscription } from 'rxjs';
import { WebSocketService } from './websocket.service';

export interface GameState {
  phase: LobbyState | null;
  lobbyCode: string | null;
  players: Player[];
  hostId: string | null;
  config: GameConfig | null;
  currentPlayerId: string | null;
  isHost: boolean;
  isSpectator: boolean;
  currentRound: number;
  totalRounds: number;
  items: Item[];
  timerSeconds: number;
  rankings: string[];
  roundScores: PlayerScore[];
  leaderboard: LeaderboardEntry[];
  averageRanking: string[];
  winnerId: string | null;
  isTie: boolean;
  rematchCountdown: number;
  betweenRoundsCountdown: number;
}

const initialState: GameState = {
  phase: null,
  lobbyCode: null,
  players: [],
  hostId: null,
  config: null,
  currentPlayerId: null,
  isHost: false,
  isSpectator: false,
  currentRound: 0,
  totalRounds: 0,
  items: [],
  timerSeconds: 0,
  rankings: [],
  roundScores: [],
  leaderboard: [],
  averageRanking: [],
  winnerId: null,
  isTie: false,
  rematchCountdown: 0,
  betweenRoundsCountdown: 0,
};

export const GameStateService = signalStore(
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
    isPlaying: computed(() => store.phase() === 'playing'),
    isWaiting: computed(() => store.phase() === 'waiting'),
    isRoundResults: computed(() => store.phase() === 'round_results'),
    isResults: computed(() => store.phase() === 'results'),
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
        subscription.add(
          ws.on<LobbyUpdatePayload>(SERVER_MSG.LOBBY_UPDATE).subscribe((payload) => {
			console.log(payload)
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

        subscription.add(
          ws.on<GameStartedPayload>(SERVER_MSG.GAME_STARTED).subscribe((payload) => {
            patchState(store, {
              phase: 'playing',
              currentRound: payload.roundIndex + 1,
              totalRounds: store.config()?.rounds ?? 0,
              items: payload.items,
              timerSeconds: payload.timerSeconds,
              rankings: payload.items.map((item) => item.id),
              roundScores: [],
              averageRanking: [],
              betweenRoundsCountdown: 0,
            });
          })
        );

        subscription.add(
          ws.on<TimerTickPayload>(SERVER_MSG.TIMER_TICK).subscribe((payload) => {
            patchState(store, { timerSeconds: payload.secondsRemaining });
          })
        );

        subscription.add(
          ws.on<RoundEndedPayload>(SERVER_MSG.ROUND_ENDED).subscribe((payload) => {
            patchState(store, {
              phase: 'round_results',
              roundScores: payload.scores,
              leaderboard: payload.leaderboard,
              averageRanking: payload.averageRanking,
              betweenRoundsCountdown: 0,
            });
          })
        );

        subscription.add(
          ws.on<BetweenRoundsTickPayload>(SERVER_MSG.BETWEEN_ROUNDS_TICK).subscribe((payload) => {
            patchState(store, { betweenRoundsCountdown: payload.secondsRemaining });
          })
        );

        subscription.add(
          ws.on<GameEndedPayload>(SERVER_MSG.GAME_ENDED).subscribe((payload) => {
            patchState(store, {
              phase: 'results',
              leaderboard: payload.leaderboard,
              winnerId: payload.winnerId,
              isTie: payload.isTie,
            });
          })
        );

        subscription.add(
          ws.on<RematchCountdownPayload>(SERVER_MSG.REMATCH_COUNTDOWN).subscribe((payload) => {
            patchState(store, {
              phase: 'rematch_countdown',
              rematchCountdown: payload.secondsRemaining,
            });
          })
        );

        subscription.add(
          ws.on<RematchStartedPayload>(SERVER_MSG.REMATCH_STARTED).subscribe((payload) => {
            patchState(store, {
              phase: 'playing',
              currentRound: payload.roundIndex + 1,
              items: payload.items,
              timerSeconds: payload.timerSeconds,
              rankings: payload.items.map((item) => item.id),
              roundScores: [],
              leaderboard: [],
              winnerId: null,
              isTie: false,
              rematchCountdown: 0,
              isSpectator: false,
            });
          })
        );

        subscription.add(
          ws.on<HostChangedPayload>(SERVER_MSG.HOST_CHANGED).subscribe((payload) => {
            const isNewHost = payload.newHostId === store.currentPlayerId();
            patchState(store, {
              hostId: payload.newHostId,
              isHost: isNewHost,
            });
          })
        );

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

      updateRankings(rankings: string[]): void {
        patchState(store, { rankings });
      },
    };
  })
);
