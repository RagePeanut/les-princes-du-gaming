import express from 'express';
import request from 'supertest';
import { createRouter } from './routes';
import { LobbyManager } from '../lobby/lobby-manager';

function buildApp(lobbyManager: LobbyManager) {
  const app = express();
  app.use(express.json());
  app.use(createRouter(lobbyManager));
  return app;
}

describe('REST API routes', () => {
  let lobbyManager: LobbyManager;

  beforeEach(() => {
    lobbyManager = new LobbyManager();
  });

  // ─── POST /api/lobbies ──────────────────────────────────────────────

  describe('POST /api/lobbies', () => {
    it('creates a lobby with default config', async () => {
      const app = buildApp(lobbyManager);
      const res = await request(app).post('/api/lobbies').send({});
      expect(res.status).toBe(201);
      expect(res.body.lobbyCode).toBeDefined();
      expect(res.body.lobbyCode).toHaveLength(6);
      expect(res.body.joinUrl).toBe(`/game/ranking/${res.body.lobbyCode}`);
    });

    it('creates a lobby with custom config', async () => {
      const app = buildApp(lobbyManager);
      const res = await request(app)
        .post('/api/lobbies')
        .send({ rounds: 10, timerSeconds: 30, mode: 'category' });
      expect(res.status).toBe(201);
      expect(res.body.lobbyCode).toBeDefined();
    });

    it('returns 400 for invalid rounds', async () => {
      const app = buildApp(lobbyManager);
      const res = await request(app)
        .post('/api/lobbies')
        .send({ rounds: 25 });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('rounds');
    });

    it('returns 400 for invalid timerSeconds', async () => {
      const app = buildApp(lobbyManager);
      const res = await request(app)
        .post('/api/lobbies')
        .send({ timerSeconds: 200 });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('timerSeconds');
    });

    it('returns 400 for invalid mode', async () => {
      const app = buildApp(lobbyManager);
      const res = await request(app)
        .post('/api/lobbies')
        .send({ mode: 'invalid' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('mode');
    });
  });

  // ─── GET /api/lobbies/:code ─────────────────────────────────────────

  describe('GET /api/lobbies/:code', () => {
    it('returns lobby status for existing lobby', async () => {
      const app = buildApp(lobbyManager);
      const lobby = lobbyManager.createLobby({});
      const res = await request(app).get(`/api/lobbies/${lobby.code}`);
      expect(res.status).toBe(200);
      expect(res.body.exists).toBe(true);
      expect(res.body.state).toBe('waiting');
      expect(res.body.playerCount).toBe(0);
      expect(res.body.config).toEqual({
        rounds: 5,
        timerSeconds: 15,
        timeBetweenRounds: 0,
        mode: 'random',
      });
    });

    it('returns 404 for non-existent lobby', async () => {
      const app = buildApp(lobbyManager);
      const res = await request(app).get('/api/lobbies/ZZZZZZ');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Lobby not found');
    });
  });

  // ─── GET /api/games ─────────────────────────────────────────────────

  describe('GET /api/games', () => {
    it('returns internal and external games', async () => {
      const app = buildApp(lobbyManager);
      const res = await request(app).get('/api/games');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(5);

      const internal = res.body.filter((g: any) => !g.isExternal);
      const external = res.body.filter((g: any) => g.isExternal);
      expect(internal.length).toBeGreaterThanOrEqual(1);
      expect(external.length).toBeGreaterThanOrEqual(4);

      // Verify ranking game
      const ranking = res.body.find((g: any) => g.id === 'ranking-game');
      expect(ranking).toBeDefined();
      expect(ranking.isExternal).toBe(false);
      expect(ranking.routePath).toBe('/game/ranking');

      // Verify external games have URLs
      for (const game of external) {
        expect(game.externalUrl).toBeDefined();
        expect(game.externalUrl).toMatch(/^https:\/\//);
      }
    });
  });
});
