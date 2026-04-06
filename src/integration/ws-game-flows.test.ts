/**
 * Integration tests for WebSocket game flows.
 *
 * These tests spin up the actual HTTP + WebSocket server, connect real
 * WebSocket clients, and verify the end-to-end message flows.
 *
 * Validates: Requirements 11.1, 11.3, 11.4, 11.5, 12.2
 */

import http from 'http';
import express from 'express';
import WebSocket from 'ws';
import { LobbyManager } from '../lobby/lobby-manager';
import { GameEngine, GameEngineCallbacks } from '../game/game-engine';
import { ItemStore } from '../items/item-store';
import { GameWebSocketServer } from '../ws/ws-server';
import { createRouter } from '../api/routes';
import { CLIENT_MSG, SERVER_MSG, ServerMessage } from '@shared/ws-messages';
import { Item } from '@shared/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeItems(count: number, category: string): Item[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${category}-item-${i}`,
    displayName: `${category} Item ${i}`,
    imageUrl: `http://img/${category}/${i}`,
    category,
  }));
}

/** Start a fresh server on a random port. Returns cleanup handle. */
function createTestServer() {
  const lobbyManager = new LobbyManager();
  const items = [...makeItems(50, 'alpha'), ...makeItems(50, 'beta')];
  const itemStore = new ItemStore(items);

  let wsServer: GameWebSocketServer;

  const callbacks: GameEngineCallbacks = {
    onTimerTick(lobbyCode, secondsRemaining) {
      wsServer.broadcastToLobby(lobbyCode, {
        type: SERVER_MSG.TIMER_TICK,
        payload: { secondsRemaining },
      });
    },
    onRoundStart(lobbyCode, roundIndex, items, timerSeconds) {
      wsServer.broadcastToLobby(lobbyCode, {
        type: SERVER_MSG.GAME_STARTED,
        payload: { roundIndex, items, timerSeconds },
      });
    },
    onRoundEnd(lobbyCode, roundIndex, averageRanking, scores, leaderboard) {
      wsServer.broadcastToLobby(lobbyCode, {
        type: SERVER_MSG.ROUND_ENDED,
        payload: { roundIndex, averageRanking, scores, leaderboard },
      });
    },
    onGameEnd(lobbyCode, leaderboard, winnerId, isTie) {
      wsServer.broadcastToLobby(lobbyCode, {
        type: SERVER_MSG.GAME_ENDED,
        payload: { leaderboard, winnerId, isTie },
      });
    },
    onRematchCountdown(lobbyCode, secondsRemaining) {
      wsServer.broadcastToLobby(lobbyCode, {
        type: SERVER_MSG.REMATCH_COUNTDOWN,
        payload: { secondsRemaining },
      });
    },
    onRematchStart(lobbyCode, roundIndex, items, timerSeconds) {
      wsServer.broadcastToLobby(lobbyCode, {
        type: SERVER_MSG.REMATCH_STARTED,
        payload: { roundIndex, items, timerSeconds },
      });
    },
    onBetweenRoundsTick(lobbyCode, secondsRemaining) {
      wsServer.broadcastToLobby(lobbyCode, {
        type: SERVER_MSG.BETWEEN_ROUNDS_TICK,
        payload: { secondsRemaining },
      });
    },
  };

  const gameEngine = new GameEngine(itemStore, callbacks);

  const app = express();
  app.use(express.json());
  app.use(createRouter(lobbyManager));

  const server = http.createServer(app);
  wsServer = new GameWebSocketServer(server, lobbyManager, gameEngine);

  return { server, lobbyManager, gameEngine, wsServer, app };
}

/** Start listening on a random port and return the port number. */
function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, () => {
      const addr = server.address() as { port: number };
      resolve(addr.port);
    });
  });
}

/** Close the server and WebSocket server. */
function closeServer(server: http.Server, wsServer: GameWebSocketServer): Promise<void> {
  return new Promise((resolve) => {
    wsServer.close();
    server.close(() => resolve());
  });
}

/** Connect a WebSocket client to the server. */
function connectClient(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

/** Send a typed client message. */
function send(ws: WebSocket, type: string, payload: Record<string, unknown>): void {
  ws.send(JSON.stringify({ type, payload }));
}

/** Wait for the next message of a specific type from a WebSocket. */
function waitForMessage(ws: WebSocket, type: string, timeoutMs = 5000): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeListener('message', handler);
      reject(new Error(`Timed out waiting for message type "${type}"`));
    }, timeoutMs);

    function handler(data: WebSocket.Data) {
      const msg: ServerMessage = JSON.parse(data.toString());
      if (msg.type === type) {
        clearTimeout(timer);
        ws.removeListener('message', handler);
        resolve(msg);
      }
    }

    ws.on('message', handler);
  });
}

/** Collect all messages received within a time window. */
function collectMessages(ws: WebSocket, durationMs: number): Promise<ServerMessage[]> {
  return new Promise((resolve) => {
    const messages: ServerMessage[] = [];
    function handler(data: WebSocket.Data) {
      messages.push(JSON.parse(data.toString()));
    }
    ws.on('message', handler);
    setTimeout(() => {
      ws.removeListener('message', handler);
      resolve(messages);
    }, durationMs);
  });
}

/** Drain any pending messages from a WebSocket (non-blocking). */
function drainMessages(ws: WebSocket, durationMs = 100): Promise<ServerMessage[]> {
  return collectMessages(ws, durationMs);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('WebSocket game flows (integration)', () => {
  let server: http.Server;
  let wsServer: GameWebSocketServer;
  let lobbyManager: LobbyManager;
  let gameEngine: GameEngine;
  let port: number;
  let clients: WebSocket[] = [];

  beforeEach(async () => {
    jest.useFakeTimers({ advanceTimers: true });
    const ctx = createTestServer();
    server = ctx.server;
    wsServer = ctx.wsServer;
    lobbyManager = ctx.lobbyManager;
    gameEngine = ctx.gameEngine;
    port = await listen(server);
    clients = [];
  });

  afterEach(async () => {
    // Close all client connections
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }
    clients = [];
    await closeServer(server, wsServer);
    jest.useRealTimers();
  });

  async function createAndConnect(): Promise<WebSocket> {
    const ws = await connectClient(port);
    clients.push(ws);
    return ws;
  }

  /** Join a lobby and return the player's assigned ID from the AVATAR_ASSIGNED message. */
  async function joinLobby(ws: WebSocket, lobbyCode: string, username: string): Promise<string> {
    const avatarPromise = waitForMessage(ws, SERVER_MSG.AVATAR_ASSIGNED);
    send(ws, CLIENT_MSG.JOIN_LOBBY, { lobbyCode, username });
    const avatarMsg = await avatarPromise;
    return (avatarMsg.payload as any).playerId;
  }

  // ─── Test: Player join → lobby broadcast ────────────────────────────

  test('player join broadcasts lobby update to all clients', async () => {
    const lobby = lobbyManager.createLobby({});
    const code = lobby.code;

    // Player 1 joins
    const ws1 = await createAndConnect();
    const lobbyUpdateP1 = waitForMessage(ws1, SERVER_MSG.LOBBY_UPDATE);
    await joinLobby(ws1, code, 'Alice');
    const update1 = await lobbyUpdateP1;
    expect((update1.payload as any).players).toHaveLength(1);
    expect((update1.payload as any).players[0].username).toBe('Alice');

    // Player 2 joins — both should get lobby update
    const ws2 = await createAndConnect();
    const lobbyUpdateP1Again = waitForMessage(ws1, SERVER_MSG.LOBBY_UPDATE);
    const lobbyUpdateP2 = waitForMessage(ws2, SERVER_MSG.LOBBY_UPDATE);
    await joinLobby(ws2, code, 'Bob');

    const [u1, u2] = await Promise.all([lobbyUpdateP1Again, lobbyUpdateP2]);
    expect((u1.payload as any).players).toHaveLength(2);
    expect((u2.payload as any).players).toHaveLength(2);
  });

  // ─── Test: Full round lifecycle ─────────────────────────────────────

  test('full round lifecycle: start → rank → submit → score → results', async () => {
    const lobby = lobbyManager.createLobby({ rounds: 1, timerSeconds: 30 });
    const code = lobby.code;

    const ws1 = await createAndConnect();
    const ws2 = await createAndConnect();

    const p1Id = await joinLobby(ws1, code, 'Alice');
    await drainMessages(ws1);
    await joinLobby(ws2, code, 'Bob');
    await drainMessages(ws1);
    await drainMessages(ws2);

    // Host starts game
    const gameStartP1 = waitForMessage(ws1, SERVER_MSG.GAME_STARTED);
    const gameStartP2 = waitForMessage(ws2, SERVER_MSG.GAME_STARTED);
    send(ws1, CLIENT_MSG.START_GAME, { lobbyCode: code });

    const [gs1, gs2] = await Promise.all([gameStartP1, gameStartP2]);
    const items = (gs1.payload as any).items as Item[];
    expect(items).toHaveLength(5);
    expect((gs2.payload as any).items).toHaveLength(5);

    // Both players submit rankings
    const ranking = items.map((i) => i.id);
    const roundEndP1 = waitForMessage(ws1, SERVER_MSG.ROUND_ENDED);
    const roundEndP2 = waitForMessage(ws2, SERVER_MSG.ROUND_ENDED);

    // Since rounds=1, GAME_ENDED fires immediately after ROUND_ENDED.
    // Set up listeners before submitting to avoid missing the message.
    const gameEndP1 = waitForMessage(ws1, SERVER_MSG.GAME_ENDED);
    const gameEndP2 = waitForMessage(ws2, SERVER_MSG.GAME_ENDED);

    send(ws1, CLIENT_MSG.SUBMIT_RANKING, { lobbyCode: code, roundIndex: 0, ranking });
    send(ws2, CLIENT_MSG.SUBMIT_RANKING, { lobbyCode: code, roundIndex: 0, ranking });

    const [re1, re2] = await Promise.all([roundEndP1, roundEndP2]);
    expect((re1.payload as any).roundIndex).toBe(0);
    expect((re1.payload as any).scores).toHaveLength(2);
    expect((re1.payload as any).leaderboard.length).toBeGreaterThanOrEqual(2);
    expect((re2.payload as any).roundIndex).toBe(0);

    const [ge1, ge2] = await Promise.all([gameEndP1, gameEndP2]);
    expect((ge1.payload as any).leaderboard.length).toBeGreaterThanOrEqual(2);
    expect(typeof (ge1.payload as any).winnerId).toBe('string');
    expect(typeof (ge2.payload as any).isTie).toBe('boolean');
  });

  // ─── Test: Timer expiry auto-submission ─────────────────────────────

  test('timer expiry auto-submits default rankings and ends round', async () => {
    const lobby = lobbyManager.createLobby({ rounds: 1, timerSeconds: 5 });
    const code = lobby.code;

    const ws1 = await createAndConnect();
    const ws2 = await createAndConnect();

    await joinLobby(ws1, code, 'Alice');
    await joinLobby(ws2, code, 'Bob');
    await drainMessages(ws1);
    await drainMessages(ws2);

    // Start game
    const gameStartP1 = waitForMessage(ws1, SERVER_MSG.GAME_STARTED);
    send(ws1, CLIENT_MSG.START_GAME, { lobbyCode: code });
    await gameStartP1;
    await drainMessages(ws2);

    // Don't submit — wait for timer to expire
    const roundEndP1 = waitForMessage(ws1, SERVER_MSG.ROUND_ENDED, 10000);
    const roundEndP2 = waitForMessage(ws2, SERVER_MSG.ROUND_ENDED, 10000);

    // Advance timers to trigger expiry
    jest.advanceTimersByTime(5000);

    const [re1, re2] = await Promise.all([roundEndP1, roundEndP2]);
    expect((re1.payload as any).roundIndex).toBe(0);
    expect((re1.payload as any).scores).toHaveLength(2);
    expect((re2.payload as any).roundIndex).toBe(0);
  });

  // ─── Test: Early completion when all players submit ─────────────────

  test('early completion when all players submit before timer', async () => {
    const lobby = lobbyManager.createLobby({ rounds: 2, timerSeconds: 60 });
    const code = lobby.code;

    const ws1 = await createAndConnect();
    const ws2 = await createAndConnect();
    const ws3 = await createAndConnect();

    await joinLobby(ws1, code, 'Alice');
    await joinLobby(ws2, code, 'Bob');
    await joinLobby(ws3, code, 'Charlie');
    await drainMessages(ws1);
    await drainMessages(ws2);
    await drainMessages(ws3);

    // Start game
    const gameStartP1 = waitForMessage(ws1, SERVER_MSG.GAME_STARTED);
    send(ws1, CLIENT_MSG.START_GAME, { lobbyCode: code });
    const gs = await gameStartP1;
    await drainMessages(ws2);
    await drainMessages(ws3);

    const items = (gs.payload as any).items as Item[];
    const ranking = items.map((i) => i.id);

    // All submit — round should end immediately (no timer wait)
    const roundEndP1 = waitForMessage(ws1, SERVER_MSG.ROUND_ENDED);

    send(ws1, CLIENT_MSG.SUBMIT_RANKING, { lobbyCode: code, roundIndex: 0, ranking });
    send(ws2, CLIENT_MSG.SUBMIT_RANKING, { lobbyCode: code, roundIndex: 0, ranking });
    send(ws3, CLIENT_MSG.SUBMIT_RANKING, { lobbyCode: code, roundIndex: 0, ranking });

    const re = await roundEndP1;
    expect((re.payload as any).roundIndex).toBe(0);
    // Timer was 60s but round ended early — lobby should be in round_results
    expect(lobby.state).toBe('round_results');
  });

  // ─── Test: Reconnection within grace period ─────────────────────────

  test('reconnection within 15-second grace period restores player', async () => {
    const lobby = lobbyManager.createLobby({});
    const code = lobby.code;

    const ws1 = await createAndConnect();
    const ws2 = await createAndConnect();

    await joinLobby(ws1, code, 'Alice');
    const p2Id = await joinLobby(ws2, code, 'Bob');
    await drainMessages(ws1);
    await drainMessages(ws2);

    // Player 2 disconnects
    const disconnectMsg = waitForMessage(ws1, SERVER_MSG.PLAYER_DISCONNECTED);
    ws2.close();
    const disc = await disconnectMsg;
    expect((disc.payload as any).username).toBe('Bob');

    // Player should still be in lobby but disconnected
    const player2 = lobby.players.get(p2Id);
    expect(player2).toBeDefined();
    expect(player2!.isConnected).toBe(false);

    // Reconnect within grace period (before 15s)
    jest.advanceTimersByTime(5000);

    const ws2Reconnect = await createAndConnect();
    const reconnectMsg = waitForMessage(ws1, SERVER_MSG.PLAYER_RECONNECTED);
    // Rejoin with same username triggers reconnection
    send(ws2Reconnect, CLIENT_MSG.JOIN_LOBBY, { lobbyCode: code, username: 'Bob' });
    const recon = await reconnectMsg;
    expect((recon.payload as any).username).toBe('Bob');

    // Player should be connected again
    expect(player2!.isConnected).toBe(true);
  });

  // ─── Test: Reconnection after grace period (player removed) ─────────

  test('player removed after 15-second grace period expires', async () => {
    const lobby = lobbyManager.createLobby({});
    const code = lobby.code;

    const ws1 = await createAndConnect();
    const ws2 = await createAndConnect();

    await joinLobby(ws1, code, 'Alice');
    const p2Id = await joinLobby(ws2, code, 'Bob');
    await drainMessages(ws1);
    await drainMessages(ws2);

    // Player 2 disconnects
    const disconnectMsg = waitForMessage(ws1, SERVER_MSG.PLAYER_DISCONNECTED);
    ws2.close();
    await disconnectMsg;

    // Wait for grace period to expire
    // Collect lobby updates that come from the removal
    const lobbyUpdateAfterRemoval = waitForMessage(ws1, SERVER_MSG.LOBBY_UPDATE, 20000);
    jest.advanceTimersByTime(15000);

    const update = await lobbyUpdateAfterRemoval;
    // Player 2 should be removed
    expect((update.payload as any).players).toHaveLength(1);
    expect((update.payload as any).players[0].username).toBe('Alice');
    expect(lobby.players.has(p2Id)).toBe(false);
  });

  // ─── Test: Host disconnect → reassignment broadcast ─────────────────

  test('host disconnect triggers host reassignment broadcast', async () => {
    const lobby = lobbyManager.createLobby({});
    const code = lobby.code;

    const ws1 = await createAndConnect();
    const ws2 = await createAndConnect();

    await joinLobby(ws1, code, 'Alice'); // host
    await joinLobby(ws2, code, 'Bob');
    await drainMessages(ws1);
    await drainMessages(ws2);

    // Host disconnects
    const disconnectMsg = waitForMessage(ws2, SERVER_MSG.PLAYER_DISCONNECTED);
    ws1.close();
    await disconnectMsg;

    // Wait for grace period to expire → host reassignment
    const hostChangedMsg = waitForMessage(ws2, SERVER_MSG.HOST_CHANGED, 20000);
    jest.advanceTimersByTime(15000);

    const hc = await hostChangedMsg;
    expect((hc.payload as any).newHostUsername).toBe('Bob');
  });

  // ─── Test: Rematch countdown and auto-start ─────────────────────────

  test('rematch countdown and auto-start after game ends', async () => {
    const lobby = lobbyManager.createLobby({ rounds: 1, timerSeconds: 5 });
    const code = lobby.code;

    const ws1 = await createAndConnect();
    const ws2 = await createAndConnect();

    await joinLobby(ws1, code, 'Alice');
    await joinLobby(ws2, code, 'Bob');
    await drainMessages(ws1);
    await drainMessages(ws2);

    // Start game
    const gameStartP1 = waitForMessage(ws1, SERVER_MSG.GAME_STARTED);
    send(ws1, CLIENT_MSG.START_GAME, { lobbyCode: code });
    const gs = await gameStartP1;
    await drainMessages(ws2);

    // Submit rankings to end the game
    const items = (gs.payload as any).items as Item[];
    const ranking = items.map((i) => i.id);

    const gameEndP1 = waitForMessage(ws1, SERVER_MSG.GAME_ENDED);
    send(ws1, CLIENT_MSG.SUBMIT_RANKING, { lobbyCode: code, roundIndex: 0, ranking });
    send(ws2, CLIENT_MSG.SUBMIT_RANKING, { lobbyCode: code, roundIndex: 0, ranking });

    await gameEndP1;
    await drainMessages(ws1);
    await drainMessages(ws2);

    // Start rematch countdown
    gameEngine.startRematchCountdown(lobby);

    // Should receive countdown ticks
    const countdownMsg = waitForMessage(ws1, SERVER_MSG.REMATCH_COUNTDOWN, 5000);
    jest.advanceTimersByTime(1000);
    const cd = await countdownMsg;
    expect((cd.payload as any).secondsRemaining).toBe(29);

    // Advance to end of countdown
    const rematchStartP1 = waitForMessage(ws1, SERVER_MSG.REMATCH_STARTED, 35000);
    const rematchStartP2 = waitForMessage(ws2, SERVER_MSG.REMATCH_STARTED, 35000);
    jest.advanceTimersByTime(29000);

    const [rs1, rs2] = await Promise.all([rematchStartP1, rematchStartP2]);
    expect((rs1.payload as any).roundIndex).toBe(0);
    expect((rs1.payload as any).items).toHaveLength(5);
    expect((rs2.payload as any).roundIndex).toBe(0);
    expect(lobby.state).toBe('playing');
  });

  // ─── Test: Spectator promotion on rematch ───────────────────────────

  test('spectator is promoted to active participant on rematch', async () => {
    const lobby = lobbyManager.createLobby({ rounds: 1, timerSeconds: 5 });
    const code = lobby.code;

    const ws1 = await createAndConnect();
    const ws2 = await createAndConnect();

    await joinLobby(ws1, code, 'Alice');
    await joinLobby(ws2, code, 'Bob');
    await drainMessages(ws1);
    await drainMessages(ws2);

    // Start game
    const gameStartP1 = waitForMessage(ws1, SERVER_MSG.GAME_STARTED);
    send(ws1, CLIENT_MSG.START_GAME, { lobbyCode: code });
    const gs = await gameStartP1;
    await drainMessages(ws2);

    // Spectator joins mid-game
    const ws3 = await createAndConnect();
    const spectatorMsg = waitForMessage(ws3, SERVER_MSG.JOINED_AS_SPECTATOR);
    const p3Id = await joinLobby(ws3, code, 'Charlie');
    const specMsg = await spectatorMsg;
    expect((specMsg.payload as any).gameState).toBe('playing');

    // Verify Charlie is a spectator
    const charlie = lobby.players.get(p3Id);
    expect(charlie).toBeDefined();
    expect(charlie!.isSpectator).toBe(true);

    // End the game
    const items = (gs.payload as any).items as Item[];
    const ranking = items.map((i) => i.id);
    const gameEndP1 = waitForMessage(ws1, SERVER_MSG.GAME_ENDED);
    send(ws1, CLIENT_MSG.SUBMIT_RANKING, { lobbyCode: code, roundIndex: 0, ranking });
    send(ws2, CLIENT_MSG.SUBMIT_RANKING, { lobbyCode: code, roundIndex: 0, ranking });
    await gameEndP1;
    await drainMessages(ws1);
    await drainMessages(ws2);
    await drainMessages(ws3);

    // Start rematch — spectator should be promoted
    gameEngine.startRematchCountdown(lobby);
    const rematchStartP3 = waitForMessage(ws3, SERVER_MSG.REMATCH_STARTED, 35000);
    jest.advanceTimersByTime(30000);
    await rematchStartP3;

    // Charlie should no longer be a spectator
    expect(charlie!.isSpectator).toBe(false);
  });
});
