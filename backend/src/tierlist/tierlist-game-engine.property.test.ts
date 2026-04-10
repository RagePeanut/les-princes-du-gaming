import * as fc from 'fast-check';
import { TierListGameEngine, TierListGameEngineCallbacks } from './tierlist-game-engine';
import { ItemStore } from '../items/item-store';
import { Lobby, Player, Item, TierName, TierListGameSession } from '@shared/types';

// ─── Mock timer-manager to execute synchronously ────────────────────────────

jest.mock('../game/timer-manager', () => {
  const timers = new Map<string, { onTick: (s: number) => void; onExpiry: () => void; duration: number }>();
  return {
    startTimer: (key: string, duration: number, onTick: (s: number) => void, onExpiry: () => void) => {
      timers.set(key, { onTick, onExpiry, duration });
      // Auto-fire expiry for roulette and suspense timers so startGame flows through
      if (key.startsWith('roulette:') || key.startsWith('rouletteEnd:') || key.startsWith('suspense:') || key.startsWith('betweenRounds:')) {
        onExpiry();
      }
    },
    stopTimer: (key: string) => {
      timers.delete(key);
    },
    getRemaining: (key: string) => 0,
    __getTimers: () => timers,
  };
});

// ─── Helpers ────────────────────────────────────────────────────────────────

const ALL_TIERS: TierName[] = ['S', 'A', 'B', 'C', 'D', 'F'];

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
    config: { rounds: 1, timerSeconds: 30, timeBetweenRounds: 0, mode: 'category' },
    state: 'waiting',
    gameSession: null,
    gameType: 'tierlist',
    tierListSession: null,
    previousWinnerId: null,
    createdAt: Date.now(),
    nextJoinOrder: players.size,
    ...overrides,
  };
}

function makeCallbacks(): TierListGameEngineCallbacks & { calls: Record<string, any[][]> } {
  const calls: Record<string, any[][]> = {
    onRouletteStart: [],
    onRouletteResult: [],
    onTierListRoundStart: [],
    onVoteStatus: [],
    onSuspenseStart: [],
    onTierListRoundResult: [],
    onTierListGameEnded: [],
    onTimerTick: [],
    onRematchCountdown: [],
  };
  return {
    calls,
    onRouletteStart: (...args: any[]) => calls.onRouletteStart.push(args),
    onRouletteResult: (...args: any[]) => calls.onRouletteResult.push(args),
    onTierListRoundStart: (...args: any[]) => calls.onTierListRoundStart.push(args),
    onVoteStatus: (...args: any[]) => calls.onVoteStatus.push(args),
    onSuspenseStart: (...args: any[]) => calls.onSuspenseStart.push(args),
    onTierListRoundResult: (...args: any[]) => calls.onTierListRoundResult.push(args),
    onTierListGameEnded: (...args: any[]) => calls.onTierListGameEnded.push(args),
    onTimerTick: (...args: any[]) => calls.onTimerTick.push(args),
    onRematchCountdown: (...args: any[]) => calls.onRematchCountdown.push(args),
  } as any;
}

/**
 * Arbitrary: generates a number of categories (1-4), each with a random item count (3-15).
 * Returns an ItemStore and the raw category data.
 */
function arbItemStore(): fc.Arbitrary<{ itemStore: ItemStore; categories: { name: string; count: number }[] }> {
  return fc.integer({ min: 1, max: 4 }).chain((numCats) => {
    const catArbs = Array.from({ length: numCats }, (_, i) =>
      fc.integer({ min: 3, max: 15 }).map((count) => ({
        name: `cat-${i}`,
        count,
      })),
    );
    return fc.tuple(...catArbs).map((cats) => {
      const allItems: Item[] = [];
      for (const cat of cats) {
        allItems.push(...makeItems(cat.count, cat.name));
      }
      return { itemStore: new ItemStore(allItems), categories: cats };
    });
  });
}

/**
 * Arbitrary: generates an ItemStore guaranteed to have at least one category with ≥5 items.
 */
function arbItemStoreWithEligible(): fc.Arbitrary<{ itemStore: ItemStore; categories: { name: string; count: number }[] }> {
  return fc.integer({ min: 1, max: 3 }).chain((numExtraCats) => {
    // At least one category with ≥5 items
    const eligibleCount = fc.integer({ min: 5, max: 15 });
    const extraCatArbs = Array.from({ length: numExtraCats }, (_, i) =>
      fc.integer({ min: 1, max: 15 }).map((count) => ({
        name: `extra-${i}`,
        count,
      })),
    );
    return fc.tuple(eligibleCount, ...extraCatArbs).map(([mainCount, ...extras]: [number, ...{ name: string; count: number }[]]) => {
      const cats = [{ name: 'main-cat', count: mainCount }, ...extras];
      const allItems: Item[] = [];
      for (const cat of cats) {
        allItems.push(...makeItems(cat.count, cat.name));
      }
      return { itemStore: new ItemStore(allItems), categories: cats };
    });
  });
}

function arbTier(): fc.Arbitrary<TierName> {
  return fc.constantFrom(...ALL_TIERS);
}

/**
 * Creates N players (2-6) as a Map.
 */
function arbPlayers(): fc.Arbitrary<Map<string, Player>> {
  return fc.integer({ min: 2, max: 6 }).map((n) => {
    const players = new Map<string, Player>();
    for (let i = 0; i < n; i++) {
      players.set(`p${i}`, makePlayer(`p${i}`, { isHost: i === 0, joinOrder: i }));
    }
    return players;
  });
}

// ─── Property 1: Theme selection validity ────────────────────────────────────
/**
 * Feature: tier-list-voting-game, Property 1: Theme selection validity
 *
 * **Validates: Requirements 1.5, 1.6, 14.2**
 *
 * For any item store and any theme selection, the selected theme SHALL be an
 * existing category in the item store AND that category SHALL contain at minimum
 * 5 items. The list of available themes for the roulette SHALL be exactly the
 * set of categories with ≥5 items.
 */
describe('Property 1: Theme selection validity', () => {
  it('selected theme is an eligible category with ≥5 items and roulette themes match eligible set', () => {
    fc.assert(
      fc.property(arbItemStoreWithEligible(), arbPlayers(), ({ itemStore, categories }, players) => {
        const callbacks = makeCallbacks();
        const engine = new TierListGameEngine(itemStore, callbacks);
        // Force category mode for this test since it validates category-based theme selection
        const lobby = makeLobby(players, { config: { rounds: 1, timerSeconds: 30, timeBetweenRounds: 0, mode: 'category' } });

        engine.startGame(lobby);

        // Compute expected eligible categories independently
        const expectedEligible = new Set(
          categories.filter((c) => c.count >= 5).map((c) => c.name),
        );

        // 1. The roulette was called with exactly the eligible categories
        expect(callbacks.calls.onRouletteStart.length).toBeGreaterThanOrEqual(1);
        const rouletteThemes = new Set<string>(callbacks.calls.onRouletteStart[0][1] as string[]);
        expect(rouletteThemes).toEqual(expectedEligible);

        // 2. The selected theme is in the eligible set
        const session = lobby.tierListSession!;
        expect(expectedEligible.has(session.theme)).toBe(true);

        // 3. The selected theme has ≥5 items
        expect(itemStore.getItemsByCategory(session.theme).length).toBeGreaterThanOrEqual(5);
      }),
      { numRuns: 100 },
    );
  });

  it('random mode picks 15 items across categories and skips roulette', () => {
    fc.assert(
      fc.property(arbItemStoreWithEligible(), arbPlayers(), ({ itemStore }, players) => {
        const callbacks = makeCallbacks();
        const engine = new TierListGameEngine(itemStore, callbacks);
        const lobby = makeLobby(players, { config: { rounds: 1, timerSeconds: 30, timeBetweenRounds: 0, mode: 'random' } });

        const allItems = itemStore.getAllItems();
        if (allItems.length < 15) return; // skip if not enough items

        engine.startGame(lobby);

        const session = lobby.tierListSession!;

        // 1. Roulette is skipped
        expect(callbacks.calls.onRouletteStart.length).toBe(0);
        expect(callbacks.calls.onRouletteResult.length).toBeGreaterThanOrEqual(1);

        // 2. Theme is 'random'
        expect(session.theme).toBe('random');

        // 3. 15 items selected
        expect(session.items.length).toBe(15);
        expect(session.totalRounds).toBe(15);

        // 4. All items are valid (exist in the store)
        const allIds = new Set(allItems.map((i) => i.id));
        for (const item of session.items) {
          expect(allIds.has(item.id)).toBe(true);
        }

        // 5. No duplicate items
        const sessionIds = new Set(session.items.map((i) => i.id));
        expect(sessionIds.size).toBe(15);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 2: Theme items completeness and permutation ────────────────────
/**
 * Feature: tier-list-voting-game, Property 2: Theme items completeness
 *
 * **Validates: Requirements 8.2, 8.3, 14.3**
 *
 * For any selected theme, the game session SHALL contain exactly all items from
 * the corresponding category, and the presentation order SHALL be a valid
 * permutation (same set of items, potentially different order). The total number
 * of rounds SHALL equal the number of items in the theme.
 */
describe('Property 2: Theme items completeness and permutation', () => {
  it('session items are a valid permutation of the theme category items and totalRounds matches', () => {
    fc.assert(
      fc.property(arbItemStoreWithEligible(), arbPlayers(), ({ itemStore }, players) => {
        const callbacks = makeCallbacks();
        const engine = new TierListGameEngine(itemStore, callbacks);
        // Force category mode for this test since it validates category-based item selection
        const lobby = makeLobby(players, { config: { rounds: 1, timerSeconds: 30, timeBetweenRounds: 0, mode: 'category' } });

        engine.startGame(lobby);

        const session = lobby.tierListSession!;
        const originalItems = itemStore.getItemsByCategory(session.theme);

        // 1. Session items have the same length as the category
        expect(session.items.length).toBe(originalItems.length);

        // 2. Session items are a permutation (same set of IDs)
        const sessionIds = new Set(session.items.map((i) => i.id));
        const originalIds = new Set(originalItems.map((i) => i.id));
        expect(sessionIds).toEqual(originalIds);

        // 3. Total rounds equals number of items
        expect(session.totalRounds).toBe(originalItems.length);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 3: Score initialization at zero ────────────────────────────────
/**
 * Feature: tier-list-voting-game, Property 3: Score initialization
 *
 * **Validates: Requirements 2.4**
 *
 * For any set of active players at the start of a game, all cumulative scores
 * SHALL be initialized to 0.
 */
describe('Property 3: Score initialization at zero', () => {
  it('all active (non-spectator) players have cumulative score 0 after startGame', () => {
    fc.assert(
      fc.property(
        arbItemStoreWithEligible(),
        fc.integer({ min: 2, max: 6 }).chain((n) => {
          // For each player, randomly decide if they are a spectator
          const spectatorFlags = Array.from({ length: n }, () => fc.boolean());
          return fc.tuple(fc.constant(n), ...spectatorFlags);
        }),
        ({ itemStore }, tuple: [number, ...boolean[]]) => {
          const [numPlayers, ...spectatorFlags] = tuple;

          // Ensure at least 1 non-spectator
          const hasActive = spectatorFlags.some((s) => !s);
          if (!hasActive) return;

          const players = new Map<string, Player>();
          for (let i = 0; i < numPlayers; i++) {
            players.set(`p${i}`, makePlayer(`p${i}`, {
              isHost: i === 0,
              joinOrder: i,
              isSpectator: spectatorFlags[i],
            }));
          }

          const callbacks = makeCallbacks();
          const engine = new TierListGameEngine(itemStore, callbacks);
          const lobby = makeLobby(players);

          engine.startGame(lobby);

          const session = lobby.tierListSession!;

          // 1. Every active (non-spectator) player has a cumulative score of 0
          for (const [playerId, player] of players) {
            if (!player.isSpectator) {
              expect(session.cumulativeScores.has(playerId)).toBe(true);
              expect(session.cumulativeScores.get(playerId)).toBe(0);
            }
          }

          // 2. Spectators do NOT have a cumulative score entry
          for (const [playerId, player] of players) {
            if (player.isSpectator) {
              expect(session.cumulativeScores.has(playerId)).toBe(false);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 4: Vote recording ─────────────────────────────────────────────
/**
 * Feature: tier-list-voting-game, Property 4: Vote recording
 *
 * **Validates: Requirements 3.6**
 *
 * For any active player and any valid tier (S, A, B, C, D, F), when the player
 * submits a vote during an active round, the vote SHALL be recorded in the round
 * data with the exact tier submitted.
 */
describe('Property 4: Vote recording', () => {
  it('submitted vote is recorded with the exact tier in the round data', () => {
    fc.assert(
      fc.property(
        arbItemStoreWithEligible(),
        arbPlayers(),
        arbTier(),
        ({ itemStore }, players, tier) => {
          const callbacks = makeCallbacks();
          const engine = new TierListGameEngine(itemStore, callbacks);
          const lobby = makeLobby(players);

          engine.startGame(lobby);

          const session = lobby.tierListSession!;
          const currentRound = session.rounds[session.currentRound];

          // Pick the first non-spectator player
          const activePlayer = Array.from(players.values()).find((p) => !p.isSpectator)!;

          // Submit vote
          const result = engine.submitVote(lobby, activePlayer.id, tier);

          // 1. No error returned
          expect(result.error).toBeUndefined();

          // 2. Vote is recorded with the exact tier
          expect(currentRound.votes.has(activePlayer.id)).toBe(true);
          expect(currentRound.votes.get(activePlayer.id)).toBe(tier);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 5: Vote secrecy in broadcast ───────────────────────────────────
/**
 * Feature: tier-list-voting-game, Property 5: Vote secrecy
 *
 * **Validates: Requirements 3.5, 3.8, 12.1**
 *
 * For any vote submitted by a player, the vote status message broadcast to other
 * players SHALL contain only the player ID and a boolean hasVoted, without ever
 * revealing the voted tier.
 */
describe('Property 5: Vote secrecy in broadcast', () => {
  it('onVoteStatus callback receives only playerId and hasVoted=true, never the tier', () => {
    fc.assert(
      fc.property(
        arbItemStoreWithEligible(),
        arbPlayers(),
        arbTier(),
        ({ itemStore }, players, tier) => {
          const callbacks = makeCallbacks();
          const engine = new TierListGameEngine(itemStore, callbacks);
          const lobby = makeLobby(players);

          engine.startGame(lobby);

          const activePlayer = Array.from(players.values()).find((p) => !p.isSpectator)!;

          // Clear previous calls from startGame flow
          callbacks.calls.onVoteStatus = [];

          engine.submitVote(lobby, activePlayer.id, tier, true);

          // 1. onVoteStatus was called exactly once for this vote
          expect(callbacks.calls.onVoteStatus.length).toBe(1);

          const [lobbyCode, playerId, hasVoted] = callbacks.calls.onVoteStatus[0];

          // 2. Contains the correct playerId
          expect(playerId).toBe(activePlayer.id);

          // 3. Contains hasVoted = true
          expect(hasVoted).toBe(true);

          // 4. The callback signature has exactly 3 args (lobbyCode, playerId, hasVoted)
          //    — no tier information is leaked
          expect(callbacks.calls.onVoteStatus[0].length).toBe(3);

          // 5. None of the arguments is the tier value
          for (const arg of callbacks.calls.onVoteStatus[0]) {
            if (typeof arg === 'string' && ALL_TIERS.includes(arg as TierName) && arg !== activePlayer.id) {
              // This would be a leak — but lobbyCode could coincidentally match.
              // Only flag if it's exactly the voted tier and not the lobbyCode or playerId.
              if (arg === tier && arg !== lobbyCode && arg !== playerId) {
                fail(`Vote tier "${tier}" was leaked in the onVoteStatus broadcast`);
              }
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 6: Default vote for non-voters ────────────────────────────────
/**
 * Feature: tier-list-voting-game, Property 6: Default vote
 *
 * **Validates: Requirements 4.3**
 *
 * For any set of active players at the end of a round (timer expiration),
 * players who did not submit a vote SHALL receive a default vote of tier C
 * (value 3).
 */
describe('Property 6: Default vote for non-voters', () => {
  it('non-voting active players receive default vote of tier C after endRound', () => {
    fc.assert(
      fc.property(
        arbItemStoreWithEligible(),
        fc.integer({ min: 2, max: 6 }).chain((n) => {
          // For each player, decide if they vote or not
          const voteFlags = Array.from({ length: n }, () => fc.boolean());
          return fc.tuple(fc.constant(n), ...voteFlags);
        }),
        ({ itemStore }, tuple: [number, ...boolean[]]) => {
          const [numPlayers, ...voteFlags] = tuple;

          // Ensure at least one non-voter so the property is meaningful
          const hasNonVoter = voteFlags.some((v) => !v);
          if (!hasNonVoter) return;

          const players = new Map<string, Player>();
          for (let i = 0; i < numPlayers; i++) {
            players.set(`p${i}`, makePlayer(`p${i}`, { isHost: i === 0, joinOrder: i }));
          }

          const callbacks = makeCallbacks();
          const engine = new TierListGameEngine(itemStore, callbacks);
          const lobby = makeLobby(players, { config: { rounds: 1, timerSeconds: -1, timeBetweenRounds: 0, mode: 'category' } });

          engine.startGame(lobby);

          const session = lobby.tierListSession!;

          // Submit votes for players who choose to vote
          for (let i = 0; i < numPlayers; i++) {
            if (voteFlags[i]) {
              engine.submitVote(lobby, `p${i}`, 'A');
            }
          }

          // End the round (simulating timer expiry)
          engine.endRound(lobby);

          const round = session.rounds[0];

          // Verify: non-voters got default vote of 'C'
          for (let i = 0; i < numPlayers; i++) {
            if (!voteFlags[i]) {
              expect(round.votes.get(`p${i}`)).toBe('C');
            }
          }

          // Verify: voters kept their original vote
          for (let i = 0; i < numPlayers; i++) {
            if (voteFlags[i]) {
              expect(round.votes.get(`p${i}`)).toBe('A');
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 7: Early round completion ──────────────────────────────────────
/**
 * Feature: tier-list-voting-game, Property 7: Early completion
 *
 * **Validates: Requirements 4.4**
 *
 * For any set of active connected players in a round, when all players have
 * submitted their vote, the round SHALL end immediately without waiting for
 * timer expiration.
 */
describe('Property 7: Early round completion', () => {
  it('round ends immediately when all active connected players have voted', () => {
    fc.assert(
      fc.property(
        arbItemStoreWithEligible(),
        arbPlayers(),
        ({ itemStore }, players) => {
          const callbacks = makeCallbacks();
          const engine = new TierListGameEngine(itemStore, callbacks);
          // Use a long timer so it won't expire during the test
          const lobby = makeLobby(players, { config: { rounds: 1, timerSeconds: -1, timeBetweenRounds: 0, mode: 'category' } });

          engine.startGame(lobby);

          const session = lobby.tierListSession!;
          const round = session.rounds[session.currentRound];

          // All active connected players submit votes
          const activePlayers = Array.from(players.values()).filter(
            (p) => !p.isSpectator && p.isConnected,
          );

          for (const player of activePlayers) {
            engine.submitVote(lobby, player.id, 'B', true);
          }

          // Round should be complete (endRound was triggered by early completion)
          expect(round.isComplete).toBe(true);

          // Suspense callback should have been called (endRound triggers suspense)
          expect(callbacks.calls.onSuspenseStart.length).toBeGreaterThanOrEqual(1);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 13: Rematch — members, crown and spectator promotion ──────────
/**
 * Feature: tier-list-voting-game, Property 13: Rematch membership
 *
 * **Validates: Requirements 10.2, 10.3, 10.5, 10.6, 10.7**
 *
 * For any set of players (including spectators) at rematch countdown expiration,
 * the new game SHALL include exactly the connected players. All spectators SHALL
 * be promoted to active participants (isSpectator = false). If the previous
 * winner is among connected players, their hasCrown SHALL be true; all others
 * SHALL have hasCrown = false. The lobby code SHALL remain identical.
 */
describe('Property 13: Rematch — members, crown and spectator promotion', () => {
  it('connected players included, spectators promoted, crown assigned to previous winner, lobby code unchanged', () => {
    fc.assert(
      fc.property(
        arbItemStoreWithEligible(),
        fc.integer({ min: 2, max: 6 }).chain((numPlayers) => {
          const playerConfigs = Array.from({ length: numPlayers }, () =>
            fc.record({
              isConnected: fc.boolean(),
              isSpectator: fc.boolean(),
            }),
          );
          const winnerIndex = fc.integer({ min: -1, max: numPlayers - 1 });
          return fc.tuple(fc.constant(numPlayers), winnerIndex, ...playerConfigs);
        }),
        ({ itemStore }, tuple: [number, number, ...{ isConnected: boolean; isSpectator: boolean }[]]) => {
          const [numPlayers, winnerIndex, ...playerConfigs] = tuple;

          // Ensure at least one connected player
          const hasConnected = playerConfigs.some((p) => p.isConnected);
          if (!hasConnected) return;

          const callbacks = makeCallbacks();
          const engine = new TierListGameEngine(itemStore, callbacks);

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
          const originalCode = 'REMATCH01';

          const lobby = makeLobby(players, {
            code: originalCode,
            previousWinnerId,
            state: 'results',
          });

          // Snapshot connected player IDs before rematch
          const connectedPlayerIds = new Set<string>();
          for (const [id, player] of lobby.players) {
            if (player.isConnected) {
              connectedPlayerIds.add(id);
            }
          }

          engine.startRematch(lobby);

          // 1. Only connected players remain
          const remainingIds = new Set(lobby.players.keys());
          expect(remainingIds).toEqual(connectedPlayerIds);

          // 2. All spectators are promoted (isSpectator = false)
          for (const [, player] of lobby.players) {
            expect(player.isSpectator).toBe(false);
          }

          // 3. Crown assignment: only previous winner gets hasCrown = true
          for (const [playerId, player] of lobby.players) {
            if (playerId === previousWinnerId) {
              expect(player.hasCrown).toBe(true);
            } else {
              expect(player.hasCrown).toBe(false);
            }
          }

          // 4. Lobby code remains identical
          expect(lobby.code).toBe(originalCode);

          // 5. A new game session was started
          expect(lobby.tierListSession).not.toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});
