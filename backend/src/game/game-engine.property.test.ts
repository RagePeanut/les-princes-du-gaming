import * as fc from 'fast-check';
import { GameEngine, GameEngineCallbacks } from './game-engine';
import { ItemStore } from '../items/item-store';
import { Lobby, Player, Item } from '@shared/types';
import { LeaderboardEntry, PlayerScore } from '@shared/ws-messages';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeItems(count: number, category: string): Item[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${category}-item-${i}`,
    displayName: `${category} Item ${i}`,
    imageUrl: `http://img/${category}/${i}`,
    category,
  }));
}

function makePlayer(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    username: `user-${id}`,
    avatarHeadUrl: '',
    avatarAccessoryUrl: null,
    socketId: `sock-${id}`,
    isHost: false,
    isConnected: true,
    isSpectator: false,
    hasCrown: false,
    joinOrder: 0,
    ...overrides,
  };
}

function makeLobby(players: Map<string, Player>, overrides: Partial<Lobby> = {}): Lobby {
  const firstPlayer = players.values().next().value;
  return {
    code: 'TEST01',
    hostId: firstPlayer?.id ?? 'p0',
    players,
    config: { rounds: 1, timerSeconds: 10, timeBetweenRounds: -1, mode: 'random' },
    state: 'waiting',
    gameSession: null,
    gameType: 'ranking',
    tierListSession: null,
    previousWinnerId: null,
    createdAt: Date.now(),
    nextJoinOrder: players.size,
    ...overrides,
  };
}

function makeCallbacks(): GameEngineCallbacks & { calls: Record<string, any[][]> } {
  const calls: Record<string, any[][]> = {
    onTimerTick: [],
    onRoundStart: [],
    onRoundEnd: [],
    onGameEnd: [],
    onRematchCountdown: [],
    onRematchStart: [],
    onBetweenRoundsTick: [],
  };
  return {
    calls,
    onTimerTick: (...args: any[]) => calls.onTimerTick.push(args),
    onRoundStart: (...args: any[]) => calls.onRoundStart.push(args),
    onRoundEnd: (...args: any[]) => calls.onRoundEnd.push(args),
    onGameEnd: (...args: any[]) => calls.onGameEnd.push(args),
    onRematchCountdown: (...args: any[]) => calls.onRematchCountdown.push(args),
    onRematchStart: (...args: any[]) => calls.onRematchStart.push(args),
    onBetweenRoundsTick: (...args: any[]) => calls.onBetweenRoundsTick.push(args),
  } as any;
}

function createItemStore(): ItemStore {
  const items = [
    ...makeItems(30, 'cat-a'),
    ...makeItems(30, 'cat-b'),
  ];
  return new ItemStore(items);
}

// ─── Property 4: Round completion captures current rankings ─────────────────
/**
 * Feature: multiplayer-game-hub, Property 4: Round completion
 *
 * **Validates: Requirements 5.6, 5.7**
 *
 * For any round with N players, when the round ends (either by timer expiry
 * or all players submitting), the recorded rankings for each player SHALL
 * equal their most recent ranking order. If a player never reordered, their
 * recorded ranking SHALL equal the default item order.
 */
describe('Property 4: Round completion captures current rankings', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('recorded rankings match submitted or default order for each player', () => {
    fc.assert(
      fc.property(
        // Generate N players (2-6) and for each, whether they submit a ranking
        fc.integer({ min: 2, max: 6 }).chain((numPlayers) => {
          // For each player, generate a boolean (submits or not)
          const submitFlags = Array.from({ length: numPlayers }, () => fc.boolean());
          return fc.tuple(fc.constant(numPlayers), ...submitFlags);
        }),
        (tuple: [number, ...boolean[]]) => {
          const [numPlayers, ...submitFlags] = tuple;

          // Set up engine
          const itemStore = createItemStore();
          const callbacks = makeCallbacks();
          const engine = new GameEngine(itemStore, callbacks);

          // Create players
          const players = new Map<string, Player>();
          for (let i = 0; i < numPlayers; i++) {
            players.set(`p${i}`, makePlayer(`p${i}`, {
              isHost: i === 0,
              joinOrder: i,
            }));
          }

          const lobby = makeLobby(players, {
            config: { rounds: 1, timerSeconds: 10, timeBetweenRounds: -1, mode: 'random' },
          });

          engine.startGame(lobby);

          const round = lobby.gameSession!.rounds[0];
          const defaultOrder = round.items.map((item) => item.id);

          // Track what each player submitted (or null if they didn't)
          const expectedRankings = new Map<string, string[]>();

          for (let i = 0; i < numPlayers; i++) {
            const playerId = `p${i}`;
            if (submitFlags[i]) {
              // Create a shuffled ranking (reverse the default for a deterministic permutation)
              const shuffled = [...defaultOrder].reverse();
              engine.submitRanking(lobby, playerId, shuffled);
              expectedRankings.set(playerId, shuffled);
            } else {
              // Player doesn't submit — should get default order
              expectedRankings.set(playerId, [...defaultOrder]);
            }
          }

          // If the round hasn't ended yet (not all submitted), expire the timer
          if (!round.isComplete) {
            jest.advanceTimersByTime(10000);
          }

          // Verify round is complete
          expect(round.isComplete).toBe(true);

          // Verify each player's recorded ranking matches expected
          for (let i = 0; i < numPlayers; i++) {
            const playerId = `p${i}`;
            const recorded = round.rankings.get(playerId);
            const expected = expectedRankings.get(playerId);
            expect(recorded).toEqual(expected);
          }
        },
      ),
      { numRuns: 20 },
    );
  });
});

// ─── Property 11: Rematch lobby membership, crown assignment, and spectator promotion ──
/**
 * Feature: multiplayer-game-hub, Property 11: Rematch membership
 *
 * **Validates: Requirements 10.2, 10.4, 10.5, 10.6, 10.7**
 *
 * For any set of players (including spectators) at rematch countdown expiry,
 * the new game SHALL include exactly the players who remained connected.
 * All spectators SHALL be promoted to active participants (isSpectator = false).
 * If the previous game's winner is among the connected players, that player's
 * hasCrown SHALL be true; all other players' hasCrown SHALL be false.
 * The rematch SHALL start automatically without requiring a START_GAME message
 * from the host.
 */
describe('Property 11: Rematch lobby membership, crown assignment, and spectator promotion', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('connected players included, spectators promoted, crown assigned to previous winner', () => {
    fc.assert(
      fc.property(
        // Generate N players (2-6), each with connection status and spectator status
        fc.integer({ min: 2, max: 6 }).chain((numPlayers) => {
          const playerConfigs = Array.from({ length: numPlayers }, () =>
            fc.record({
              isConnected: fc.boolean(),
              isSpectator: fc.boolean(),
            }),
          );
          // Also generate which player index (if any) is the previous winner
          // Use -1 to mean "winner left the lobby" (not among current players)
          const winnerIndex = fc.integer({ min: -1, max: numPlayers - 1 });
          return fc.tuple(fc.constant(numPlayers), winnerIndex, ...playerConfigs);
        }),
        // Ensure at least 1 connected player so rematch can proceed
        (tuple: [number, number, ...{ isConnected: boolean; isSpectator: boolean }[]]) => {
          const [numPlayers, winnerIndex, ...playerConfigs] = tuple;

          // Ensure at least one player is connected
          const hasConnected = playerConfigs.some((p) => p.isConnected);
          if (!hasConnected) return; // skip this case — no connected players

          const itemStore = createItemStore();
          const callbacks = makeCallbacks();
          const engine = new GameEngine(itemStore, callbacks);

          // Build players map
          const players = new Map<string, Player>();
          for (let i = 0; i < numPlayers; i++) {
            players.set(`p${i}`, makePlayer(`p${i}`, {
              isHost: i === 0,
              joinOrder: i,
              isConnected: playerConfigs[i].isConnected,
              isSpectator: playerConfigs[i].isSpectator,
              hasCrown: false,
            }));
          }

          const previousWinnerId = winnerIndex >= 0 ? `p${winnerIndex}` : 'left-player';

          const lobby = makeLobby(players, {
            previousWinnerId,
            state: 'results',
            config: { rounds: 1, timerSeconds: 10, timeBetweenRounds: -1, mode: 'random' },
          });

          // Snapshot which players are connected before rematch
          const connectedPlayerIds = new Set<string>();
          for (const [id, player] of lobby.players) {
            if (player.isConnected) {
              connectedPlayerIds.add(id);
            }
          }

          // Start rematch
          engine.startRematch(lobby);

          // 1. Verify membership: only connected players remain
          const remainingIds = new Set(lobby.players.keys());
          expect(remainingIds).toEqual(connectedPlayerIds);

          // 2. Verify all spectators are promoted
          for (const [, player] of lobby.players) {
            expect(player.isSpectator).toBe(false);
          }

          // 3. Verify crown assignment
          for (const [playerId, player] of lobby.players) {
            if (playerId === previousWinnerId) {
              expect(player.hasCrown).toBe(true);
            } else {
              expect(player.hasCrown).toBe(false);
            }
          }

          // 4. Verify rematch started automatically (onRematchStart was called, not onRoundStart)
          expect(callbacks.calls.onRematchStart.length).toBeGreaterThanOrEqual(1);

          // 5. Verify game session was created and is playing
          expect(lobby.state).toBe('playing');
          expect(lobby.gameSession).not.toBeNull();
          expect(lobby.gameSession!.rounds).toHaveLength(1);
        },
      ),
      { numRuns: 20 },
    );
  });
});
