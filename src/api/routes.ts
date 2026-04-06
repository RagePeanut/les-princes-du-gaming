// REST API routes for the Multiplayer Game Hub
// POST /api/lobbies — create lobby
// GET /api/lobbies/:code — lobby status
// GET /api/games — game metadata list

import { Router, Request, Response } from 'express';
import { LobbyManager, validateGameConfig, buildFullConfig } from '../lobby/lobby-manager';
import { GameCard } from '../../../shared/types';

const INTERNAL_GAMES: GameCard[] = [
  {
    id: 'ranking-game',
    title: 'Ranking Game',
    description: 'Rank items and compete for consensus',
    imageUrl: '/images/ranking-game.png',
    isExternal: false,
    routePath: '/game/ranking',
  },
];

const EXTERNAL_GAMES: GameCard[] = [
  {
    id: 'gartic-phone',
    title: 'Gartic Phone',
    description: 'The telephone game meets drawing',
    imageUrl: '/images/gartic-phone.png',
    isExternal: true,
    externalUrl: 'https://garticphone.com',
  },
  {
    id: 'jklm-bomb-party',
    title: 'JKLM.fun Bomb Party',
    description: 'Type words before the bomb explodes',
    imageUrl: '/images/jklm-bomb-party.png',
    isExternal: true,
    externalUrl: 'https://jklm.fun',
  },
  {
    id: 'dialed-gg',
    title: 'Dialed.gg',
    description: 'Party games with friends',
    imageUrl: '/images/dialed-gg.png',
    isExternal: true,
    externalUrl: 'https://dialed.gg',
  },
  {
    id: 'jklm-popsauce',
    title: 'JKLM.fun Popsauce',
    description: 'Guess the image before anyone else',
    imageUrl: '/images/jklm-popsauce.png',
    isExternal: true,
    externalUrl: 'https://jklm.fun',
  },
];

export function createRouter(lobbyManager: LobbyManager): Router {
  const router = Router();

  // POST /api/lobbies — create a new lobby
  router.post('/api/lobbies', (req: Request, res: Response) => {
    try {
      const config = req.body || {};
      const validation = validateGameConfig(config);
      if (!validation.valid) {
        res.status(400).json({ error: validation.errors.join('; ') });
        return;
      }

      const lobby = lobbyManager.createLobby(config);
      res.status(201).json({
        lobbyCode: lobby.code,
        joinUrl: `/game/ranking/${lobby.code}`,
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
