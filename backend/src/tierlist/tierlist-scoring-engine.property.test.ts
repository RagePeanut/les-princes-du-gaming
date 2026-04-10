import * as fc from 'fast-check';
import { TierName } from '@shared/types';
import { computeAverageAndTier, computeRoundScores, updateCumulativeScores } from './tierlist-scoring-engine';

// ─── Helpers ────────────────────────────────────────────────────────────────

const ALL_TIERS: TierName[] = ['S', 'A', 'B', 'C', 'D', 'F'];

/**
 * Independent tier-to-value mapping for test verification.
 * Defined separately from the production TIER_VALUES to independently validate behavior.
 */
const TIER_TO_VALUE: Record<TierName, number> = {
  S: 6, A: 5, B: 4, C: 3, D: 2, F: 1,
};

/**
 * Generates a valid TierName.
 */
function arbTier(): fc.Arbitrary<TierName> {
  return fc.constantFrom(...ALL_TIERS);
}

/**
 * Generates a Map of player votes (2–8 players), each voting a random tier.
 */
function arbVotes(): fc.Arbitrary<Map<string, TierName>> {
  return fc.integer({ min: 2, max: 8 }).chain((numPlayers) => {
    const voteArbs = Array.from({ length: numPlayers }, () => arbTier());
    return fc.tuple(...voteArbs).map((votes) => {
      const map = new Map<string, TierName>();
      for (let i = 0; i < numPlayers; i++) {
        map.set(`player-${i}`, votes[i]);
      }
      return map;
    });
  });
}

/**
 * Independently determines the expected tier from an average value
 * using the same threshold logic defined in the spec.
 */
function expectedTierFromAverage(avg: number): TierName {
  if (avg >= 5.5) return 'S';
  if (avg >= 4.5) return 'A';
  if (avg >= 3.5) return 'B';
  if (avg >= 2.5) return 'C';
  if (avg >= 1.5) return 'D';
  return 'F';
}

// ─── Property 8: Average and tier conversion ────────────────────────────────
/**
 * Feature: tier-list-voting-game, Property 8: Average and tier conversion
 *
 * **Validates: Requirements 6.1, 6.2**
 *
 * For any set of tier votes (each among S=6, A=5, B=4, C=3, D=2, F=1),
 * the computed average SHALL equal the arithmetic mean of the numeric values.
 * The final tier SHALL be determined by thresholds:
 * S if average ≥ 5.5, A if ≥ 4.5, B if ≥ 3.5, C if ≥ 2.5, D if ≥ 1.5, F otherwise.
 */
describe('Property 8: Average and tier conversion', () => {
  it('computed average equals arithmetic mean and tier matches thresholds for arbitrary votes', () => {
    fc.assert(
      fc.property(arbVotes(), (votes: Map<string, TierName>) => {
        // --- Independently compute expected average ---
        const values = Array.from(votes.values()).map((t) => TIER_TO_VALUE[t]);
        const rawAverage = values.reduce((sum, v) => sum + v, 0) / values.length;
        const expectedAverage = Math.round(rawAverage * 100) / 100;

        // --- Independently determine expected tier ---
        const expectedTier = expectedTierFromAverage(expectedAverage);

        // --- Call the actual function ---
        const { average, tier } = computeAverageAndTier(votes);

        // --- Verify average matches arithmetic mean ---
        expect(average).toBeCloseTo(expectedAverage, 2);

        // --- Verify tier matches threshold conversion ---
        expect(tier).toBe(expectedTier);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 9: Scatter-weighted round scoring ──────────────────────────────
/**
 * Feature: tier-list-voting-game, Property 9: Scatter-weighted round scoring
 *
 * **Validates: Requirements 7.1, 7.2, 7.3**
 *
 * For any set of tier votes, the round scores SHALL be computed as:
 * 1. Convert tiers to 0-based indices (F=0, D=1, C=2, B=3, A=4, S=5)
 * 2. average = round(mean of indices) (away from zero)
 * 3. scatter = mean of |index - average| across all votes
 * 4. Per player: nominalScore = max(0, 5 - |average - index| * 2)
 *    finalScore = round(nominalScore * scatter) (away from zero)
 *
 * All scores SHALL be non-negative integers.
 */

const TIER_INDEX_ORDER: TierName[] = ['F', 'D', 'C', 'B', 'A', 'S'];

function tierToIndex(tier: TierName): number {
  return TIER_INDEX_ORDER.indexOf(tier);
}

function roundAwayFromZero(value: number): number {
  return value >= 0 ? Math.round(value) : -Math.round(-value);
}

describe('Property 9: Scatter-weighted round scoring', () => {
  it('round scores match the scatter-weighted formula and are non-negative integers', () => {
    fc.assert(
      fc.property(arbVotes(), (votes: Map<string, TierName>) => {
        const scores = computeRoundScores(votes);

        // Independently compute expected scores
        const entries = Array.from(votes.entries());
        const indices = entries.map(([, tier]) => tierToIndex(tier));
        const rawAvg = indices.reduce((s, v) => s + v, 0) / indices.length;
        const avg = roundAwayFromZero(rawAvg);
        const scatter = indices.map(i => Math.abs(i - avg)).reduce((s, v) => s + v, 0) / indices.length;

        for (const [playerId, tier] of entries) {
          const idx = tierToIndex(tier);
          const variance = Math.abs(avg - idx);
          const nominal = Math.max(0, 5 - variance * 2);
          const expected = roundAwayFromZero(nominal * scatter);

          const actual = scores.get(playerId);
          expect(actual).toBeDefined();
          expect(actual).toBe(expected);
          // Scores must be non-negative
          expect(actual!).toBeGreaterThanOrEqual(0);
          // Scores must be integers (due to rounding)
          expect(Number.isInteger(actual!)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 10: Scoring monotonicity ───────────────────────────────────────
/**
 * Feature: tier-list-voting-game, Property 10: Scoring monotonicity
 *
 * **Validates: Requirements 7.4**
 *
 * For any two players in the same round, if player A's vote is strictly closer
 * to the rounded average than player B's, then A's score SHALL be greater than
 * or equal to B's score.
 */
describe('Property 10: Scoring monotonicity', () => {
  it('player closer to the average gets a score >= the farther player', () => {
    fc.assert(
      fc.property(arbVotes(), (votes: Map<string, TierName>) => {
        const scores = computeRoundScores(votes);
        const entries = Array.from(votes.entries());
        const indices = entries.map(([, tier]) => tierToIndex(tier));
        const rawAvg = indices.reduce((s, v) => s + v, 0) / indices.length;
        const avg = roundAwayFromZero(rawAvg);

        // Compare all pairs
        for (let i = 0; i < entries.length; i++) {
          for (let j = i + 1; j < entries.length; j++) {
            const distI = Math.abs(tierToIndex(entries[i][1]) - avg);
            const distJ = Math.abs(tierToIndex(entries[j][1]) - avg);
            const scoreI = scores.get(entries[i][0])!;
            const scoreJ = scores.get(entries[j][0])!;

            if (distI < distJ) {
              expect(scoreI).toBeGreaterThanOrEqual(scoreJ);
            } else if (distJ < distI) {
              expect(scoreJ).toBeGreaterThanOrEqual(scoreI);
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 11: Cumulative score update ────────────────────────────────────
/**
 * Feature: tier-list-voting-game, Property 11: Cumulative score update
 *
 * **Validates: Requirements 7.5**
 *
 * For any set of cumulative scores and round scores, after update,
 * each player's new cumulative score SHALL equal the old cumulative score
 * plus the round score, rounded to 2 decimal places.
 */
describe('Property 11: Cumulative score update', () => {
  /**
   * Generates a Map<string, number> with 2–8 players and arbitrary score values.
   */
  function arbScoreMap(): fc.Arbitrary<Map<string, number>> {
    return fc.integer({ min: 2, max: 8 }).chain((numPlayers) => {
      const scoreArbs = Array.from({ length: numPlayers }, () =>
        fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
      );
      return fc.tuple(...scoreArbs).map((scores) => {
        const map = new Map<string, number>();
        for (let i = 0; i < numPlayers; i++) {
          map.set(`player-${i}`, Math.round(scores[i] * 100) / 100);
        }
        return map;
      });
    });
  }

  it('each player cumulative score equals old + round score, rounded to 2 decimals', () => {
    fc.assert(
      fc.property(arbScoreMap(), arbScoreMap(), (cumulative, round) => {
        // Align round scores to the same player set as cumulative
        const alignedRound = new Map<string, number>();
        for (const [playerId] of cumulative) {
          alignedRound.set(playerId, round.get(playerId) ?? 0);
        }

        // Snapshot old cumulative scores before mutation
        const oldScores = new Map<string, number>(cumulative);

        // Call the function under test (mutates cumulative in place)
        updateCumulativeScores(cumulative, alignedRound);

        // Verify additive property for each player
        for (const [playerId, oldScore] of oldScores) {
          const roundScore = alignedRound.get(playerId) ?? 0;
          const expected = Math.round((oldScore + roundScore) * 100) / 100;
          expect(cumulative.get(playerId)).toBeCloseTo(expected, 2);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 12: Leaderboard sorting ────────────────────────────────────────
/**
 * Feature: tier-list-voting-game, Property 12: Leaderboard sorting
 *
 * **Validates: Requirements 9.2, 9.4**
 *
 * For any set of cumulative player scores, the leaderboard SHALL be sorted by
 * score descending. The winner(s) SHALL be exactly the set of players whose
 * total score equals the maximum score. If multiple players share the maximum
 * score, all SHALL be declared co-winners.
 */
import { buildTierListLeaderboard } from './tierlist-scoring-engine';
import type { Player } from '@shared/types';

describe('Property 12: Leaderboard sorting', () => {
  /**
   * Generates a Map<string, number> of cumulative scores for 2–8 players
   * and a corresponding Map<string, Player>.
   */
  function arbCumulativeWithPlayers(): fc.Arbitrary<{
    cumulativeScores: Map<string, number>;
    players: Map<string, Player>;
  }> {
    return fc.integer({ min: 2, max: 8 }).chain((numPlayers) => {
      const scoreArbs = Array.from({ length: numPlayers }, () =>
        fc.double({ min: 0, max: 500, noNaN: true, noDefaultInfinity: true }),
      );
      return fc.tuple(...scoreArbs).map((scores) => {
        const cumulativeScores = new Map<string, number>();
        const players = new Map<string, Player>();
        for (let i = 0; i < numPlayers; i++) {
          const id = `player-${i}`;
          const roundedScore = Math.round(scores[i] * 100) / 100;
          cumulativeScores.set(id, roundedScore);
          players.set(id, {
            id,
            username: `User${i}`,
            avatarHeadUrl: '',
            avatarAccessoryUrl: null,
            socketId: `socket-${i}`,
            isHost: i === 0,
            isConnected: true,
            isSpectator: false,
            hasCrown: false,
            joinOrder: i,
          });
        }
        return { cumulativeScores, players };
      });
    });
  }

  it('leaderboard is sorted descending, tied players share rank, winnerId and isTie are correct', () => {
    fc.assert(
      fc.property(arbCumulativeWithPlayers(), ({ cumulativeScores, players }) => {
        const { leaderboard, winnerId, isTie } = buildTierListLeaderboard(cumulativeScores, players);

        // --- 1. Leaderboard is sorted descending by totalScore ---
        for (let i = 1; i < leaderboard.length; i++) {
          expect(leaderboard[i].totalScore).toBeLessThanOrEqual(leaderboard[i - 1].totalScore);
        }

        // --- 2. Tied players share the same rank ---
        for (let i = 1; i < leaderboard.length; i++) {
          if (leaderboard[i].totalScore === leaderboard[i - 1].totalScore) {
            expect(leaderboard[i].rank).toBe(leaderboard[i - 1].rank);
          } else {
            expect(leaderboard[i].rank).toBeGreaterThan(leaderboard[i - 1].rank);
          }
        }

        // --- 3. winnerId is one of the players with the max score ---
        const maxScore = leaderboard[0].totalScore;
        const maxScorePlayers = leaderboard
          .filter((e) => e.totalScore === maxScore)
          .map((e) => e.playerId);
        expect(maxScorePlayers).toContain(winnerId);

        // --- 4. isTie is true iff multiple players share the max score ---
        const expectedIsTie = maxScorePlayers.length > 1;
        expect(isTie).toBe(expectedIsTie);
      }),
      { numRuns: 100 },
    );
  });
});
