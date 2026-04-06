// WebSocket message type constants and payload interfaces
// Used by both backend and frontend

import { GameConfig, Item, LobbyState, Player } from './types';

// ─── Message Type Constants ─────────────────────────────────────────────────

// Client → Server
export const CLIENT_MSG = {
  JOIN_LOBBY: 'JOIN_LOBBY',
  START_GAME: 'START_GAME',
  SUBMIT_RANKING: 'SUBMIT_RANKING',
  LEAVE_LOBBY: 'LEAVE_LOBBY',
  UPDATE_CONFIG: 'UPDATE_CONFIG',
  NEXT_ROUND: 'NEXT_ROUND',
} as const;

// Server → Client
export const SERVER_MSG = {
  LOBBY_UPDATE: 'LOBBY_UPDATE',
  GAME_STARTED: 'GAME_STARTED',
  TIMER_TICK: 'TIMER_TICK',
  ROUND_ENDED: 'ROUND_ENDED',
  GAME_ENDED: 'GAME_ENDED',
  REMATCH_COUNTDOWN: 'REMATCH_COUNTDOWN',
  REMATCH_STARTED: 'REMATCH_STARTED',
  PLAYER_DISCONNECTED: 'PLAYER_DISCONNECTED',
  PLAYER_RECONNECTED: 'PLAYER_RECONNECTED',
  HOST_CHANGED: 'HOST_CHANGED',
  JOINED_AS_SPECTATOR: 'JOINED_AS_SPECTATOR',
  ERROR: 'ERROR',
  BETWEEN_ROUNDS_TICK: 'BETWEEN_ROUNDS_TICK',
  AVATAR_ASSIGNED: 'AVATAR_ASSIGNED',
} as const;

// ─── Shared Result Types ────────────────────────────────────────────────────

export interface PlayerScore {
  playerId: string;
  username: string;
  avatarDataUri: string;
  score: number;
}

export interface LeaderboardEntry {
  playerId: string;
  username: string;
  avatarDataUri: string;
  totalScore: number;
  rank: number;
}

// ─── Client → Server Payloads ───────────────────────────────────────────────

export interface JoinLobbyPayload {
  lobbyCode: string;
  username: string;
}

export interface StartGamePayload {
  lobbyCode: string;
}

export interface SubmitRankingPayload {
  lobbyCode: string;
  roundIndex: number;
  ranking: string[];
}

export interface LeaveLobbyPayload {
  lobbyCode: string;
}

export interface UpdateConfigPayload {
  lobbyCode: string;
  config: Partial<GameConfig>;
}

export interface NextRoundPayload {
  lobbyCode: string;
}

// ─── Server → Client Payloads ───────────────────────────────────────────────

export interface LobbyUpdatePayload {
  players: Player[];
  hostId: string;
  config: GameConfig;
}

export interface GameStartedPayload {
  roundIndex: number;
  items: Item[];
  timerSeconds: number;
}

export interface TimerTickPayload {
  secondsRemaining: number;
}

export interface RoundEndedPayload {
  roundIndex: number;
  averageRanking: string[];
  scores: PlayerScore[];
  leaderboard: LeaderboardEntry[];
}

export interface GameEndedPayload {
  leaderboard: LeaderboardEntry[];
  winnerId: string;
  isTie: boolean;
}

export interface BetweenRoundsTickPayload {
  secondsRemaining: number;
}

export interface RematchCountdownPayload {
  secondsRemaining: number;
}

export interface RematchStartedPayload {
  roundIndex: number;
  items: Item[];
  timerSeconds: number;
}

export interface PlayerDisconnectedPayload {
  playerId: string;
  username: string;
}

export interface PlayerReconnectedPayload {
  playerId: string;
  username: string;
}

export interface HostChangedPayload {
  newHostId: string;
  newHostUsername: string;
}

export interface JoinedAsSpectatorPayload {
  gameState: LobbyState;
  currentRound: number;
  leaderboard: LeaderboardEntry[];
}

export interface ErrorPayload {
  message: string;
}

export interface AvatarAssignedPayload {
  playerId: string;
  avatarDataUri: string;
}

// ─── Typed Message Interfaces ───────────────────────────────────────────────

export type ClientMessage =
  | { type: typeof CLIENT_MSG.JOIN_LOBBY; payload: JoinLobbyPayload }
  | { type: typeof CLIENT_MSG.START_GAME; payload: StartGamePayload }
  | { type: typeof CLIENT_MSG.SUBMIT_RANKING; payload: SubmitRankingPayload }
  | { type: typeof CLIENT_MSG.LEAVE_LOBBY; payload: LeaveLobbyPayload }
  | { type: typeof CLIENT_MSG.UPDATE_CONFIG; payload: UpdateConfigPayload }
  | { type: typeof CLIENT_MSG.NEXT_ROUND; payload: NextRoundPayload };

export type ServerMessage =
  | { type: typeof SERVER_MSG.LOBBY_UPDATE; payload: LobbyUpdatePayload }
  | { type: typeof SERVER_MSG.GAME_STARTED; payload: GameStartedPayload }
  | { type: typeof SERVER_MSG.TIMER_TICK; payload: TimerTickPayload }
  | { type: typeof SERVER_MSG.ROUND_ENDED; payload: RoundEndedPayload }
  | { type: typeof SERVER_MSG.GAME_ENDED; payload: GameEndedPayload }
  | { type: typeof SERVER_MSG.BETWEEN_ROUNDS_TICK; payload: BetweenRoundsTickPayload }
  | { type: typeof SERVER_MSG.REMATCH_COUNTDOWN; payload: RematchCountdownPayload }
  | { type: typeof SERVER_MSG.REMATCH_STARTED; payload: RematchStartedPayload }
  | { type: typeof SERVER_MSG.PLAYER_DISCONNECTED; payload: PlayerDisconnectedPayload }
  | { type: typeof SERVER_MSG.PLAYER_RECONNECTED; payload: PlayerReconnectedPayload }
  | { type: typeof SERVER_MSG.HOST_CHANGED; payload: HostChangedPayload }
  | { type: typeof SERVER_MSG.JOINED_AS_SPECTATOR; payload: JoinedAsSpectatorPayload }
  | { type: typeof SERVER_MSG.ERROR; payload: ErrorPayload }
  | { type: typeof SERVER_MSG.AVATAR_ASSIGNED; payload: AvatarAssignedPayload };
