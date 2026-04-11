// WebSocket message type constants and payload interfaces
// Used by both backend and frontend

import { GameConfig, Item, LobbyState, Player, TierListResult, TierName } from './types';

// ─── Message Type Constants ─────────────────────────────────────────────────

// Client → Server
export const CLIENT_MSG = {
  JOIN_LOBBY: 'JOIN_LOBBY',
  START_GAME: 'START_GAME',
  SUBMIT_RANKING: 'SUBMIT_RANKING',
  LEAVE_LOBBY: 'LEAVE_LOBBY',
  UPDATE_CONFIG: 'UPDATE_CONFIG',
  NEXT_ROUND: 'NEXT_ROUND',
  SUBMIT_TIER_VOTE: 'SUBMIT_TIER_VOTE',
  SKIP_CATEGORY: 'SKIP_CATEGORY',
  REROLL_AVATAR: 'REROLL_AVATAR',
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
  TIERLIST_ROULETTE_START: 'TIERLIST_ROULETTE_START',
  TIERLIST_ROULETTE_RESULT: 'TIERLIST_ROULETTE_RESULT',
  TIERLIST_ROUND_START: 'TIERLIST_ROUND_START',
  TIERLIST_VOTE_STATUS: 'TIERLIST_VOTE_STATUS',
  TIERLIST_SUSPENSE_START: 'TIERLIST_SUSPENSE_START',
  TIERLIST_ROUND_RESULT: 'TIERLIST_ROUND_RESULT',
  TIERLIST_GAME_ENDED: 'TIERLIST_GAME_ENDED',
} as const;

// ─── Shared Result Types ────────────────────────────────────────────────────

export interface PlayerScore {
  playerId: string;
  username: string;
  avatarHeadUrl: string;
  avatarAccessoryUrl: string | null;
  score: number;
}

export interface LeaderboardEntry {
  playerId: string;
  username: string;
  avatarHeadUrl: string;
  avatarAccessoryUrl: string | null;
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

export interface SubmitTierVotePayload {
  lobbyCode: string;
  roundIndex: number;
  tier: string;
  confirmed?: boolean;
}

export interface SkipCategoryPayload {
  lobbyCode: string;
}

export interface RerollAvatarPayload {
  lobbyCode: string;
}

// ─── Tier List Shared Types ─────────────────────────────────────────────────

export interface PlayerTierVote {
  playerId: string;
  username: string;
  avatarHeadUrl: string;
  avatarAccessoryUrl: string | null;
  votedTier: TierName;
}

export interface PlayerProximityScore {
  playerId: string;
  username: string;
  avatarHeadUrl: string;
  avatarAccessoryUrl: string | null;
  score: number;
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
  avatarHeadUrl: string;
  avatarAccessoryUrl: string | null;
}

// ─── Tier List Server → Client Payloads ─────────────────────────────────────

export interface TierListRouletteStartPayload {
  themes: string[];
}

export interface TierListRouletteResultPayload {
  theme: string;
  items: Item[];
}

export interface TierListRoundStartPayload {
  roundIndex: number;
  item: Item;
  totalItems: number;
  timerSeconds: number;
}

export interface TierListVoteStatusPayload {
  playerId: string;
  hasVoted: boolean;
}

export interface TierListSuspenseStartPayload {
  roundIndex: number;
}

export interface TierListRoundResultPayload {
  roundIndex: number;
  item: Item;
  finalTier: TierName;
  averageValue: number;
  votes: PlayerTierVote[];
  scores: PlayerProximityScore[];
  leaderboard: LeaderboardEntry[];
}

export interface TierListGameEndedPayload {
  tierList: TierListResult;
  leaderboard: LeaderboardEntry[];
  winnerId: string;
  isTie: boolean;
}

// ─── Typed Message Interfaces ───────────────────────────────────────────────

export type ClientMessage =
  | { type: typeof CLIENT_MSG.JOIN_LOBBY; payload: JoinLobbyPayload }
  | { type: typeof CLIENT_MSG.START_GAME; payload: StartGamePayload }
  | { type: typeof CLIENT_MSG.SUBMIT_RANKING; payload: SubmitRankingPayload }
  | { type: typeof CLIENT_MSG.LEAVE_LOBBY; payload: LeaveLobbyPayload }
  | { type: typeof CLIENT_MSG.UPDATE_CONFIG; payload: UpdateConfigPayload }
  | { type: typeof CLIENT_MSG.NEXT_ROUND; payload: NextRoundPayload }
  | { type: typeof CLIENT_MSG.SUBMIT_TIER_VOTE; payload: SubmitTierVotePayload }
  | { type: typeof CLIENT_MSG.SKIP_CATEGORY; payload: SkipCategoryPayload }
  | { type: typeof CLIENT_MSG.REROLL_AVATAR; payload: RerollAvatarPayload };

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
  | { type: typeof SERVER_MSG.AVATAR_ASSIGNED; payload: AvatarAssignedPayload }
  | { type: typeof SERVER_MSG.TIERLIST_ROULETTE_START; payload: TierListRouletteStartPayload }
  | { type: typeof SERVER_MSG.TIERLIST_ROULETTE_RESULT; payload: TierListRouletteResultPayload }
  | { type: typeof SERVER_MSG.TIERLIST_ROUND_START; payload: TierListRoundStartPayload }
  | { type: typeof SERVER_MSG.TIERLIST_VOTE_STATUS; payload: TierListVoteStatusPayload }
  | { type: typeof SERVER_MSG.TIERLIST_SUSPENSE_START; payload: TierListSuspenseStartPayload }
  | { type: typeof SERVER_MSG.TIERLIST_ROUND_RESULT; payload: TierListRoundResultPayload }
  | { type: typeof SERVER_MSG.TIERLIST_GAME_ENDED; payload: TierListGameEndedPayload };
