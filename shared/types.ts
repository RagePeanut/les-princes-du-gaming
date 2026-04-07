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

export type LobbyState = 'waiting' | 'playing' | 'round_results' | 'results' | 'rematch_countdown' | 'roulette' | 'suspense';

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

// --- Tier List Game Types ---

export type TierName = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

export const TIER_VALUES: Record<TierName, number> = {
  S: 6, A: 5, B: 4, C: 3, D: 2, F: 1
};

export const TIER_COLORS: Record<TierName, string> = {
  S: '#FF7F7F', A: '#FFBF7F', B: '#FFDF7F',
  C: '#BFFF7F', D: '#7FBFFF', F: '#FF7FBF'
};

export const TIER_THRESHOLDS: { tier: TierName; minAverage: number }[] = [
  { tier: 'S', minAverage: 5.5 },
  { tier: 'A', minAverage: 4.5 },
  { tier: 'B', minAverage: 3.5 },
  { tier: 'C', minAverage: 2.5 },
  { tier: 'D', minAverage: 1.5 },
  { tier: 'F', minAverage: -Infinity },
];

export interface TierListRoundData {
  roundIndex: number;
  item: Item;
  votes: Map<string, TierName>;
  averageValue: number;
  finalTier: TierName;
  scores: Map<string, number>;
  timerStartedAt: number;
  isComplete: boolean;
}

export interface TierListGameSession {
  theme: string;
  items: Item[];
  currentRound: number;
  totalRounds: number;
  rounds: TierListRoundData[];
  cumulativeScores: Map<string, number>;
  tierListResult: Map<TierName, Item[]>;
}

export interface TierListResult {
  tiers: {
    tier: TierName;
    color: string;
    items: Item[];
  }[];
}

export interface Lobby {
  code: string;
  hostId: string;
  players: Map<string, Player>;
  config: GameConfig;
  state: LobbyState;
  gameSession: GameSession | null;
  gameType: 'ranking' | 'tierlist';
  tierListSession: TierListGameSession | null;
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
