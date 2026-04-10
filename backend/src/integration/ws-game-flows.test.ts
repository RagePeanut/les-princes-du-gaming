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

// Set env var required by avatar-generator before any test runs
process.env.CLOUDFLARE_AVATAR_BASE_URL = 'https://test.r2.dev';

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
  wsServer = new GameWebSocketServer(server, lobbyManager, gameEngine, itemStore);

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
    const payload = avatarMsg.payload as any;
    expect(typeof payload.playerId).toBe('string');
    expect(typeof payload.avatarHeadUrl).toBe('string');
    expect(payload.avatarHeadUrl).toMatch(/^https?:\/\/.+\/heads\/.+\.png$/);
    expect(payload.avatarAccessoryUrl === null || typeof payload.avatarAccessoryUrl === 'string').toBe(true);
    if (payload.avatarAccessoryUrl !== null) {
      expect(payload.avatarAccessoryUrl).toMatch(/^https?:\/\/.+\/accessories\/.+\.png$/);
    }
    expect(payload).not.toHaveProperty('avatarDataUri');
    return payload.playerId;
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
    // Collect avatar messages sent to the reconnected player
    const avatarMsgsPromise = collectMessages(ws2Reconnect, 500);
    // Rejoin with same username triggers reconnection
    send(ws2Reconnect, CLIENT_MSG.JOIN_LOBBY, { lobbyCode: code, username: 'Bob' });
    const recon = await reconnectMsg;
    expect((recon.payload as any).username).toBe('Bob');

    // Player should be connected again
    expect(player2!.isConnected).toBe(true);

    // Verify reconnected player receives AVATAR_ASSIGNED messages with new fields
    const avatarMsgs = await avatarMsgsPromise;
    const avatarAssigned = avatarMsgs.filter((m) => m.type === SERVER_MSG.AVATAR_ASSIGNED);
    expect(avatarAssigned.length).toBeGreaterThanOrEqual(2); // Both Alice and Bob
    for (const msg of avatarAssigned) {
      const p = msg.payload as any;
      expect(typeof p.playerId).toBe('string');
      expect(typeof p.avatarHeadUrl).toBe('string');
      expect(p.avatarHeadUrl).toMatch(/^https?:\/\/.+\/heads\/.+\.png$/);
      expect(p.avatarAccessoryUrl === null || typeof p.avatarAccessoryUrl === 'string').toBe(true);
      if (p.avatarAccessoryUrl !== null) {
        expect(p.avatarAccessoryUrl).toMatch(/^https?:\/\/.+\/accessories\/.+\.png$/);
      }
      expect(p).not.toHaveProperty('avatarDataUri');
    }
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


// ─── Tier List Integration Tests ────────────────────────────────────────────

describe('Tier List WebSocket game flows (integration)', () => {
  let server: http.Server;
  let wsServer: GameWebSocketServer;
  let lobbyManager: LobbyManager;
  let port: number;
  let clients: WebSocket[] = [];

  beforeEach(async () => {
    jest.useFakeTimers({ advanceTimers: true });
    const ctx = createTestServer();
    server = ctx.server;
    wsServer = ctx.wsServer;
    lobbyManager = ctx.lobbyManager;
    port = await listen(server);
    clients = [];
  });

  afterEach(async () => {
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

  async function joinLobby(ws: WebSocket, lobbyCode: string, username: string): Promise<string> {
    const avatarPromise = waitForMessage(ws, SERVER_MSG.AVATAR_ASSIGNED);
    send(ws, CLIENT_MSG.JOIN_LOBBY, { lobbyCode, username });
    const avatarMsg = await avatarPromise;
    const payload = avatarMsg.payload as any;
    expect(typeof payload.playerId).toBe('string');
    expect(typeof payload.avatarHeadUrl).toBe('string');
    expect(payload.avatarHeadUrl).toMatch(/^https?:\/\/.+\/heads\/.+\.png$/);
    expect(payload.avatarAccessoryUrl === null || typeof payload.avatarAccessoryUrl === 'string').toBe(true);
    if (payload.avatarAccessoryUrl !== null) {
      expect(payload.avatarAccessoryUrl).toMatch(/^https?:\/\/.+\/accessories\/.+\.png$/);
    }
    expect(payload).not.toHaveProperty('avatarDataUri');
    return payload.playerId;
  }

  // ─── Test: Full tier list game flow ─────────────────────────────────

  test('full tier list game flow: roulette → vote → suspense → result → game end', async () => {
    const lobby = lobbyManager.createLobby({ timerSeconds: 15, timeBetweenRounds: 0 }, 'tierlist');
    const code = lobby.code;

    const ws1 = await createAndConnect();
    const ws2 = await createAndConnect();
    const ws3 = await createAndConnect();

    await joinLobby(ws1, code, 'Alice');
    await drainMessages(ws1);
    await joinLobby(ws2, code, 'Bob');
    await drainMessages(ws1);
    await drainMessages(ws2);
    await joinLobby(ws3, code, 'Charlie');
    await drainMessages(ws1);
    await drainMessages(ws2);
    await drainMessages(ws3);

    // Host starts game → roulette
    const rouletteStartP1 = waitForMessage(ws1, SERVER_MSG.TIERLIST_ROULETTE_START);
    const rouletteStartP2 = waitForMessage(ws2, SERVER_MSG.TIERLIST_ROULETTE_START);
    send(ws1, CLIENT_MSG.START_GAME, { lobbyCode: code });

    const [rs1, rs2] = await Promise.all([rouletteStartP1, rouletteStartP2]);
    expect((rs1.payload as any).themes.length).toBeGreaterThan(0);
    expect((rs2.payload as any).themes.length).toBeGreaterThan(0);

    // Set up listeners BEFORE advancing timers to avoid timeout race
    const rouletteResultP1 = waitForMessage(ws1, SERVER_MSG.TIERLIST_ROULETTE_RESULT, 10000);
    const rouletteResultP2 = waitForMessage(ws2, SERVER_MSG.TIERLIST_ROULETTE_RESULT, 10000);
    // Advance 5s for roulette timer
    jest.advanceTimersByTime(5000);

    const [rr1, rr2] = await Promise.all([rouletteResultP1, rouletteResultP2]);
    expect(typeof (rr1.payload as any).theme).toBe('string');
    expect((rr1.payload as any).items.length).toBeGreaterThanOrEqual(5);
    expect((rr2.payload as any).items.length).toBeGreaterThanOrEqual(5);

    const totalItems = (rr1.payload as any).items.length;

    // Set up listeners BEFORE advancing timers
    const roundStartP1 = waitForMessage(ws1, SERVER_MSG.TIERLIST_ROUND_START, 10000);
    const roundStartP2 = waitForMessage(ws2, SERVER_MSG.TIERLIST_ROUND_START, 10000);
    // Advance 1s for roulette-to-round transition
    jest.advanceTimersByTime(1000);

    const [rsrt1, rsrt2] = await Promise.all([roundStartP1, roundStartP2]);
    expect((rsrt1.payload as any).roundIndex).toBe(0);
    expect((rsrt1.payload as any).totalItems).toBe(totalItems);
    expect((rsrt1.payload as any).item).toBeDefined();
    expect((rsrt2.payload as any).roundIndex).toBe(0);

    // Play through ALL rounds
    for (let round = 0; round < totalItems; round++) {
      const isLastRound = round === totalItems - 1;

      // All three players submit tier votes
      const suspenseP1 = waitForMessage(ws1, SERVER_MSG.TIERLIST_SUSPENSE_START);
      send(ws1, CLIENT_MSG.SUBMIT_TIER_VOTE, { lobbyCode: code, roundIndex: round, tier: 'A', confirmed: true });
      send(ws2, CLIENT_MSG.SUBMIT_TIER_VOTE, { lobbyCode: code, roundIndex: round, tier: 'B', confirmed: true });
      send(ws3, CLIENT_MSG.SUBMIT_TIER_VOTE, { lobbyCode: code, roundIndex: round, tier: 'A', confirmed: true });

      // Early completion triggers suspense
      await suspenseP1;

      // Set up ALL listeners BEFORE advancing timers
      // On the last round, TIERLIST_GAME_ENDED is sent right after TIERLIST_ROUND_RESULT
      const roundResultP1 = waitForMessage(ws1, SERVER_MSG.TIERLIST_ROUND_RESULT, 10000);
      const gameEndP1 = isLastRound ? waitForMessage(ws1, SERVER_MSG.TIERLIST_GAME_ENDED, 10000) : null;
      const gameEndP2 = isLastRound ? waitForMessage(ws2, SERVER_MSG.TIERLIST_GAME_ENDED, 10000) : null;

      jest.advanceTimersByTime(3000);

      const result = await roundResultP1;
      expect((result.payload as any).roundIndex).toBe(round);
      expect((result.payload as any).finalTier).toBeDefined();
      expect((result.payload as any).votes).toHaveLength(3);
      expect((result.payload as any).scores).toHaveLength(3);
      expect((result.payload as any).leaderboard.length).toBeGreaterThanOrEqual(3);

      if (isLastRound) {
        const [ge1, ge2] = await Promise.all([gameEndP1!, gameEndP2!]);
        expect((ge1.payload as any).tierList).toBeDefined();
        expect((ge1.payload as any).tierList.tiers).toHaveLength(6);
        expect((ge1.payload as any).leaderboard.length).toBeGreaterThanOrEqual(3);
        expect(typeof (ge1.payload as any).winnerId).toBe('string');
        expect(typeof (ge1.payload as any).isTie).toBe('boolean');
        expect((ge2.payload as any).tierList).toBeDefined();
      } else {
        // Not last round → wait for next round start (timeBetweenRounds=0 → 1s interval tick)
        const nextRoundP1 = waitForMessage(ws1, SERVER_MSG.TIERLIST_ROUND_START, 10000);
        jest.advanceTimersByTime(1000);
        await nextRoundP1;
      }
    }

    expect(lobby.state).toBe('rematch_countdown');
  }, 30000);

  // ─── Test: Vote status broadcast without tier ───────────────────────

  test('vote status broadcast contains only playerId and hasVoted, no tier', async () => {
    const lobby = lobbyManager.createLobby({ timerSeconds: 30, timeBetweenRounds: 0 }, 'tierlist');
    const code = lobby.code;

    const ws1 = await createAndConnect();
    const ws2 = await createAndConnect();
    const ws3 = await createAndConnect();

    const p1Id = await joinLobby(ws1, code, 'Alice');
    await drainMessages(ws1);
    await joinLobby(ws2, code, 'Bob');
    await drainMessages(ws1);
    await drainMessages(ws2);
    await joinLobby(ws3, code, 'Charlie');
    await drainMessages(ws1);
    await drainMessages(ws2);
    await drainMessages(ws3);

    // Start game
    send(ws1, CLIENT_MSG.START_GAME, { lobbyCode: code });
    await waitForMessage(ws1, SERVER_MSG.TIERLIST_ROULETTE_START);

    // Advance through roulette (5s) + transition (1s)
    jest.advanceTimersByTime(5000);
    await waitForMessage(ws1, SERVER_MSG.TIERLIST_ROULETTE_RESULT);
    jest.advanceTimersByTime(1000);
    await waitForMessage(ws1, SERVER_MSG.TIERLIST_ROUND_START);
    await drainMessages(ws2);
    await drainMessages(ws3);

    // Player 1 votes — player 2 should receive vote status
    const voteStatusP2 = waitForMessage(ws2, SERVER_MSG.TIERLIST_VOTE_STATUS);
    send(ws1, CLIENT_MSG.SUBMIT_TIER_VOTE, { lobbyCode: code, roundIndex: 0, tier: 'S', confirmed: true });

    const vs = await voteStatusP2;
    const payload = vs.payload as any;

    // Must contain playerId and hasVoted
    expect(payload.playerId).toBe(p1Id);
    expect(payload.hasVoted).toBe(true);

    // Must NOT contain tier information
    expect(payload.tier).toBeUndefined();
    expect(payload.votedTier).toBeUndefined();
    expect(payload.vote).toBeUndefined();
  });

  // ─── Test: Early completion via WebSocket ───────────────────────────

  test('early completion: all players vote before timer → round ends immediately', async () => {
    const lobby = lobbyManager.createLobby({ timerSeconds: 60, timeBetweenRounds: 0 }, 'tierlist');
    const code = lobby.code;

    const ws1 = await createAndConnect();
    const ws2 = await createAndConnect();
    const ws3 = await createAndConnect();

    await joinLobby(ws1, code, 'Alice');
    await drainMessages(ws1);
    await joinLobby(ws2, code, 'Bob');
    await drainMessages(ws1);
    await drainMessages(ws2);
    await joinLobby(ws3, code, 'Charlie');
    await drainMessages(ws1);
    await drainMessages(ws2);
    await drainMessages(ws3);

    // Start game and advance through roulette
    send(ws1, CLIENT_MSG.START_GAME, { lobbyCode: code });
    await waitForMessage(ws1, SERVER_MSG.TIERLIST_ROULETTE_START);
    jest.advanceTimersByTime(5000);
    await waitForMessage(ws1, SERVER_MSG.TIERLIST_ROULETTE_RESULT);
    jest.advanceTimersByTime(1000);
    await waitForMessage(ws1, SERVER_MSG.TIERLIST_ROUND_START);
    await drainMessages(ws2);
    await drainMessages(ws3);

    // All three players vote — should trigger early completion (suspense immediately)
    const suspenseP1 = waitForMessage(ws1, SERVER_MSG.TIERLIST_SUSPENSE_START);
    send(ws1, CLIENT_MSG.SUBMIT_TIER_VOTE, { lobbyCode: code, roundIndex: 0, tier: 'A', confirmed: true });
    send(ws2, CLIENT_MSG.SUBMIT_TIER_VOTE, { lobbyCode: code, roundIndex: 0, tier: 'A', confirmed: true });
    send(ws3, CLIENT_MSG.SUBMIT_TIER_VOTE, { lobbyCode: code, roundIndex: 0, tier: 'A', confirmed: true });

    // Suspense should start without waiting for the 60s timer
    const suspense = await suspenseP1;
    expect((suspense.payload as any).roundIndex).toBe(0);
    expect(lobby.state).toBe('suspense');

    // Advance 3s for suspense → round result
    const roundResultP1 = waitForMessage(ws1, SERVER_MSG.TIERLIST_ROUND_RESULT);
    jest.advanceTimersByTime(3000);

    const result = await roundResultP1;
    expect((result.payload as any).roundIndex).toBe(0);
    // All voted A (value 5), so average = 5, tier = A
    expect((result.payload as any).finalTier).toBe('A');
    expect((result.payload as any).averageValue).toBe(5);
  });

  // ─── Test: Rematch after 30 seconds ─────────────────────────────────

  test('rematch auto-starts after 30-second countdown following game end', async () => {
    const lobby = lobbyManager.createLobby({ timerSeconds: 15, timeBetweenRounds: 0 }, 'tierlist');
    const code = lobby.code;

    const ws1 = await createAndConnect();
    const ws2 = await createAndConnect();
    const ws3 = await createAndConnect();

    await joinLobby(ws1, code, 'Alice');
    await drainMessages(ws1);
    await joinLobby(ws2, code, 'Bob');
    await drainMessages(ws1);
    await drainMessages(ws2);
    await joinLobby(ws3, code, 'Charlie');
    await drainMessages(ws1);
    await drainMessages(ws2);
    await drainMessages(ws3);

    // Start game and advance through roulette
    send(ws1, CLIENT_MSG.START_GAME, { lobbyCode: code });
    await waitForMessage(ws1, SERVER_MSG.TIERLIST_ROULETTE_START);
    jest.advanceTimersByTime(5000);
    await waitForMessage(ws1, SERVER_MSG.TIERLIST_ROULETTE_RESULT);
    jest.advanceTimersByTime(1000);
    await waitForMessage(ws1, SERVER_MSG.TIERLIST_ROUND_START);
    await drainMessages(ws2);
    await drainMessages(ws3);

    const totalItems = lobby.tierListSession!.totalRounds;

    // Play through all rounds quickly
    for (let round = 0; round < totalItems; round++) {
      send(ws1, CLIENT_MSG.SUBMIT_TIER_VOTE, { lobbyCode: code, roundIndex: round, tier: 'B', confirmed: true });
      send(ws2, CLIENT_MSG.SUBMIT_TIER_VOTE, { lobbyCode: code, roundIndex: round, tier: 'B', confirmed: true });
      send(ws3, CLIENT_MSG.SUBMIT_TIER_VOTE, { lobbyCode: code, roundIndex: round, tier: 'B', confirmed: true });

      // Wait for suspense
      await waitForMessage(ws1, SERVER_MSG.TIERLIST_SUSPENSE_START);

      // Advance 3s for suspense
      if (round < totalItems - 1) {
        const nextRound = waitForMessage(ws1, SERVER_MSG.TIERLIST_ROUND_START);
        jest.advanceTimersByTime(3000); // suspense
        await waitForMessage(ws1, SERVER_MSG.TIERLIST_ROUND_RESULT);
        jest.advanceTimersByTime(1000); // between rounds
        await nextRound;
      }
    }

    // Last round: advance suspense → game end
    const gameEndP1 = waitForMessage(ws1, SERVER_MSG.TIERLIST_GAME_ENDED);
    jest.advanceTimersByTime(3000);
    await gameEndP1;
    await drainMessages(ws1);
    await drainMessages(ws2);
    await drainMessages(ws3);

    expect(lobby.state).toBe('rematch_countdown');

    // Advance 30 seconds for rematch countdown
    const newRouletteP1 = waitForMessage(ws1, SERVER_MSG.TIERLIST_ROULETTE_START, 35000);
    const newRouletteP2 = waitForMessage(ws2, SERVER_MSG.TIERLIST_ROULETTE_START, 35000);
    jest.advanceTimersByTime(30000);

    const [nr1, nr2] = await Promise.all([newRouletteP1, newRouletteP2]);
    expect((nr1.payload as any).themes.length).toBeGreaterThan(0);
    expect((nr2.payload as any).themes.length).toBeGreaterThan(0);

    // Lobby should be in roulette state for the new game
    expect(lobby.state).toBe('roulette');
    // A new session should have been created
    expect(lobby.tierListSession).toBeDefined();
  });
});
