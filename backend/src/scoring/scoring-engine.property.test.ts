import * as fc from 'fast-check';
import { Player } from '@shared/types';
import {
  computeConsensusScores,
  updateCumulativeScores,
  buildLeaderboard,
} from './scoring-engine';

// ─── Helpers ────────────────────────────────────────────────────────────────

const ITEMS = ['item-a', 'item-b', 'item-c', 'item-d', 'item-e'];

/**
 * Generates a permutation of the 5 items (a valid ranking).
 */
function arbRanking(): fc.Arbitrary<string[]> {
  return fc.shuffledSubarray(ITEMS, { minLength: 5, maxLength: 5 });
}

/**
 * Generates rankings for N players (2–8), returning a Map<playerId, ranking>.
 */
function arbRankings(): fc.Arbitrary<Map<string, string[]>> {
  return fc.integer({ min: 2, max: 8 }).chain((numPlayers) => {
    const rankingArbs = Array.from({ length: numPlayers }, () => arbRanking());
    return fc.tuple(...rankingArbs).map((rankings) => {
      const map = new Map<string, string[]>();
      for (let i = 0; i < numPlayers; i++) {
        map.set(`player-${i}`, rankings[i]);
      }
      return map;
    });
  });
}

function makePlayer(id: string, username: string): Player {
  return {
    id,
    username,
    avatarHeadUrl: '',
    avatarAccessoryUrl: null,
    socketId: `socket-${id}`,
    isHost: false,
    isConnected: true,
    isSpectator: false,
    hasCrown: false,
    joinOrder: 0,
  };
}

// ─── Property 8: Scoring algorithm correctness ─────────────────────────────
/**
 * Feature: multiplayer-game-hub, Property 8: Scoring correctness
 *
 * **Validates: Requirements 7.1, 7.2**
 *
 * For any set of N players' rankings of 5 items, the computed average position
 * for each item SHALL equal the arithmetic mean of that item's position across
 * all players' rankings (1-indexed). Each player's consensus score SHALL equal
 * `maxDiff - Σ|playerPosition(item) - avgPosition(item)|` for all items,
 * where `maxDiff = numItems × (numItems - 1)`.
 */
describe('Property 8: Scoring algorithm correctness', () => {
  it('average positions and consensus scores match the formula for arbitrary rankings', () => {
    fc.assert(
      fc.property(arbRankings(), (rankings: Map<string, string[]>) => {
        const playerIds = Array.from(rankings.keys());
        const numItems = ITEMS.length;
        const numPlayers = playerIds.length;

        // --- Independently compute expected average positions ---
        const expectedAvgPosition = new Map<string, number>();
        for (const itemId of ITEMS) {
          let sum = 0;
          for (const playerId of playerIds) {
            const rank = rankings.get(playerId)!;
            sum += rank.indexOf(itemId) + 1; // 1-indexed
          }
          expectedAvgPosition.set(itemId, sum / numPlayers);
        }

        // --- Independently compute expected scores ---
        const maxDiff = numItems * (numItems - 1); // 5 * 4 = 20
        const expectedScores = new Map<string, number>();
        for (const playerId of playerIds) {
          const rank = rankings.get(playerId)!;
          let totalDiff = 0;
          for (let i = 0; i < rank.length; i++) {
            totalDiff += Math.abs((i + 1) - expectedAvgPosition.get(rank[i])!);
          }
          expectedScores.set(playerId, Math.round((maxDiff - totalDiff) * 100) / 100);
        }

        // --- Call the actual function ---
        const actualScores = computeConsensusScores(rankings, ITEMS);

        // --- Verify scores match ---
        for (const playerId of playerIds) {
          expect(actualScores.get(playerId)).toBeCloseTo(expectedScores.get(playerId)!, 2);
        }

        // --- Verify all players are scored ---
        expect(actualScores.size).toBe(numPlayers);
      }),
      { numRuns: 20 },
    );
  });
});

// ─── Property 9: Scoring monotonicity ───────────────────────────────────────
/**
 * Feature: multiplayer-game-hub, Property 9: Scoring monotonicity
 *
 * **Validates: Requirements 7.3**
 *
 * For any two players A and B in the same round, if the sum of absolute
 * differences from the average ranking for player A is less than for player B,
 * then player A's consensus score SHALL be strictly greater than player B's
 * consensus score.
 */
describe('Property 9: Scoring monotonicity — closer to consensus means higher score', () => {
  it('player with smaller total difference from average gets a strictly higher score', () => {
    fc.assert(
      fc.property(arbRankings(), (rankings: Map<string, string[]>) => {
        const playerIds = Array.from(rankings.keys());
        const numPlayers = playerIds.length;

        // Compute average positions independently
        const avgPosition = new Map<string, number>();
        for (const itemId of ITEMS) {
          let sum = 0;
          for (const playerId of playerIds) {
            const rank = rankings.get(playerId)!;
            sum += rank.indexOf(itemId) + 1;
          }
          avgPosition.set(itemId, sum / numPlayers);
        }

        // Compute total differences per player independently
        const totalDiffs = new Map<string, number>();
        for (const playerId of playerIds) {
          const rank = rankings.get(playerId)!;
          let totalDiff = 0;
          for (let i = 0; i < rank.length; i++) {
            totalDiff += Math.abs((i + 1) - avgPosition.get(rank[i])!);
          }
          totalDiffs.set(playerId, totalDiff);
        }

        // Get actual scores
        const scores = computeConsensusScores(rankings, ITEMS);

        // The implementation rounds scores to 2 decimal places:
        //   score = Math.round((maxDiff - totalDiff) * 100) / 100
        // So we compute the rounded scores ourselves and verify monotonicity
        // holds at the rounded level: if rounded scores differ, the ordering
        // must match the raw difference ordering.
        const maxDiff = ITEMS.length * (ITEMS.length - 1);

        for (let i = 0; i < playerIds.length; i++) {
          for (let j = i + 1; j < playerIds.length; j++) {
            const pA = playerIds[i];
            const pB = playerIds[j];
            const diffA = totalDiffs.get(pA)!;
            const diffB = totalDiffs.get(pB)!;
            const scoreA = scores.get(pA)!;
            const scoreB = scores.get(pB)!;

            // Compute what the rounded scores should be from the formula
            const expectedScoreA = Math.round((maxDiff - diffA) * 100) / 100;
            const expectedScoreB = Math.round((maxDiff - diffB) * 100) / 100;

            if (diffA < diffB) {
              // Player A is closer to consensus → score should be >= player B
              expect(scoreA).toBeGreaterThanOrEqual(scoreB);
              // If the rounded expected scores are distinct, strict ordering must hold
              if (expectedScoreA !== expectedScoreB) {
                expect(scoreA).toBeGreaterThan(scoreB);
              }
            } else if (diffB < diffA) {
              expect(scoreB).toBeGreaterThanOrEqual(scoreA);
              if (expectedScoreB !== expectedScoreA) {
                expect(scoreB).toBeGreaterThan(scoreA);
              }
            }
          }
        }
      }),
      { numRuns: 20 },
    );
  });
});

// ─── Property 10: Leaderboard sorting and winner determination ──────────────
/**
 * Feature: multiplayer-game-hub, Property 10: Leaderboard sorting
 *
 * **Validates: Requirements 8.3, 9.1, 9.3**
 *
 * For any set of player scores, the leaderboard SHALL be sorted in descending
 * order by total consensus score. The winner(s) SHALL be exactly the set of
 * players whose total score equals the maximum score. If multiple players share
 * the maximum score, all SHALL be declared co-winners.
 */
describe('Property 10: Leaderboard sorting and winner determination', () => {
  it('leaderboard is sorted descending and winners/ties are correctly identified', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 8 }).chain((numPlayers) => {
          const scoreArbs = Array.from({ length: numPlayers }, () =>
            fc.float({ min: 0, max: 200, noNaN: true, noDefaultInfinity: true }),
          );
          return fc.tuple(fc.constant(numPlayers), ...scoreArbs);
        }),
        (tuple: [number, ...number[]]) => {
          const [numPlayers, ...rawScores] = tuple;

          // Round scores to 2 decimal places to avoid floating point issues
          const scores = rawScores.map((s) => Math.round(s * 100) / 100);

          // Build cumulative scores and players maps
          const cumulativeScores = new Map<string, number>();
          const players = new Map<string, Player>();
          for (let i = 0; i < numPlayers; i++) {
            const id = `player-${i}`;
            cumulativeScores.set(id, scores[i]);
            players.set(id, makePlayer(id, `User${i}`));
          }

          const { leaderboard, winnerId, isTie } = buildLeaderboard(cumulativeScores, players);

          // --- Verify leaderboard length ---
          expect(leaderboard).toHaveLength(numPlayers);

          // --- Verify descending sort ---
          for (let i = 1; i < leaderboard.length; i++) {
            expect(leaderboard[i - 1].totalScore).toBeGreaterThanOrEqual(
              leaderboard[i].totalScore,
            );
          }

          // --- Verify winner is the player with the max score ---
          const maxScore = Math.max(...scores);
          const winnersExpected = scores
            .map((s, i) => ({ id: `player-${i}`, score: s }))
            .filter((p) => p.score === maxScore)
            .map((p) => p.id);

          expect(winnersExpected).toContain(winnerId);

          // --- Verify tie detection ---
          if (winnersExpected.length > 1) {
            expect(isTie).toBe(true);
          } else {
            expect(isTie).toBe(false);
          }

          // --- Verify all co-winners share rank 1 ---
          const rank1Players = leaderboard
            .filter((e) => e.rank === 1)
            .map((e) => e.playerId);
          expect(rank1Players.sort()).toEqual(winnersExpected.sort());
        },
      ),
      { numRuns: 20 },
    );
  });
});
