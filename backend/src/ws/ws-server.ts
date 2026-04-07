// WebSocket server — handles real-time game communication
// Routes client messages, broadcasts server events, manages reconnection

import { Server as HttpServer } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { LobbyManager } from '../lobby/lobby-manager';
import { GameEngine } from '../game/game-engine';
import { TierListGameEngine, TierListGameEngineCallbacks } from '../tierlist/tierlist-game-engine';
import { buildTierListLeaderboard } from '../tierlist/tierlist-scoring-engine';
import { ItemStore } from '../items/item-store';
import { Lobby, Player } from '../../../shared/types';
import {
  CLIENT_MSG,
  SERVER_MSG,
  ClientMessage,
  ServerMessage,
  LobbyUpdatePayload,
  JoinedAsSpectatorPayload,
} from '../../../shared/ws-messages';
import { buildLeaderboard } from '../scoring/scoring-engine';

const RECONNECT_GRACE_MS = 15_000;

interface SocketMeta {
  playerId: string;
  lobbyCode: string;
}

interface DisconnectTimer {
  timeout: ReturnType<typeof setTimeout>;
  playerId: string;
  lobbyCode: string;
}

export class GameWebSocketServer {
  private wss: WebSocketServer;
  private lobbyManager: LobbyManager;
  private gameEngine: GameEngine;
  private tierListEngine: TierListGameEngine;

  // socket → metadata
  private socketMeta = new Map<WebSocket, SocketMeta>();
  // playerId → socket (for sending messages to specific players)
  private playerSockets = new Map<string, WebSocket>();
  // playerId → disconnect timer
  private disconnectTimers = new Map<string, DisconnectTimer>();

  constructor(server: HttpServer, lobbyManager: LobbyManager, gameEngine: GameEngine, itemStore: ItemStore) {
    this.lobbyManager = lobbyManager;
    this.gameEngine = gameEngine;

    // Build tier list engine callbacks that broadcast via this server
    const tierListCallbacks: TierListGameEngineCallbacks = {
      onRouletteStart: (lobbyCode, themes) => {
        this.broadcastToLobby(lobbyCode, {
          type: SERVER_MSG.TIERLIST_ROULETTE_START,
          payload: { themes },
        });
      },
      onRouletteResult: (lobbyCode, theme, items) => {
        this.broadcastToLobby(lobbyCode, {
          type: SERVER_MSG.TIERLIST_ROULETTE_RESULT,
          payload: { theme, items },
        });
      },
      onTierListRoundStart: (lobbyCode, roundIndex, item, totalItems, timerSeconds) => {
        this.broadcastToLobby(lobbyCode, {
          type: SERVER_MSG.TIERLIST_ROUND_START,
          payload: { roundIndex, item, totalItems, timerSeconds },
        });
      },
      onVoteStatus: (lobbyCode, playerId, hasVoted) => {
        this.broadcastToLobby(lobbyCode, {
          type: SERVER_MSG.TIERLIST_VOTE_STATUS,
          payload: { playerId, hasVoted },
        });
      },
      onSuspenseStart: (lobbyCode, roundIndex) => {
        this.broadcastToLobby(lobbyCode, {
          type: SERVER_MSG.TIERLIST_SUSPENSE_START,
          payload: { roundIndex },
        });
      },
      onTierListRoundResult: (lobbyCode, roundIndex, item, finalTier, averageValue, votes, scores, leaderboard) => {
        this.broadcastToLobby(lobbyCode, {
          type: SERVER_MSG.TIERLIST_ROUND_RESULT,
          payload: { roundIndex, item, finalTier, averageValue, votes, scores, leaderboard },
        });
      },
      onTierListGameEnded: (lobbyCode, tierList, leaderboard, winnerId, isTie) => {
        this.broadcastToLobby(lobbyCode, {
          type: SERVER_MSG.TIERLIST_GAME_ENDED,
          payload: { tierList, leaderboard, winnerId, isTie },
        });
      },
      onTimerTick: (lobbyCode, secondsRemaining) => {
        this.broadcastToLobby(lobbyCode, {
          type: SERVER_MSG.TIMER_TICK,
          payload: { secondsRemaining },
        });
      },
      onRematchCountdown: (lobbyCode, secondsRemaining) => {
        this.broadcastToLobby(lobbyCode, {
          type: SERVER_MSG.REMATCH_COUNTDOWN,
          payload: { secondsRemaining },
        });
      },
    };

    this.tierListEngine = new TierListGameEngine(itemStore, tierListCallbacks);
    this.wss = new WebSocketServer({ server });

    this.wss.on('connection', (ws: WebSocket) => {
      ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(ws, data);
      });

      ws.on('close', () => {
        this.handleDisconnect(ws);
      });

      ws.on('error', () => {
        this.handleDisconnect(ws);
      });
    });
  }

  // ─── Message Handling ───────────────────────────────────────────────

  private handleMessage(ws: WebSocket, data: WebSocket.Data): void {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      this.sendTo(ws, { type: SERVER_MSG.ERROR, payload: { message: 'Invalid message format.' } });
      return;
    }

    if (!msg || !msg.type || !msg.payload) {
      this.sendTo(ws, { type: SERVER_MSG.ERROR, payload: { message: 'Invalid message format.' } });
      return;
    }

    switch (msg.type) {
      case CLIENT_MSG.JOIN_LOBBY:
        this.handleJoinLobby(ws, msg.payload);
        break;
      case CLIENT_MSG.START_GAME:
        this.handleStartGame(ws, msg.payload);
        break;
      case CLIENT_MSG.SUBMIT_RANKING:
        this.handleSubmitRanking(ws, msg.payload);
        break;
      case CLIENT_MSG.LEAVE_LOBBY:
        this.handleLeaveLobby(ws, msg.payload);
        break;
      case CLIENT_MSG.UPDATE_CONFIG:
        this.handleUpdateConfig(ws, msg.payload);
        break;
      case CLIENT_MSG.NEXT_ROUND:
        this.handleNextRound(ws, msg.payload);
        break;
      case CLIENT_MSG.SUBMIT_TIER_VOTE:
        this.handleSubmitTierVote(ws, msg.payload);
        break;
      default:
        this.sendTo(ws, { type: SERVER_MSG.ERROR, payload: { message: 'Unknown message type.' } });
    }
  }

  // ─── JOIN_LOBBY ─────────────────────────────────────────────────────

  private handleJoinLobby(ws: WebSocket, payload: { lobbyCode: string; username: string }): void {
    const { lobbyCode, username } = payload;

    if (!lobbyCode || !username) {
      this.sendTo(ws, { type: SERVER_MSG.ERROR, payload: { message: 'lobbyCode and username are required.' } });
      return;
    }

    const lobby = this.lobbyManager.getLobby(lobbyCode);
    if (!lobby) {
      this.sendTo(ws, { type: SERVER_MSG.ERROR, payload: { message: 'Lobby not found.' } });
      return;
    }

    // Check if this is a reconnection (same username in lobby, disconnected)
    const existingPlayer = this.findDisconnectedPlayer(lobby, username);
    if (existingPlayer) {
      this.handleReconnection(ws, lobby, existingPlayer);
      return;
    }

    try {
      const player = this.lobbyManager.joinLobby(lobbyCode, username);
      this.registerSocket(ws, player.id, lobbyCode);

      // Broadcast avatar assignment to ALL players in the lobby
      this.broadcastToLobby(lobbyCode, {
        type: SERVER_MSG.AVATAR_ASSIGNED,
        payload: { playerId: player.id, avatarDataUri: player.avatarDataUri },
      });

      // Send all existing players' avatars to the new joiner
      for (const [, existingPlayer] of lobby.players) {
        if (existingPlayer.id !== player.id && existingPlayer.avatarDataUri) {
          this.sendTo(ws, {
            type: SERVER_MSG.AVATAR_ASSIGNED,
            payload: { playerId: existingPlayer.id, avatarDataUri: existingPlayer.avatarDataUri },
          });
        }
      }

      // If spectator, send spectator info
      if (player.isSpectator) {
        const spectatorPayload = this.buildSpectatorPayload(lobby);
        this.sendTo(ws, { type: SERVER_MSG.JOINED_AS_SPECTATOR, payload: spectatorPayload });
      }

      // Broadcast lobby update to all players in the lobby
      this.broadcastLobbyUpdate(lobby);
    } catch (err: any) {
      this.sendTo(ws, { type: SERVER_MSG.ERROR, payload: { message: err.message } });
    }
  }

  // ─── START_GAME ─────────────────────────────────────────────────────

  private handleStartGame(ws: WebSocket, payload: { lobbyCode: string }): void {
    const meta = this.socketMeta.get(ws);
    if (!meta) {
      this.sendTo(ws, { type: SERVER_MSG.ERROR, payload: { message: 'Not connected to a lobby.' } });
      return;
    }

    const lobby = this.lobbyManager.getLobby(payload.lobbyCode);
    if (!lobby) {
      this.sendTo(ws, { type: SERVER_MSG.ERROR, payload: { message: 'Lobby not found.' } });
      return;
    }

    if (meta.lobbyCode !== payload.lobbyCode) {
      this.sendTo(ws, { type: SERVER_MSG.ERROR, payload: { message: 'Not a member of this lobby.' } });
      return;
    }

    if (lobby.hostId !== meta.playerId) {
      this.sendTo(ws, { type: SERVER_MSG.ERROR, payload: { message: 'Only the host can start the game.' } });
      return;
    }

    // Need at least 2 players
    const activePlayers = Array.from(lobby.players.values()).filter(p => !p.isSpectator);
    if (activePlayers.length < 2) {
      this.sendTo(ws, { type: SERVER_MSG.ERROR, payload: { message: 'Need at least 2 players to start.' } });
      return;
    }

    try {
      if (lobby.gameType === 'tierlist') {
        this.tierListEngine.startGame(lobby);
      } else {
        this.gameEngine.startGame(lobby);
      }
    } catch (err: any) {
      this.sendTo(ws, { type: SERVER_MSG.ERROR, payload: { message: err.message } });
    }
  }

  // ─── SUBMIT_RANKING ─────────────────────────────────────────────────

  private handleSubmitRanking(ws: WebSocket, payload: { lobbyCode: string; roundIndex: number; ranking: string[] }): void {
    const meta = this.socketMeta.get(ws);
    if (!meta) {
      this.sendTo(ws, { type: SERVER_MSG.ERROR, payload: { message: 'Not connected to a lobby.' } });
      return;
    }

    const lobby = this.lobbyManager.getLobby(payload.lobbyCode);
    if (!lobby) {
      this.sendTo(ws, { type: SERVER_MSG.ERROR, payload: { message: 'Lobby not found.' } });
      return;
    }

    if (meta.lobbyCode !== payload.lobbyCode) {
      this.sendTo(ws, { type: SERVER_MSG.ERROR, payload: { message: 'Not a member of this lobby.' } });
      return;
    }

    const result = this.gameEngine.submitRanking(lobby, meta.playerId, payload.ranking);
    if (result.error) {
      this.sendTo(ws, { type: SERVER_MSG.ERROR, payload: { message: result.error } });
    }
  }

  // ─── SUBMIT_TIER_VOTE ───────────────────────────────────────────────

  private handleSubmitTierVote(ws: WebSocket, payload: { lobbyCode: string; roundIndex: number; tier: string; confirmed?: boolean }): void {
    const meta = this.socketMeta.get(ws);
    if (!meta) {
      this.sendTo(ws, { type: SERVER_MSG.ERROR, payload: { message: 'Not connected to a lobby.' } });
      return;
    }

    const lobby = this.lobbyManager.getLobby(payload.lobbyCode);
    if (!lobby) {
      this.sendTo(ws, { type: SERVER_MSG.ERROR, payload: { message: 'Lobby not found.' } });
      return;
    }

    if (meta.lobbyCode !== payload.lobbyCode) {
      this.sendTo(ws, { type: SERVER_MSG.ERROR, payload: { message: 'Not a member of this lobby.' } });
      return;
    }

    const result = this.tierListEngine.submitVote(lobby, meta.playerId, payload.tier, !!payload.confirmed);
    if (result.error) {
      this.sendTo(ws, { type: SERVER_MSG.ERROR, payload: { message: result.error } });
    }
  }

  // ─── LEAVE_LOBBY ────────────────────────────────────────────────────

  private handleLeaveLobby(ws: WebSocket, payload: { lobbyCode: string }): void {
    const meta = this.socketMeta.get(ws);
    if (!meta) {
      this.sendTo(ws, { type: SERVER_MSG.ERROR, payload: { message: 'Not connected to a lobby.' } });
      return;
    }

    if (meta.lobbyCode !== payload.lobbyCode) {
      this.sendTo(ws, { type: SERVER_MSG.ERROR, payload: { message: 'Not a member of this lobby.' } });
      return;
    }

    this.removePlayer(meta.lobbyCode, meta.playerId);
    this.unregisterSocket(ws);
  }

  // ─── UPDATE_CONFIG ──────────────────────────────────────────────────

  private handleUpdateConfig(ws: WebSocket, payload: { lobbyCode: string; config: any }): void {
    const meta = this.socketMeta.get(ws);
    if (!meta) {
      this.sendTo(ws, { type: SERVER_MSG.ERROR, payload: { message: 'Not connected to a lobby.' } });
      return;
    }

    const lobby = this.lobbyManager.getLobby(payload.lobbyCode);
    if (!lobby) {
      this.sendTo(ws, { type: SERVER_MSG.ERROR, payload: { message: 'Lobby not found.' } });
      return;
    }

    if (meta.lobbyCode !== payload.lobbyCode) {
      this.sendTo(ws, { type: SERVER_MSG.ERROR, payload: { message: 'Not a member of this lobby.' } });
      return;
    }

    try {
      this.lobbyManager.updateConfig(payload.lobbyCode, meta.playerId, payload.config);
      this.broadcastLobbyUpdate(lobby);
    } catch (err: any) {
      this.sendTo(ws, { type: SERVER_MSG.ERROR, payload: { message: err.message } });
    }
  }

  // ─── NEXT_ROUND ──────────────────────────────────────────────────

  private handleNextRound(ws: WebSocket, payload: { lobbyCode: string }): void {
    const meta = this.socketMeta.get(ws);
    if (!meta) {
      this.sendTo(ws, { type: SERVER_MSG.ERROR, payload: { message: 'Not connected to a lobby.' } });
      return;
    }

    const lobby = this.lobbyManager.getLobby(payload.lobbyCode);
    if (!lobby) {
      this.sendTo(ws, { type: SERVER_MSG.ERROR, payload: { message: 'Lobby not found.' } });
      return;
    }

    if (meta.lobbyCode !== payload.lobbyCode) {
      this.sendTo(ws, { type: SERVER_MSG.ERROR, payload: { message: 'Not a member of this lobby.' } });
      return;
    }

    if (lobby.hostId !== meta.playerId) {
      this.sendTo(ws, { type: SERVER_MSG.ERROR, payload: { message: 'Only the host can advance to the next round.' } });
      return;
    }

    if (lobby.gameType === 'tierlist') {
      this.tierListEngine.nextRound(lobby);
    } else {
      this.gameEngine.nextRound(lobby);
    }
  }

  // ─── Disconnect / Reconnect ─────────────────────────────────────────

  private handleDisconnect(ws: WebSocket): void {
    const meta = this.socketMeta.get(ws);
    if (!meta) return;

    const { playerId, lobbyCode } = meta;
    const lobby = this.lobbyManager.getLobby(lobbyCode);

    this.playerSockets.delete(playerId);
    this.socketMeta.delete(ws);

    if (!lobby) return;

    const player = lobby.players.get(playerId);
    if (!player) return;

    player.isConnected = false;

    // Broadcast disconnection
    this.broadcastToLobby(lobbyCode, {
      type: SERVER_MSG.PLAYER_DISCONNECTED,
      payload: { playerId, username: player.username },
    });

    // Start 15-second grace period
    const timeout = setTimeout(() => {
      this.disconnectTimers.delete(playerId);
      this.removePlayer(lobbyCode, playerId);
    }, RECONNECT_GRACE_MS);

    this.disconnectTimers.set(playerId, { timeout, playerId, lobbyCode });
  }

  private handleReconnection(ws: WebSocket, lobby: Lobby, player: Player): void {
    // Cancel disconnect timer
    const timer = this.disconnectTimers.get(player.id);
    if (timer) {
      clearTimeout(timer.timeout);
      this.disconnectTimers.delete(player.id);
    }

    player.isConnected = true;
    this.registerSocket(ws, player.id, lobby.code);

    // Broadcast reconnection
    this.broadcastToLobby(lobby.code, {
      type: SERVER_MSG.PLAYER_RECONNECTED,
      payload: { playerId: player.id, username: player.username },
    });

    // Send full lobby update to the reconnected player
    this.broadcastLobbyUpdate(lobby);

    // Send all players' avatars to the reconnected player
    for (const [, p] of lobby.players) {
      if (p.avatarDataUri) {
        this.sendTo(ws, {
          type: SERVER_MSG.AVATAR_ASSIGNED,
          payload: { playerId: p.id, avatarDataUri: p.avatarDataUri },
        });
      }
    }
  }

  private findDisconnectedPlayer(lobby: Lobby, username: string): Player | undefined {
    for (const player of lobby.players.values()) {
      if (player.username === username && !player.isConnected) {
        return player;
      }
    }
    return undefined;
  }

  private removePlayer(lobbyCode: string, playerId: string): void {
    const lobby = this.lobbyManager.getLobby(lobbyCode);
    if (!lobby) return;

    const player = lobby.players.get(playerId);
    if (!player) return;

    try {
      const newHost = this.lobbyManager.leaveLobby(lobbyCode, playerId);

      // Clean up player socket mapping
      const ws = this.playerSockets.get(playerId);
      if (ws) {
        this.socketMeta.delete(ws);
        this.playerSockets.delete(playerId);
      }

      // If host changed, broadcast
      if (newHost) {
        this.broadcastToLobby(lobbyCode, {
          type: SERVER_MSG.HOST_CHANGED,
          payload: { newHostId: newHost.id, newHostUsername: newHost.username },
        });
      }

      // Broadcast updated lobby (if lobby still exists)
      const updatedLobby = this.lobbyManager.getLobby(lobbyCode);
      if (updatedLobby) {
        this.broadcastLobbyUpdate(updatedLobby);
      }
    } catch {
      // Lobby may have been destroyed
    }
  }

  // ─── Broadcasting ───────────────────────────────────────────────────

  sendTo(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  sendToPlayer(playerId: string, msg: ServerMessage): void {
    const ws = this.playerSockets.get(playerId);
    if (ws) {
      this.sendTo(ws, msg);
    }
  }

  broadcastToLobby(lobbyCode: string, msg: ServerMessage, excludePlayerId?: string): void {
    const lobby = this.lobbyManager.getLobby(lobbyCode);
    if (!lobby) return;

    for (const player of lobby.players.values()) {
      if (excludePlayerId && player.id === excludePlayerId) continue;
      this.sendToPlayer(player.id, msg);
    }
  }

  private broadcastLobbyUpdate(lobby: Lobby): void {
    const payload: LobbyUpdatePayload = {
      players: Array.from(lobby.players.values()),
      hostId: lobby.hostId,
      config: lobby.config,
    };
    this.broadcastToLobby(lobby.code, { type: SERVER_MSG.LOBBY_UPDATE, payload });
  }

  private buildSpectatorPayload(lobby: Lobby): JoinedAsSpectatorPayload {
    // Handle tier list game type
    if (lobby.gameType === 'tierlist') {
      const session = lobby.tierListSession;
      let leaderboard: any[] = [];
      if (session) {
        const result = buildTierListLeaderboard(session.cumulativeScores, lobby.players);
        leaderboard = result.leaderboard;
      }
      return {
        gameState: lobby.state,
        currentRound: session ? session.currentRound : 0,
        leaderboard,
      };
    }

    // Handle ranking game type (default)
    const session = lobby.gameSession;
    let leaderboard: any[] = [];
    if (session) {
      const result = buildLeaderboard(session.cumulativeScores, lobby.players);
      leaderboard = result.leaderboard;
    }
    return {
      gameState: lobby.state,
      currentRound: session ? session.currentRound : 0,
      leaderboard,
    };
  }

  // ─── Socket Registration ────────────────────────────────────────────

  private registerSocket(ws: WebSocket, playerId: string, lobbyCode: string): void {
    this.socketMeta.set(ws, { playerId, lobbyCode });
    this.playerSockets.set(playerId, ws);
  }

  private unregisterSocket(ws: WebSocket): void {
    const meta = this.socketMeta.get(ws);
    if (meta) {
      this.playerSockets.delete(meta.playerId);
    }
    this.socketMeta.delete(ws);
  }

  // ─── Cleanup ────────────────────────────────────────────────────────

  close(): void {
    for (const timer of this.disconnectTimers.values()) {
      clearTimeout(timer.timeout);
    }
    this.disconnectTimers.clear();
    this.wss.close();
  }
}
