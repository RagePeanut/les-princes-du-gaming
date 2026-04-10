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
 * Computes round scores for all players using scatter-weighted proximity scoring.
 *
 * Algorithm (ported from Unity tier list game):
 * 1. Convert votes to 0-based indices: F=0, D=1, C=2, B=3, A=4, S=5
 * 2. Compute average index, rounded to nearest integer (away from zero)
 * 3. Compute scatter = mean of |voteIndex - average| across all votes
 * 4. Per player: variance = |average - voteIndex|
 *    nominalScore = max(0, 5 - variance * 2)
 *    finalScore = round(nominalScore * scatter) (away from zero)
 *
 * The scatter multiplier rewards controversial items (high disagreement)
 * more than consensus items, making the game more dynamic.
 */

const TIER_INDEX_ORDER: TierName[] = ['F', 'D', 'C', 'B', 'A', 'S'];

function tierToIndex(tier: TierName): number {
  return TIER_INDEX_ORDER.indexOf(tier);
}

function roundAwayFromZero(value: number): number {
  return value >= 0 ? Math.round(value) : -Math.round(-value);
}

export function computeRoundScores(votes: Map<string, TierName>): Map<string, number> {
  const entries = Array.from(votes.entries());
  const indices = entries.map(([, tier]) => tierToIndex(tier));

  // Step 1: average index, rounded to nearest integer (away from zero)
  const rawAverage = indices.reduce((sum, v) => sum + v, 0) / indices.length;
  const average = roundAwayFromZero(rawAverage);

  // Step 2: scatter = mean absolute deviation from the rounded average
  const scatter = indices.map(idx => Math.abs(idx - average)).reduce((sum, v) => sum + v, 0) / indices.length;

  // Step 3: per-player score
  const scores = new Map<string, number>();
  for (const [playerId, tier] of entries) {
    const voteIndex = tierToIndex(tier);
    const variance = Math.abs(average - voteIndex);
    const nominalScore = Math.max(0, 5 - variance * 2);
    const finalScore = roundAwayFromZero(nominalScore * scatter);
    scores.set(playerId, finalScore);
  }

  return scores;
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
