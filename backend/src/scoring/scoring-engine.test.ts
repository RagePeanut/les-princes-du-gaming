import { Player } from '@shared/types';
import {
  computeConsensusScores,
  updateCumulativeScores,
  buildLeaderboard,
} from './scoring-engine';

// Helper to create a minimal Player object
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

describe('ScoringEngine', () => {
  const items = ['a', 'b', 'c', 'd', 'e'];

  describe('computeConsensusScores', () => {
    it('gives all players the max score when rankings are identical', () => {
      const rankings = new Map<string, string[]>();
      rankings.set('p1', ['a', 'b', 'c', 'd', 'e']);
      rankings.set('p2', ['a', 'b', 'c', 'd', 'e']);

      const scores = computeConsensusScores(rankings, items);

      // Identical rankings → average = each player's ranking → diff = 0
      // score = 5*(5-1) - 0 = 20
      expect(scores.get('p1')).toBe(20);
      expect(scores.get('p2')).toBe(20);
    });

    it('computes correct scores for different rankings', () => {
      const rankings = new Map<string, string[]>();
      rankings.set('p1', ['a', 'b', 'c', 'd', 'e']);
      rankings.set('p2', ['e', 'd', 'c', 'b', 'a']);

      const scores = computeConsensusScores(rankings, items);

      // Average positions: a=(1+5)/2=3, b=(2+4)/2=3, c=(3+3)/2=3, d=(4+2)/2=3, e=(5+1)/2=3
      // P1 diffs: |1-3|+|2-3|+|3-3|+|4-3|+|5-3| = 2+1+0+1+2 = 6
      // P2 diffs: |1-3|+|2-3|+|3-3|+|4-3|+|5-3| = 2+1+0+1+2 = 6
      // score = 20 - 6 = 14
      expect(scores.get('p1')).toBe(14);
      expect(scores.get('p2')).toBe(14);
    });

    it('gives higher score to player closer to consensus', () => {
      const rankings = new Map<string, string[]>();
      rankings.set('p1', ['a', 'b', 'c', 'd', 'e']);
      rankings.set('p2', ['a', 'b', 'c', 'd', 'e']);
      rankings.set('p3', ['e', 'd', 'c', 'b', 'a']); // outlier

      const scores = computeConsensusScores(rankings, items);

      // p1 and p2 are closer to consensus than p3
      expect(scores.get('p1')!).toBeGreaterThan(scores.get('p3')!);
      expect(scores.get('p2')!).toBeGreaterThan(scores.get('p3')!);
      expect(scores.get('p1')).toBe(scores.get('p2'));
    });

    it('handles a single player (perfect score)', () => {
      const rankings = new Map<string, string[]>();
      rankings.set('p1', ['a', 'b', 'c', 'd', 'e']);

      const scores = computeConsensusScores(rankings, items);

      // Single player → average = their ranking → diff = 0 → score = 20
      expect(scores.get('p1')).toBe(20);
    });

    it('rounds scores to 2 decimal places', () => {
      const rankings = new Map<string, string[]>();
      rankings.set('p1', ['a', 'b', 'c', 'd', 'e']);
      rankings.set('p2', ['b', 'a', 'c', 'd', 'e']);
      rankings.set('p3', ['a', 'c', 'b', 'd', 'e']);

      const scores = computeConsensusScores(rankings, items);

      for (const [, score] of scores) {
        const decimalPart = score.toString().split('.')[1];
        if (decimalPart) {
          expect(decimalPart.length).toBeLessThanOrEqual(2);
        }
      }
    });
  });

  describe('updateCumulativeScores', () => {
    it('adds round scores to empty cumulative scores', () => {
      const cumulative = new Map<string, number>();
      const round = new Map<string, number>([
        ['p1', 15],
        ['p2', 18],
      ]);

      updateCumulativeScores(cumulative, round);

      expect(cumulative.get('p1')).toBe(15);
      expect(cumulative.get('p2')).toBe(18);
    });

    it('accumulates scores across multiple rounds', () => {
      const cumulative = new Map<string, number>([
        ['p1', 10],
        ['p2', 12],
      ]);
      const round = new Map<string, number>([
        ['p1', 15],
        ['p2', 18],
      ]);

      updateCumulativeScores(cumulative, round);

      expect(cumulative.get('p1')).toBe(25);
      expect(cumulative.get('p2')).toBe(30);
    });

    it('handles new players appearing in round scores', () => {
      const cumulative = new Map<string, number>([['p1', 10]]);
      const round = new Map<string, number>([
        ['p1', 5],
        ['p2', 8],
      ]);

      updateCumulativeScores(cumulative, round);

      expect(cumulative.get('p1')).toBe(15);
      expect(cumulative.get('p2')).toBe(8);
    });

    it('handles decimal scores without floating point drift', () => {
      const cumulative = new Map<string, number>([['p1', 10.33]]);
      const round = new Map<string, number>([['p1', 5.67]]);

      updateCumulativeScores(cumulative, round);

      expect(cumulative.get('p1')).toBe(16);
    });
  });

  describe('buildLeaderboard', () => {
    it('sorts players by descending score', () => {
      const scores = new Map<string, number>([
        ['p1', 10],
        ['p2', 30],
        ['p3', 20],
      ]);
      const players = new Map<string, Player>([
        ['p1', makePlayer('p1', 'Alice')],
        ['p2', makePlayer('p2', 'Bob')],
        ['p3', makePlayer('p3', 'Charlie')],
      ]);

      const { leaderboard } = buildLeaderboard(scores, players);

      expect(leaderboard[0].playerId).toBe('p2');
      expect(leaderboard[1].playerId).toBe('p3');
      expect(leaderboard[2].playerId).toBe('p1');
    });

    it('assigns correct ranks with ties', () => {
      const scores = new Map<string, number>([
        ['p1', 20],
        ['p2', 20],
        ['p3', 10],
      ]);
      const players = new Map<string, Player>([
        ['p1', makePlayer('p1', 'Alice')],
        ['p2', makePlayer('p2', 'Bob')],
        ['p3', makePlayer('p3', 'Charlie')],
      ]);

      const { leaderboard, isTie } = buildLeaderboard(scores, players);

      expect(leaderboard[0].rank).toBe(1);
      expect(leaderboard[1].rank).toBe(1);
      expect(leaderboard[2].rank).toBe(3);
      expect(isTie).toBe(true);
    });

    it('detects winner correctly when no tie', () => {
      const scores = new Map<string, number>([
        ['p1', 30],
        ['p2', 20],
      ]);
      const players = new Map<string, Player>([
        ['p1', makePlayer('p1', 'Alice')],
        ['p2', makePlayer('p2', 'Bob')],
      ]);

      const { winnerId, isTie } = buildLeaderboard(scores, players);

      expect(winnerId).toBe('p1');
      expect(isTie).toBe(false);
    });

    it('detects tie for first place', () => {
      const scores = new Map<string, number>([
        ['p1', 25],
        ['p2', 25],
      ]);
      const players = new Map<string, Player>([
        ['p1', makePlayer('p1', 'Alice')],
        ['p2', makePlayer('p2', 'Bob')],
      ]);

      const { isTie } = buildLeaderboard(scores, players);

      expect(isTie).toBe(true);
    });

    it('includes player details in leaderboard entries', () => {
      const scores = new Map<string, number>([['p1', 15]]);
      const players = new Map<string, Player>([
        ['p1', makePlayer('p1', 'Alice')],
      ]);

      const { leaderboard } = buildLeaderboard(scores, players);

      expect(leaderboard[0]).toEqual({
        playerId: 'p1',
        username: 'Alice',
        avatarHeadUrl: '',
        avatarAccessoryUrl: null,
        totalScore: 15,
        rank: 1,
      });
    });

    it('skips players not found in the players map', () => {
      const scores = new Map<string, number>([
        ['p1', 15],
        ['p_missing', 10],
      ]);
      const players = new Map<string, Player>([
        ['p1', makePlayer('p1', 'Alice')],
      ]);

      const { leaderboard } = buildLeaderboard(scores, players);

      expect(leaderboard).toHaveLength(1);
      expect(leaderboard[0].playerId).toBe('p1');
    });

    it('handles empty scores', () => {
      const scores = new Map<string, number>();
      const players = new Map<string, Player>();

      const { leaderboard, winnerId, isTie } = buildLeaderboard(scores, players);

      expect(leaderboard).toHaveLength(0);
      expect(winnerId).toBe('');
      expect(isTie).toBe(false);
    });
  });
});
