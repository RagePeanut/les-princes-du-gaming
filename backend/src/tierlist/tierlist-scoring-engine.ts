import { TierName, TIER_VALUES, TIER_THRESHOLDS, Player } from '../../../shared/types';
import type { LeaderboardEntry } from '../../../shared/ws-messages';

/**
 * Computes the arithmetic average of tier votes and converts it to a final tier.
 *
 * Algorithm:
 * 1. Convert each vote (TierName) to its numeric value (S=6, A=5, B=4, C=3, D=2, F=1)
 * 2. Compute the arithmetic mean, rounded to 2 decimal places
 * 3. Convert the mean to a tier using thresholds: S (≥5.5), A (≥4.5), B (≥3.5), C (≥2.5), D (≥1.5), F (<1.5)
 */
export function computeAverageAndTier(votes: Map<string, TierName>): { average: number; tier: TierName } {
  const values = Array.from(votes.values()).map(t => TIER_VALUES[t]);
  const average = values.reduce((sum, v) => sum + v, 0) / values.length;
  const roundedAverage = Math.round(average * 100) / 100;

  for (const { tier, minAverage } of TIER_THRESHOLDS) {
    if (roundedAverage >= minAverage) {
      return { average: roundedAverage, tier };
    }
  }
  return { average: roundedAverage, tier: 'F' };
}

/**
 * Computes the proximity score for a single player's vote.
 *
 * Formula: Score = 5 - |vote_value - average|, rounded to 2 decimal places.
 * The score rewards players whose vote is closer to the group average.
 */
export function computeProximityScore(votedTier: TierName, averageValue: number): number {
  const voteValue = TIER_VALUES[votedTier];
  const score = 5 - Math.abs(voteValue - averageValue);
  return Math.round(score * 100) / 100;
}

/**
 * Adds round scores to cumulative scores in place.
 * Each player's cumulative score is incremented by their round score, rounded to 2 decimal places.
 */
export function updateCumulativeScores(
  cumulativeScores: Map<string, number>,
  roundScores: Map<string, number>
): void {
  for (const [playerId, score] of roundScores) {
    const current = cumulativeScores.get(playerId) ?? 0;
    cumulativeScores.set(playerId, Math.round((current + score) * 100) / 100);
  }
}

/**
 * Builds a sorted leaderboard from cumulative scores.
 * Returns entries sorted descending by score with tied players sharing the same rank.
 */
export function buildTierListLeaderboard(
  cumulativeScores: Map<string, number>,
  players: Map<string, Player>
): { leaderboard: LeaderboardEntry[]; winnerId: string; isTie: boolean } {
  const entries: LeaderboardEntry[] = [];

  for (const [playerId, totalScore] of cumulativeScores) {
    const player = players.get(playerId);
    if (!player) continue;
    entries.push({
      playerId,
      username: player.username,
      avatarHeadUrl: player.avatarHeadUrl,
      avatarAccessoryUrl: player.avatarAccessoryUrl,
      totalScore,
      rank: 0,
    });
  }

  // Sort descending by totalScore
  entries.sort((a, b) => b.totalScore - a.totalScore);

  // Assign ranks (tied players share the same rank)
  for (let i = 0; i < entries.length; i++) {
    if (i === 0) {
      entries[i].rank = 1;
    } else if (entries[i].totalScore === entries[i - 1].totalScore) {
      entries[i].rank = entries[i - 1].rank;
    } else {
      entries[i].rank = i + 1;
    }
  }

  const winnerId = entries.length > 0 ? entries[0].playerId : '';
  const isTie = entries.length > 1 && entries[0].totalScore === entries[1].totalScore;

  return { leaderboard: entries, winnerId, isTie };
}
