import * as fc from 'fast-check';
import {
  LobbyManager,
  validateGameConfig,
  buildFullConfig,
  DEFAULT_CONFIG,
  ValidationResult,
} from './lobby-manager';
import { LobbyState } from '@shared/types';

// ─── Property 1: GameConfig validation accepts valid ranges and rejects invalid ranges ──
/**
 * Feature: multiplayer-game-hub, Property 1: GameConfig validation
 *
 * **Validates: Requirements 2.4, 2.5**
 *
 * For any integer `rounds`, the validation SHALL accept it if and only if
 * `1 <= rounds <= 20`. For any integer `timerSeconds`, the validation SHALL
 * accept it if and only if `5 <= timerSeconds <= 120`. When `timerSeconds`
 * is omitted, it SHALL default to 15.
 */
describe('Property 1: GameConfig validation accepts valid ranges and rejects invalid ranges', () => {
  it('accepts rounds if and only if 1 <= rounds <= 20', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000, max: 1000 }), (rounds: number) => {
        const result = validateGameConfig({ rounds });
        const isInRange = rounds >= 1 && rounds <= 20;

        if (isInRange) {
          expect(result.valid).toBe(true);
          expect(result.errors).toHaveLength(0);
        } else {
          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 20 },
    );
  });

  it('accepts timerSeconds if and only if timerSeconds is -1 or 5 <= timerSeconds <= 120', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000, max: 1000 }), (timerSeconds: number) => {
        const result = validateGameConfig({ timerSeconds });
        const isValid = timerSeconds === -1 || (timerSeconds >= 5 && timerSeconds <= 120);

        if (isValid) {
          expect(result.valid).toBe(true);
          expect(result.errors).toHaveLength(0);
        } else {
          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 20 },
    );
  });

  it('defaults timerSeconds to 30 when omitted', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.constantFrom<'category' | 'random'>('category', 'random'),
        (rounds: number, mode: 'category' | 'random') => {
          const config = buildFullConfig({ rounds, mode });
          expect(config.timerSeconds).toBe(30);
          expect(config.rounds).toBe(rounds);
          expect(config.mode).toBe(mode);
        },
      ),
      { numRuns: 20 },
    );
  });
});

// ─── Property 13: Spectator assignment based on join timing ─────────────────
/**
 * Feature: multiplayer-game-hub, Property 13: Spectator assignment
 *
 * **Validates: Requirements 3.3, 3.4**
 *
 * For any player joining a lobby, if the lobby state is 'waiting', the player's
 * isSpectator SHALL be false (active participant). If the lobby state is
 * 'playing', 'round_results', or 'results', the player's isSpectator SHALL be
 * true (spectator).
 */
describe('Property 13: Spectator assignment based on join timing', () => {
  it('players joining in waiting state are active; players joining in other states are spectators', () => {
    const spectatorStates: LobbyState[] = ['playing', 'round_results', 'results'];
    const allTestStates: LobbyState[] = ['waiting', ...spectatorStates];

    fc.assert(
      fc.property(
        fc.constantFrom(...allTestStates),
        fc.string({ minLength: 1, maxLength: 20 }),
        (state: LobbyState, username: string) => {
          const manager = new LobbyManager();
          const lobby = manager.createLobby();

          // First player joins in waiting state (becomes host)
          manager.joinLobby(lobby.code, 'Host');

          // Set lobby to the target state before the test player joins
          lobby.state = state;

          const player = manager.joinLobby(lobby.code, username);

          if (state === 'waiting') {
            expect(player.isSpectator).toBe(false);
          } else {
            expect(player.isSpectator).toBe(true);
          }

          manager.destroyLobby(lobby.code);
        },
      ),
      { numRuns: 20 },
    );
  });
});

// ─── Property 14: Host reassignment follows join order ──────────────────────
/**
 * Feature: multiplayer-game-hub, Property 14: Host reassignment
 *
 * **Validates: Requirements 12.1, 12.4**
 *
 * For any lobby with N players (N >= 2), when the current host leaves, the
 * player with the lowest joinOrder among remaining connected players SHALL
 * become the new host. The lobby state and game session SHALL remain unchanged
 * by the reassignment.
 */
describe('Property 14: Host reassignment follows join order', () => {
  it('lowest joinOrder connected player becomes host when current host leaves', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        fc.constantFrom<LobbyState>('waiting', 'playing', 'round_results', 'results'),
        (numPlayers: number, lobbyState: LobbyState) => {
          const manager = new LobbyManager();
          const lobby = manager.createLobby();

          // Join N players
          const players = [];
          for (let i = 0; i < numPlayers; i++) {
            players.push(manager.joinLobby(lobby.code, `Player${i}`));
          }

          // Set lobby state to test that it remains unchanged
          lobby.state = lobbyState;
          const originalState = lobby.state;
          const originalGameSession = lobby.gameSession;

          // The first player is the host
          const host = players[0];
          expect(host.isHost).toBe(true);
          expect(lobby.hostId).toBe(host.id);

          // Remove the host
          const newHost = manager.leaveLobby(lobby.code, host.id);

          // Find the expected new host: lowest joinOrder among remaining connected
          const remainingConnected = players
            .slice(1) // host was removed
            .filter((p) => p.isConnected)
            .sort((a, b) => a.joinOrder - b.joinOrder);

          expect(newHost).not.toBeNull();
          expect(newHost!.id).toBe(remainingConnected[0].id);
          expect(newHost!.isHost).toBe(true);
          expect(lobby.hostId).toBe(remainingConnected[0].id);

          // Lobby state and game session remain unchanged
          expect(lobby.state).toBe(originalState);
          expect(lobby.gameSession).toBe(originalGameSession);

          manager.destroyLobby(lobby.code);
        },
      ),
      { numRuns: 20 },
    );
  });
});
