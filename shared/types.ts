// Shared TypeScript interfaces for Multiplayer Game Hub
// These interfaces are used by both backend and frontend

export interface Player {
  id: string;
  username: string;
  avatarDataUri: string;
  socketId: string;
  isHost: boolean;
  isConnected: boolean;
  isSpectator: boolean;
  hasCrown: boolean;
  joinOrder: number;
}

export type LobbyState = 'waiting' | 'playing' | 'round_results' | 'results' | 'rematch_countdown';

export interface GameConfig {
  rounds: number;
  /** -1 = no time limit, 5-120 = round timer in seconds */
  timerSeconds: number;
  /** -1 = disabled (host advances manually), 0 = immediate, 1-60 = delay in seconds */
  timeBetweenRounds: number;
  mode: 'category' | 'random';
}

export interface Item {
  id: string;
  displayName: string;
  imageUrl: string;
  category: string;
}

export interface RoundData {
  roundIndex: number;
  items: Item[];
  rankings: Map<string, string[]>;
  averageRanking: string[];
  scores: Map<string, number>;
  timerStartedAt: number;
  isComplete: boolean;
}

export interface GameSession {
  currentRound: number;
  totalRounds: number;
  rounds: RoundData[];
  usedItemIds: Set<string>;
  cumulativeScores: Map<string, number>;
}

export interface Lobby {
  code: string;
  hostId: string;
  players: Map<string, Player>;
  config: GameConfig;
  state: LobbyState;
  gameSession: GameSession | null;
  previousWinnerId: string | null;
  createdAt: number;
  nextJoinOrder: number;
}

export interface GameCard {
  id: string;
  title: string;
  imageUrl: string;
  isExternal: boolean;
  externalUrl?: string;
  routePath?: string;
}

export interface WSMessage {
  type: string;
  payload: Record<string, unknown>;
}
