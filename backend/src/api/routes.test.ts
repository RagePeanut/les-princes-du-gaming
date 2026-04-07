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
        timerSeconds: 30,
        timeBetweenRounds: -1,
        mode: 'category',
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

// ─── Tier List REST API Extensions ──────────────────────────────────────────

import { ItemStore } from '../items/item-store';
import { Item } from '../../../shared/types';

function buildAppWithItemStore(lobbyManager: LobbyManager, itemStore: ItemStore) {
  const app = express();
  app.use(express.json());
  app.use(createRouter(lobbyManager, itemStore));
  return app;
}

describe('Tier List REST API extensions', () => {
  let lobbyManager: LobbyManager;

  beforeEach(() => {
    lobbyManager = new LobbyManager();
  });

  // ─── POST /api/lobbies with gameType ────────────────────────────────

  describe('POST /api/lobbies with gameType', () => {
    it('creates a tierlist lobby and returns joinUrl containing /game/tierlist/', async () => {
      const app = buildApp(lobbyManager);
      const res = await request(app)
        .post('/api/lobbies')
        .send({ gameType: 'tierlist' });
      expect(res.status).toBe(201);
      expect(res.body.lobbyCode).toBeDefined();
      expect(res.body.joinUrl).toContain('/game/tierlist/');
    });

    it('defaults to ranking gameType when gameType is not provided', async () => {
      const app = buildApp(lobbyManager);
      const res = await request(app)
        .post('/api/lobbies')
        .send({});
      expect(res.status).toBe(201);
      expect(res.body.joinUrl).toContain('/game/ranking/');
    });
  });

  // ─── GET /api/themes ────────────────────────────────────────────────

  describe('GET /api/themes', () => {
    it('returns categories with at least 5 items', async () => {
      const items: Item[] = [];
      // "big" category has 6 items (≥5 → should be included)
      for (let i = 0; i < 6; i++) {
        items.push({ id: `big-${i}`, displayName: `Big ${i}`, imageUrl: '', category: 'big' });
      }
      // "small" category has 3 items (<5 → should be excluded)
      for (let i = 0; i < 3; i++) {
        items.push({ id: `small-${i}`, displayName: `Small ${i}`, imageUrl: '', category: 'small' });
      }
      const itemStore = new ItemStore(items);
      const app = buildAppWithItemStore(lobbyManager, itemStore);

      const res = await request(app).get('/api/themes');
      expect(res.status).toBe(200);
      expect(res.body.themes).toContain('big');
      expect(res.body.themes).not.toContain('small');
    });

    it('does not return categories with fewer than 5 items', async () => {
      const items: Item[] = [];
      // Only categories with <5 items
      for (let i = 0; i < 4; i++) {
        items.push({ id: `a-${i}`, displayName: `A ${i}`, imageUrl: '', category: 'catA' });
      }
      for (let i = 0; i < 2; i++) {
        items.push({ id: `b-${i}`, displayName: `B ${i}`, imageUrl: '', category: 'catB' });
      }
      const itemStore = new ItemStore(items);
      const app = buildAppWithItemStore(lobbyManager, itemStore);

      const res = await request(app).get('/api/themes');
      expect(res.status).toBe(200);
      expect(res.body.themes).toEqual([]);
    });
  });
});
