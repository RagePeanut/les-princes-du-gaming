// REST API routes for the Multiplayer Game Hub
// POST /api/lobbies — create lobby
// GET /api/lobbies/:code — lobby status
// GET /api/games — game metadata list

import { Router, Request, Response } from 'express';
import { LobbyManager, validateGameConfig } from '../lobby/lobby-manager';
import { GameCard } from '../../../shared/types';
import { ItemStore } from '../items/item-store';

const INTERNAL_GAMES: GameCard[] = [
//   {
//     id: 'ranking-game',
//     title: 'Ranking Game',
//     imageUrl: '/images/ranking-game.png',
//     isExternal: false,
//     routePath: '/game/ranking',
//   },
  {
    id: 'tierlist',
    title: 'Tier List Game',
    imageUrl: 'https://tiermaker.com/images/templates/tier-list-tier-list-1289304/12893041638200313.png',
    isExternal: false,
    routePath: '/game/tierlist',
  },
];

const EXTERNAL_GAMES: GameCard[] = [
  {
    id: 'gartic-phone',
    title: 'Gartic Phone',
    imageUrl: 'https://garticphone.com/images/thumb.png',
    isExternal: true,
    externalUrl: 'https://garticphone.com',
  },
  {
    id: 'bombparty',
    title: 'BombParty',
    imageUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co4b6t.jpg',
    isExternal: true,
    externalUrl: 'https://jklm.fun',
  },
  {
    id: 'dialed-gg',
    title: 'Dialed.gg',
    imageUrl: 'https://dialed.gg/og-default.png',
    isExternal: true,
    externalUrl: 'https://dialed.gg',
  },
  {
    id: 'popsauce',
    title: 'PopSauce',
    imageUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co4b6s.jpg',
    isExternal: true,
    externalUrl: 'https://jklm.fun',
  },
  {
    id: 'skribbl',
    title: 'skribbl.io',
    imageUrl: 'https://skribbl.io/img/thumbnail.png',
    isExternal: true,
    externalUrl: 'https://skribbl.io',
  },
  {
    id: 'dialed-sound',
    title: 'Dialed.gg Sound',
    imageUrl: 'https://dialed.gg/og-default.png',
    isExternal: true,
    externalUrl: 'https://dialed.gg/sound',
  },
];

export function createRouter(lobbyManager: LobbyManager, itemStore?: ItemStore): Router {
  const router = Router();

  // POST /api/lobbies — create a new lobby
  router.post('/api/lobbies', (req: Request, res: Response) => {
    try {
      const config = req.body || {};
      const gameType: 'ranking' | 'tierlist' = req.body.gameType === 'tierlist' ? 'tierlist' : 'ranking';
      const validation = validateGameConfig(config);
      if (!validation.valid) {
        res.status(400).json({ error: validation.errors.join('; ') });
        return;
      }

      const lobby = lobbyManager.createLobby(config, gameType);
      const joinUrl = gameType === 'tierlist'
        ? `/game/tierlist/${lobby.code}`
        : `/game/ranking/${lobby.code}`;
      res.status(201).json({
        lobbyCode: lobby.code,
        joinUrl,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/lobbies/:code — lobby status
  router.get('/api/lobbies/:code', (req: Request, res: Response) => {
    try {
      const lobby = lobbyManager.getLobby(req.params.code);
      if (!lobby) {
        res.status(404).json({ error: 'Lobby not found' });
        return;
      }

      res.json({
        exists: true,
        state: lobby.state,
        playerCount: lobby.players.size,
        config: lobby.config,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/themes — available themes (categories with ≥5 items)
  router.get('/api/themes', (_req: Request, res: Response) => {
    try {
      if (!itemStore) {
        res.status(500).json({ error: 'ItemStore not available' });
        return;
      }
      const categories = itemStore.getCategories();
      const themes = categories.filter(
        (cat) => itemStore.getItemsByCategory(cat).length >= 5,
      );
      res.json({ themes });
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/games — game metadata
  router.get('/api/games', (_req: Request, res: Response) => {
    try {
      res.json([...INTERNAL_GAMES, ...EXTERNAL_GAMES]);
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
