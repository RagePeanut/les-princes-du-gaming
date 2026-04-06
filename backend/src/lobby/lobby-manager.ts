// Lobby Manager Module
// Creates/destroys lobbies, manages player join/leave, host reassignment,
// config updates, and spectator assignment based on lobby state.

import { v4 as uuidv4 } from 'uuid';
import { GameConfig, Lobby, LobbyState, Player } from '../../../shared/types';
import { generateAvatar } from '../avatar/avatar-generator';

// ─── GameConfig Validation ──────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export const DEFAULT_CONFIG: GameConfig = {
  rounds: 5,
  timerSeconds: 15,
  timeBetweenRounds: -1,
  mode: 'random',
};

export function validateGameConfig(config: Partial<GameConfig>): ValidationResult {
  const errors: string[] = [];

  if (config.rounds !== undefined) {
    if (typeof config.rounds !== 'number' || !Number.isInteger(config.rounds)) {
      errors.push('rounds must be an integer');
    } else if (config.rounds < 1 || config.rounds > 20) {
      errors.push('rounds must be between 1 and 20');
    }
  }

  if (config.timerSeconds !== undefined) {
    if (typeof config.timerSeconds !== 'number' || !Number.isInteger(config.timerSeconds)) {
      errors.push('timerSeconds must be an integer');
    } else if (config.timerSeconds !== -1 && (config.timerSeconds < 5 || config.timerSeconds > 120)) {
      errors.push('timerSeconds must be -1 or between 5 and 120');
    }
  }

  if (config.timeBetweenRounds !== undefined) {
    if (typeof config.timeBetweenRounds !== 'number' || !Number.isInteger(config.timeBetweenRounds)) {
      errors.push('timeBetweenRounds must be an integer');
    } else if (config.timeBetweenRounds < -1 || config.timeBetweenRounds > 60) {
      errors.push('timeBetweenRounds must be between -1 and 60');
    }
  }

  if (config.mode !== undefined) {
    if (config.mode !== 'category' && config.mode !== 'random') {
      errors.push("mode must be 'category' or 'random'");
    }
  }

  return { valid: errors.length === 0, errors };
}

export function buildFullConfig(partial: Partial<GameConfig>): GameConfig {
  return {
    rounds: partial.rounds ?? DEFAULT_CONFIG.rounds,
    timerSeconds: partial.timerSeconds ?? DEFAULT_CONFIG.timerSeconds,
    timeBetweenRounds: partial.timeBetweenRounds ?? DEFAULT_CONFIG.timeBetweenRounds,
    mode: partial.mode ?? DEFAULT_CONFIG.mode,
  };
}

// ─── Lobby Code Generation ──────────────────────────────────────────────────

const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const CODE_LENGTH = 6;

function generateLobbyCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

// ─── Spectator State Logic ──────────────────────────────────────────────────

const SPECTATOR_STATES: LobbyState[] = ['playing', 'round_results', 'results'];

function shouldBeSpectator(state: LobbyState): boolean {
  return SPECTATOR_STATES.includes(state);
}

// ─── LobbyManager ───────────────────────────────────────────────────────────

export class LobbyManager {
  private lobbies: Map<string, Lobby> = new Map();
  private usedAvatarCombinations: Map<string, Set<string>> = new Map();

  /**
   * Creates a new lobby with the given config.
   * Generates a unique 6-char alphanumeric code.
   */
  createLobby(config: Partial<GameConfig> = {}): Lobby {
    const validation = validateGameConfig(config);
    if (!validation.valid) {
      throw new Error(validation.errors.join('; '));
    }

    const fullConfig = buildFullConfig(config);

    // Generate unique code
    let code: string;
    do {
      code = generateLobbyCode();
    } while (this.lobbies.has(code));

    const lobby: Lobby = {
      code,
      hostId: '',
      players: new Map(),
      config: fullConfig,
      state: 'waiting',
      gameSession: null,
      previousWinnerId: null,
      createdAt: Date.now(),
      nextJoinOrder: 0,
    };

    this.lobbies.set(code, lobby);
    this.usedAvatarCombinations.set(code, new Set());

    return lobby;
  }

  /**
   * Adds a player to the lobby. Assigns avatar, sets spectator status
   * based on lobby state, and assigns host if first player.
   */
  joinLobby(code: string, username: string, socketId: string = ''): Player {
    const lobby = this.lobbies.get(code);
    if (!lobby) {
      throw new Error('Lobby not found');
    }

    const usedCombinations = this.usedAvatarCombinations.get(code)!;
    const avatarResult = generateAvatar(usedCombinations);

    const isFirstPlayer = lobby.players.size === 0;
    const isSpectator = shouldBeSpectator(lobby.state);

    const player: Player = {
      id: uuidv4(),
      username,
      avatarDataUri: avatarResult.dataUri,
      socketId,
      isHost: isFirstPlayer,
      isConnected: true,
      isSpectator,
      hasCrown: false,
      joinOrder: lobby.nextJoinOrder++,
    };

    if (isFirstPlayer) {
      lobby.hostId = player.id;
    }

    lobby.players.set(player.id, player);

    return player;
  }

  /**
   * Removes a player from the lobby. Handles host reassignment
   * to the next player by lowest joinOrder among remaining connected players.
   * Returns the new host player if reassignment occurred, or null.
   */
  leaveLobby(code: string, playerId: string): Player | null {
    const lobby = this.lobbies.get(code);
    if (!lobby) {
      throw new Error('Lobby not found');
    }

    const player = lobby.players.get(playerId);
    if (!player) {
      throw new Error('Player not found in lobby');
    }

    lobby.players.delete(playerId);

    // If lobby is now empty, destroy it
    if (lobby.players.size === 0) {
      this.destroyLobby(code);
      return null;
    }

    // Handle host reassignment if the leaving player was the host
    if (player.isHost) {
      return this.reassignHost(lobby);
    }

    return null;
  }

  /**
   * Reassigns host to the connected player with the lowest joinOrder.
   */
  private reassignHost(lobby: Lobby): Player | null {
    const connectedPlayers = Array.from(lobby.players.values())
      .filter(p => p.isConnected)
      .sort((a, b) => a.joinOrder - b.joinOrder);

    if (connectedPlayers.length === 0) {
      return null;
    }

    const newHost = connectedPlayers[0];
    newHost.isHost = true;
    lobby.hostId = newHost.id;

    return newHost;
  }

  /**
   * Returns the lobby for the given code, or undefined if not found.
   */
  getLobby(code: string): Lobby | undefined {
    return this.lobbies.get(code);
  }

  /**
   * Destroys a lobby and cleans up avatar tracking.
   */
  destroyLobby(code: string): void {
    this.lobbies.delete(code);
    this.usedAvatarCombinations.delete(code);
  }

  /**
   * Updates lobby config. Only the host can update config.
   * Validates the partial config before applying.
   */
  updateConfig(code: string, hostId: string, partialConfig: Partial<GameConfig>): GameConfig {
    const lobby = this.lobbies.get(code);
    if (!lobby) {
      throw new Error('Lobby not found');
    }

    if (lobby.hostId !== hostId) {
      throw new Error('Only the host can update settings.');
    }

    const validation = validateGameConfig(partialConfig);
    if (!validation.valid) {
      throw new Error(validation.errors.join('; '));
    }
	
    // Merge partial config into existing config
    if (partialConfig.rounds !== undefined) {
      lobby.config.rounds = partialConfig.rounds;
    }
    if (partialConfig.timerSeconds !== undefined) {
      lobby.config.timerSeconds = partialConfig.timerSeconds;
    }
    if (partialConfig.timeBetweenRounds !== undefined) {
      lobby.config.timeBetweenRounds = partialConfig.timeBetweenRounds;
    }
    if (partialConfig.mode !== undefined) {
      lobby.config.mode = partialConfig.mode;
    }

    return lobby.config;
  }
}
