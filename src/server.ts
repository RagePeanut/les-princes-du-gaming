// Main server entry point
// Wires Express app + WebSocket server on the same HTTP server

import http from 'http';
import express from 'express';
import { LobbyManager } from './lobby/lobby-manager';
import { GameEngine, GameEngineCallbacks } from './game/game-engine';
import { ItemStore } from './items/item-store';
import { GameWebSocketServer } from './ws/ws-server';
import { createRouter } from './api/routes';
import { SERVER_MSG } from '../../shared/ws-messages';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// ─── Initialize core services ────────────────────────────────────────

const lobbyManager = new LobbyManager();
const itemStore = new ItemStore();

// GameEngine callbacks will be wired to the WebSocket server after creation
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

// ─── Express app ──────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use(createRouter(lobbyManager));

// ─── HTTP + WebSocket server ──────────────────────────────────────────

const server = http.createServer(app);
wsServer = new GameWebSocketServer(server, lobbyManager, gameEngine);

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

export { app, server };
