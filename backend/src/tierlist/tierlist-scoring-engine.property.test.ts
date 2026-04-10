import * as fc from 'fast-check';
import { TierName } from '@shared/types';
import { computeAverageAndTier, computeProximityScore, updateCumulativeScores } from './tierlist-scoring-engine';

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

// ─── Property 9: Proximity score formula ─────────────────────────────────────
/**
 * Feature: tier-list-voting-game, Property 9: Proximity score formula
 *
 * **Validates: Requirements 7.1, 7.2, 7.3**
 *
 * For any tier vote and any average of votes, the proximity score SHALL equal
 * `5 - |vote_value - average|`, rounded to 2 decimal places.
 * The score SHALL always be between 0 and 5 (inclusive).
 */
describe('Property 9: Proximity score formula', () => {
  it('proximity score equals 5 - |vote_value - average|, rounded to 2 decimals, and is in [0, 5]', () => {
    fc.assert(
      fc.property(
        arbTier(),
        fc.double({ min: 1.0, max: 6.0, noNaN: true, noDefaultInfinity: true }),
        (votedTier: TierName, average: number) => {
          const voteValue = TIER_TO_VALUE[votedTier];

          // --- Independently compute expected score ---
          const expectedRaw = 5 - Math.abs(voteValue - average);
          const expectedScore = Math.round(expectedRaw * 100) / 100;

          // --- Call the actual function ---
          const actualScore = computeProximityScore(votedTier, average);

          // --- Verify formula correctness ---
          expect(actualScore).toBeCloseTo(expectedScore, 2);

          // --- Verify score is within [0, 5] ---
          expect(actualScore).toBeGreaterThanOrEqual(0);
          expect(actualScore).toBeLessThanOrEqual(5);
        },
      ),
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
 * For any two players A and B in the same round, if the absolute distance
 * between A's vote and the average is strictly less than B's, then A's
 * proximity score SHALL be strictly greater than B's.
 */
describe('Property 10: Scoring monotonicity', () => {
  it('player closer to the average always gets a strictly higher proximity score', () => {
    fc.assert(
      fc.property(
        arbTier(),
        arbTier(),
        fc.double({ min: 1.0, max: 6.0, noNaN: true, noDefaultInfinity: true }),
        (tierA: TierName, tierB: TierName, average: number) => {
          const distA = Math.abs(TIER_TO_VALUE[tierA] - average);
          const distB = Math.abs(TIER_TO_VALUE[tierB] - average);

          // Pre-condition: A is strictly closer to the average than B
          fc.pre(distA < distB);

          const scoreA = computeProximityScore(tierA, average);
          const scoreB = computeProximityScore(tierB, average);

          expect(scoreA).toBeGreaterThan(scoreB);
        },
      ),
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
