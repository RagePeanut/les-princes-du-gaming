import { GameEngine, GameEngineCallbacks } from './game-engine';
import { ItemStore } from '../items/item-store';
import { Lobby, Player, Item, GameSession } from '@shared/types';
import { LeaderboardEntry, PlayerScore } from '@shared/ws-messages';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeItems(count: number, category = 'cat-a'): Item[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i}`,
    displayName: `Item ${i}`,
    imageUrl: `http://img/${i}`,
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

function makeLobby(overrides: Partial<Lobby> = {}): Lobby {
  const players = new Map<string, Player>();
  players.set('p1', makePlayer('p1', { isHost: true, joinOrder: 0 }));
  players.set('p2', makePlayer('p2', { joinOrder: 1 }));
  players.set('p3', makePlayer('p3', { joinOrder: 2 }));

  return {
    code: 'ABCDEF',
    hostId: 'p1',
    players,
    config: { rounds: 3, timerSeconds: 15, timeBetweenRounds: -1, mode: 'random' },
    state: 'waiting',
    gameSession: null,
    gameType: 'ranking',
    tierListSession: null,
    previousWinnerId: null,
    createdAt: Date.now(),
    nextJoinOrder: 3,
    ...overrides,
  };
}

function makeCallbacks(): GameEngineCallbacks & {
  calls: Record<string, any[][]>;
} {
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

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('GameEngine', () => {
  let itemStore: ItemStore;
  let callbacks: ReturnType<typeof makeCallbacks>;
  let engine: GameEngine;

  beforeEach(() => {
    jest.useFakeTimers();

    // Create an ItemStore with enough items for multiple rounds
    const items = [
      ...makeItems(30, 'cat-a'),
      ...makeItems(30, 'cat-b').map((item, i) => ({
        ...item,
        id: `item-b-${i}`,
        category: 'cat-b',
      })),
    ];
    itemStore = new ItemStore(items);
    callbacks = makeCallbacks();
    engine = new GameEngine(itemStore, callbacks);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('startGame', () => {
    it('initializes a game session and starts the first round', () => {
      const lobby = makeLobby();
      engine.startGame(lobby);

      expect(lobby.gameSession).not.toBeNull();
      expect(lobby.gameSession!.currentRound).toBe(0);
      expect(lobby.gameSession!.totalRounds).toBe(3);
      expect(lobby.gameSession!.rounds).toHaveLength(1);
      expect(lobby.state).toBe('playing');
    });

    it('initializes cumulative scores for active players only', () => {
      const lobby = makeLobby();
      lobby.players.set('spectator', makePlayer('spectator', { isSpectator: true }));

      engine.startGame(lobby);

      const scores = lobby.gameSession!.cumulativeScores;
      expect(scores.has('p1')).toBe(true);
      expect(scores.has('p2')).toBe(true);
      expect(scores.has('p3')).toBe(true);
      expect(scores.has('spectator')).toBe(false);
    });

    it('fires onRoundStart callback with correct arguments', () => {
      const lobby = makeLobby();
      engine.startGame(lobby);

      expect(callbacks.calls.onRoundStart).toHaveLength(1);
      const [code, roundIndex, items, timerSeconds] = callbacks.calls.onRoundStart[0];
      expect(code).toBe('ABCDEF');
      expect(roundIndex).toBe(0);
      expect(items).toHaveLength(5);
      expect(timerSeconds).toBe(15);
    });

    it('starts a countdown timer that ticks', () => {
      const lobby = makeLobby();
      engine.startGame(lobby);

      jest.advanceTimersByTime(1000);
      expect(callbacks.calls.onTimerTick).toHaveLength(1);
      expect(callbacks.calls.onTimerTick[0][1]).toBe(14);
    });
  });

  describe('submitRanking', () => {
    it('records a valid ranking', () => {
      const lobby = makeLobby();
      engine.startGame(lobby);

      const items = lobby.gameSession!.rounds[0].items;
      const ranking = items.map((i) => i.id);

      const result = engine.submitRanking(lobby, 'p1', ranking);
      expect(result.error).toBeUndefined();
      expect(lobby.gameSession!.rounds[0].rankings.has('p1')).toBe(true);
    });

    it('rejects spectator submissions', () => {
      const lobby = makeLobby();
      lobby.players.set('spectator', makePlayer('spectator', { isSpectator: true }));
      engine.startGame(lobby);

      const items = lobby.gameSession!.rounds[0].items;
      const ranking = items.map((i) => i.id);

      const result = engine.submitRanking(lobby, 'spectator', ranking);
      expect(result.error).toBe('Spectators cannot submit rankings.');
    });

    it('rejects rankings with wrong item IDs', () => {
      const lobby = makeLobby();
      engine.startGame(lobby);

      const result = engine.submitRanking(lobby, 'p1', ['wrong-1', 'wrong-2', 'wrong-3', 'wrong-4', 'wrong-5']);
      expect(result.error).toBe("Invalid ranking — items don't match current round.");
    });

    it('rejects rankings with wrong length', () => {
      const lobby = makeLobby();
      engine.startGame(lobby);

      const items = lobby.gameSession!.rounds[0].items;
      const result = engine.submitRanking(lobby, 'p1', [items[0].id]);
      expect(result.error).toBe("Invalid ranking — items don't match current round.");
    });

    it('returns error for unknown player', () => {
      const lobby = makeLobby();
      engine.startGame(lobby);

      const result = engine.submitRanking(lobby, 'unknown', []);
      expect(result.error).toBe('Player not found in lobby.');
    });

    it('returns error when no game session exists', () => {
      const lobby = makeLobby();
      const result = engine.submitRanking(lobby, 'p1', []);
      expect(result.error).toBe('No active game session.');
    });
  });

  describe('early completion', () => {
    it('ends round immediately when all active players submit', () => {
      const lobby = makeLobby();
      engine.startGame(lobby);

      const items = lobby.gameSession!.rounds[0].items;
      const ranking = items.map((i) => i.id);

      engine.submitRanking(lobby, 'p1', ranking);
      // Round should not be complete yet
      expect(lobby.gameSession!.rounds[0].isComplete).toBe(false);

      engine.submitRanking(lobby, 'p2', ranking);
      expect(lobby.gameSession!.rounds[0].isComplete).toBe(false);

      engine.submitRanking(lobby, 'p3', ranking);
      // Now all active players submitted — round should be complete
      expect(lobby.gameSession!.rounds[0].isComplete).toBe(true);
      expect(callbacks.calls.onRoundEnd).toHaveLength(1);
    });

    it('ignores spectators for early completion check', () => {
      const lobby = makeLobby();
      lobby.players.set('spectator', makePlayer('spectator', { isSpectator: true }));
      engine.startGame(lobby);

      const items = lobby.gameSession!.rounds[0].items;
      const ranking = items.map((i) => i.id);

      engine.submitRanking(lobby, 'p1', ranking);
      expect(lobby.gameSession!.rounds[0].isComplete).toBe(false);

      engine.submitRanking(lobby, 'p2', ranking);
      expect(lobby.gameSession!.rounds[0].isComplete).toBe(false);

      engine.submitRanking(lobby, 'p3', ranking);
      expect(lobby.gameSession!.rounds[0].isComplete).toBe(true);
    });

    it('ignores disconnected players for early completion check', () => {
      const lobby = makeLobby();
      lobby.players.get('p3')!.isConnected = false;
      engine.startGame(lobby);

      const items = lobby.gameSession!.rounds[0].items;
      const ranking = items.map((i) => i.id);

      // p1 and p2 are active and connected, p3 is disconnected
      engine.submitRanking(lobby, 'p1', ranking);
      expect(lobby.gameSession!.rounds[0].isComplete).toBe(false);

      engine.submitRanking(lobby, 'p2', ranking);
      expect(lobby.gameSession!.rounds[0].isComplete).toBe(true);
    });
  });

  describe('endRound', () => {
    it('fills default rankings for players who did not submit', () => {
      const lobby = makeLobby();
      engine.startGame(lobby);

      const items = lobby.gameSession!.rounds[0].items;
      const ranking = items.map((i) => i.id).reverse();

      // Only p1 submits
      engine.submitRanking(lobby, 'p1', ranking);

      // Timer expires
      jest.advanceTimersByTime(15000);

      const round = lobby.gameSession!.rounds[0];
      expect(round.isComplete).toBe(true);
      // p2 should have default order
      expect(round.rankings.get('p2')).toEqual(items.map((i) => i.id));
    });

    it('computes scores and updates cumulative scores', () => {
      const lobby = makeLobby();
      engine.startGame(lobby);

      const items = lobby.gameSession!.rounds[0].items;
      const ranking = items.map((i) => i.id);

      engine.submitRanking(lobby, 'p1', ranking);
      engine.submitRanking(lobby, 'p2', ranking);
      engine.submitRanking(lobby, 'p3', ranking);

      // All submitted same ranking — all should get max score
      const round = lobby.gameSession!.rounds[0];
      expect(round.scores.get('p1')).toBe(round.scores.get('p2'));
      expect(lobby.gameSession!.cumulativeScores.get('p1')).toBeGreaterThan(0);
    });

    it('broadcasts onRoundEnd with scores and leaderboard', () => {
      const lobby = makeLobby();
      engine.startGame(lobby);

      const items = lobby.gameSession!.rounds[0].items;
      const ranking = items.map((i) => i.id);

      engine.submitRanking(lobby, 'p1', ranking);
      engine.submitRanking(lobby, 'p2', ranking);
      engine.submitRanking(lobby, 'p3', ranking);

      expect(callbacks.calls.onRoundEnd).toHaveLength(1);
      const [code, roundIndex, avgRanking, scores, leaderboard] = callbacks.calls.onRoundEnd[0];
      expect(code).toBe('ABCDEF');
      expect(roundIndex).toBe(0);
      expect(avgRanking).toHaveLength(5);
      expect(scores).toHaveLength(3);
      expect(leaderboard.length).toBeGreaterThanOrEqual(3);
    });

    it('advances to round_results state for non-final rounds', () => {
      const lobby = makeLobby({ config: { rounds: 3, timerSeconds: 15, timeBetweenRounds: -1, mode: 'random' } });
      engine.startGame(lobby);

      const items = lobby.gameSession!.rounds[0].items;
      const ranking = items.map((i) => i.id);
      engine.submitRanking(lobby, 'p1', ranking);
      engine.submitRanking(lobby, 'p2', ranking);
      engine.submitRanking(lobby, 'p3', ranking);

      expect(lobby.state).toBe('round_results');
      expect(lobby.gameSession!.currentRound).toBe(1);
    });

    it('does not double-end a round', () => {
      const lobby = makeLobby();
      engine.startGame(lobby);

      const items = lobby.gameSession!.rounds[0].items;
      const ranking = items.map((i) => i.id);
      engine.submitRanking(lobby, 'p1', ranking);
      engine.submitRanking(lobby, 'p2', ranking);
      engine.submitRanking(lobby, 'p3', ranking);

      // Try to end again — should be a no-op (round already complete or next round not started)
      expect(() => engine.endRound(lobby)).not.toThrow();
      // Should still only have 1 onRoundEnd call
      expect(callbacks.calls.onRoundEnd).toHaveLength(1);
    });
  });

  describe('game end', () => {
    it('transitions to results state on final round', () => {
      const lobby = makeLobby({ config: { rounds: 1, timerSeconds: 15, timeBetweenRounds: -1, mode: 'random' } });
      engine.startGame(lobby);

      const items = lobby.gameSession!.rounds[0].items;
      const ranking = items.map((i) => i.id);
      engine.submitRanking(lobby, 'p1', ranking);
      engine.submitRanking(lobby, 'p2', ranking);
      engine.submitRanking(lobby, 'p3', ranking);

      expect(lobby.state).toBe('rematch_countdown');
      expect(callbacks.calls.onGameEnd).toHaveLength(1);
    });

    it('broadcasts onGameEnd with leaderboard, winnerId, and isTie', () => {
      const lobby = makeLobby({ config: { rounds: 1, timerSeconds: 15, timeBetweenRounds: -1, mode: 'random' } });
      engine.startGame(lobby);

      const items = lobby.gameSession!.rounds[0].items;
      const ranking = items.map((i) => i.id);
      engine.submitRanking(lobby, 'p1', ranking);
      engine.submitRanking(lobby, 'p2', ranking);
      engine.submitRanking(lobby, 'p3', ranking);

      const [code, leaderboard, winnerId, isTie] = callbacks.calls.onGameEnd[0];
      expect(code).toBe('ABCDEF');
      expect(leaderboard.length).toBeGreaterThanOrEqual(3);
      expect(typeof winnerId).toBe('string');
      expect(typeof isTie).toBe('boolean');
    });

    it('sets previousWinnerId on game end', () => {
      const lobby = makeLobby({ config: { rounds: 1, timerSeconds: 15, timeBetweenRounds: -1, mode: 'random' } });
      engine.startGame(lobby);

      const items = lobby.gameSession!.rounds[0].items;
      const ranking = items.map((i) => i.id);
      engine.submitRanking(lobby, 'p1', ranking);
      engine.submitRanking(lobby, 'p2', ranking);
      engine.submitRanking(lobby, 'p3', ranking);

      expect(lobby.previousWinnerId).toBeTruthy();
    });
  });

  describe('not enough players (minimum 3)', () => {
    it('ends game at round end when fewer than 3 active connected players remain', () => {
      const lobby = makeLobby({ config: { rounds: 3, timerSeconds: 15, timeBetweenRounds: -1, mode: 'random' } });
      engine.startGame(lobby);

      // Disconnect p3 mid-round so only 2 active connected players remain
      lobby.players.get('p3')!.isConnected = false;

      const items = lobby.gameSession!.rounds[0].items;
      const ranking = items.map((i) => i.id);
      engine.submitRanking(lobby, 'p1', ranking);
      engine.submitRanking(lobby, 'p2', ranking);
      // p1 and p2 are the only connected players, so early completion triggers

      // Game should end instead of advancing to next round
      expect(callbacks.calls.onGameEnd).toHaveLength(1);
      expect(lobby.state).toBe('rematch_countdown');
    });

    it('ends game when host tries to advance to next round with fewer than 3 players', () => {
      const lobby = makeLobby({ config: { rounds: 3, timerSeconds: 15, timeBetweenRounds: -1, mode: 'random' } });
      engine.startGame(lobby);

      const items = lobby.gameSession!.rounds[0].items;
      const ranking = items.map((i) => i.id);
      engine.submitRanking(lobby, 'p1', ranking);
      engine.submitRanking(lobby, 'p2', ranking);
      engine.submitRanking(lobby, 'p3', ranking);

      expect(lobby.state).toBe('round_results');

      // Now p3 disconnects before next round
      lobby.players.get('p3')!.isConnected = false;

      engine.nextRound(lobby);

      // Should end game instead of starting next round
      expect(callbacks.calls.onGameEnd).toHaveLength(1);
      expect(lobby.state).toBe('rematch_countdown');
    });

    it('continues game when exactly 3 active connected players remain', () => {
      const lobby = makeLobby({ config: { rounds: 3, timerSeconds: 15, timeBetweenRounds: -1, mode: 'random' } });
      engine.startGame(lobby);

      const items = lobby.gameSession!.rounds[0].items;
      const ranking = items.map((i) => i.id);
      engine.submitRanking(lobby, 'p1', ranking);
      engine.submitRanking(lobby, 'p2', ranking);
      engine.submitRanking(lobby, 'p3', ranking);

      // All 3 players still connected — should advance normally
      expect(lobby.state).toBe('round_results');
      expect(callbacks.calls.onGameEnd).toHaveLength(0);
    });
  });

  describe('nextRound', () => {
    it('starts the next round when in round_results state', () => {
      const lobby = makeLobby({ config: { rounds: 3, timerSeconds: 15, timeBetweenRounds: -1, mode: 'random' } });
      engine.startGame(lobby);

      const items = lobby.gameSession!.rounds[0].items;
      const ranking = items.map((i) => i.id);
      engine.submitRanking(lobby, 'p1', ranking);
      engine.submitRanking(lobby, 'p2', ranking);
      engine.submitRanking(lobby, 'p3', ranking);

      expect(lobby.state).toBe('round_results');

      engine.nextRound(lobby);

      expect(lobby.state).toBe('playing');
      expect(lobby.gameSession!.rounds).toHaveLength(2);
      expect(callbacks.calls.onRoundStart).toHaveLength(2);
    });

    it('does nothing if not in round_results state', () => {
      const lobby = makeLobby();
      engine.startGame(lobby);

      // Currently in 'playing' state
      engine.nextRound(lobby);
      // Should not have started another round
      expect(callbacks.calls.onRoundStart).toHaveLength(1);
    });
  });

  describe('full game lifecycle', () => {
    it('plays through all rounds and ends the game', () => {
      const lobby = makeLobby({ config: { rounds: 2, timerSeconds: 10, timeBetweenRounds: -1, mode: 'random' } });
      engine.startGame(lobby);

      // Round 1
      let items = lobby.gameSession!.rounds[0].items;
      let ranking = items.map((i) => i.id);
      engine.submitRanking(lobby, 'p1', ranking);
      engine.submitRanking(lobby, 'p2', ranking);
      engine.submitRanking(lobby, 'p3', ranking);

      expect(lobby.state).toBe('round_results');

      // Advance to round 2
      engine.nextRound(lobby);
      expect(lobby.state).toBe('playing');

      // Round 2
      items = lobby.gameSession!.rounds[1].items;
      ranking = items.map((i) => i.id);
      engine.submitRanking(lobby, 'p1', ranking);
      engine.submitRanking(lobby, 'p2', ranking);
      engine.submitRanking(lobby, 'p3', ranking);

      expect(lobby.state).toBe('rematch_countdown');
      expect(callbacks.calls.onGameEnd).toHaveLength(1);
      expect(callbacks.calls.onRoundEnd).toHaveLength(2);
    });
  });

  describe('rematch countdown', () => {
    it('starts a 30-second countdown and sets state to rematch_countdown', () => {
      const lobby = makeLobby();
      lobby.state = 'results';

      engine.startRematchCountdown(lobby);

      expect(lobby.state).toBe('rematch_countdown');

      jest.advanceTimersByTime(1000);
      expect(callbacks.calls.onRematchCountdown).toHaveLength(1);
      expect(callbacks.calls.onRematchCountdown[0][1]).toBe(29);
    });

    it('auto-starts rematch when countdown expires', () => {
      const lobby = makeLobby();
      lobby.state = 'results';
      lobby.previousWinnerId = 'p1';
      lobby.gameSession = {
        currentRound: 0,
        totalRounds: 1,
        rounds: [],
        usedItemIds: new Set(),
        cumulativeScores: new Map(),
      };

      engine.startRematchCountdown(lobby);

      jest.advanceTimersByTime(30000);

      expect(callbacks.calls.onRematchStart).toHaveLength(1);
      expect(lobby.state).toBe('playing');
    });
  });

  describe('startRematch', () => {
    it('promotes spectators to active participants', () => {
      const lobby = makeLobby();
      lobby.players.set('spectator', makePlayer('spectator', { isSpectator: true }));
      lobby.previousWinnerId = 'p1';

      engine.startRematch(lobby);

      expect(lobby.players.get('spectator')!.isSpectator).toBe(false);
    });

    it('assigns crown to previous winner', () => {
      const lobby = makeLobby();
      lobby.previousWinnerId = 'p1';

      engine.startRematch(lobby);

      expect(lobby.players.get('p1')!.hasCrown).toBe(true);
      expect(lobby.players.get('p2')!.hasCrown).toBe(false);
    });

    it('removes disconnected players', () => {
      const lobby = makeLobby();
      lobby.players.get('p2')!.isConnected = false;
      lobby.previousWinnerId = null;

      engine.startRematch(lobby);

      expect(lobby.players.has('p2')).toBe(false);
      expect(lobby.players.has('p1')).toBe(true);
    });

    it('creates a fresh game session', () => {
      const lobby = makeLobby();
      lobby.previousWinnerId = null;

      engine.startRematch(lobby);

      expect(lobby.gameSession).not.toBeNull();
      expect(lobby.gameSession!.currentRound).toBe(0);
      expect(lobby.gameSession!.rounds).toHaveLength(1);
      expect(lobby.gameSession!.usedItemIds.size).toBe(5);
    });

    it('fires onRematchStart callback', () => {
      const lobby = makeLobby();
      lobby.previousWinnerId = null;

      engine.startRematch(lobby);

      expect(callbacks.calls.onRematchStart).toHaveLength(1);
      const [code, roundIndex, items, timerSeconds] = callbacks.calls.onRematchStart[0];
      expect(code).toBe('ABCDEF');
      expect(roundIndex).toBe(0);
      expect(items).toHaveLength(5);
      expect(timerSeconds).toBe(15);
    });

    it('starts a timer for the first round of the rematch', () => {
      const lobby = makeLobby();
      lobby.previousWinnerId = null;

      engine.startRematch(lobby);

      jest.advanceTimersByTime(1000);
      expect(callbacks.calls.onTimerTick).toHaveLength(1);
    });

    it('does not assign crown when previous winner left', () => {
      const lobby = makeLobby();
      lobby.previousWinnerId = 'left-player'; // not in lobby

      engine.startRematch(lobby);

      for (const [, player] of lobby.players) {
        expect(player.hasCrown).toBe(false);
      }
    });
  });

  describe('timer expiry', () => {
    it('ends the round when timer expires', () => {
      const lobby = makeLobby({ config: { rounds: 2, timerSeconds: 10, timeBetweenRounds: -1, mode: 'random' } });
      engine.startGame(lobby);

      // Don't submit any rankings — let timer expire
      jest.advanceTimersByTime(10000);

      expect(lobby.gameSession!.rounds[0].isComplete).toBe(true);
      expect(callbacks.calls.onRoundEnd).toHaveLength(1);
    });
  });
});
