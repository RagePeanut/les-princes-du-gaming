import { Player } from '../../../shared/types';
import { LeaderboardEntry } from '../../../shared/ws-messages';

/**
 * Computes consensus scores for a round.
 *
 * Algorithm:
 * 1. For each item, compute the average position across all players' rankings (1-indexed)
 * 2. For each player, compute the sum of absolute differences between their ranking
 *    position and the average position for each item
 * 3. Convert to a score: score = maxPossibleDifference - totalDifference,
 *    where maxPossibleDifference = numItems × (numItems - 1)
 * 4. Round to 2 decimal places
 */
export function computeConsensusScores(
  rankings: Map<string, string[]>,
  itemIds: string[]
): Map<string, number> {
  const playerIds = Array.from(rankings.keys());
  const numItems = itemIds.length;

  // Compute average position for each item (1-indexed)
  const avgPosition = new Map<string, number>();
  for (const itemId of itemIds) {
    let sum = 0;
    for (const playerId of playerIds) {
      const rank = rankings.get(playerId)!;
      sum += rank.indexOf(itemId) + 1;
    }
    avgPosition.set(itemId, sum / playerIds.length);
  }

  // Compute score per player
  const maxDiff = numItems * (numItems - 1);
  const scores = new Map<string, number>();
  for (const playerId of playerIds) {
    const rank = rankings.get(playerId)!;
    let totalDiff = 0;
    for (let i = 0; i < rank.length; i++) {
      totalDiff += Math.abs((i + 1) - avgPosition.get(rank[i])!);
    }
    scores.set(playerId, Math.round((maxDiff - totalDiff) * 100) / 100);
  }

  return scores;
}

/**
 * Adds round scores to cumulative scores in place.
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
 * Returns the leaderboard entries sorted descending by score,
 * the winner ID, and whether there's a tie for first place.
 */
export function buildLeaderboard(
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
      avatarDataUri: player.avatarDataUri,
      totalScore,
      rank: 0, // assigned after sorting
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

  // Determine winner and tie
  const winnerId = entries.length > 0 ? entries[0].playerId : '';
  const isTie = entries.length > 1 && entries[0].totalScore === entries[1].totalScore;

  return { leaderboard: entries, winnerId, isTie };
}
