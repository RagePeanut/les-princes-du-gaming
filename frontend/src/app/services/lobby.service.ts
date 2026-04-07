import { Injectable } from '@angular/core';
import type { GameConfig } from '@shared/types';

export interface CreateLobbyResponse {
  lobbyCode: string;
  joinUrl: string;
}

export interface LobbyStatusResponse {
  exists: boolean;
  state: string;
  playerCount: number;
  config: GameConfig;
}

export interface ThemeInfo {
  name: string;
  itemCount: number;
}

@Injectable({ providedIn: 'root' })
export class LobbyService {
  private readonly baseUrl = '/api/lobbies';

  async createLobby(config: Partial<GameConfig>, gameType: 'ranking' | 'tierlist' = 'ranking'): Promise<CreateLobbyResponse> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...config, gameType }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error ?? 'Failed to create lobby');
    }

    return response.json() as Promise<CreateLobbyResponse>;
  }

  async getThemes(): Promise<ThemeInfo[]> {
    const response = await fetch('/api/themes');

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error ?? 'Failed to get themes');
    }

    return response.json() as Promise<ThemeInfo[]>;
  }

  async getLobbyStatus(code: string): Promise<LobbyStatusResponse> {
    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(code)}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error ?? 'Failed to get lobby status');
    }

    return response.json() as Promise<LobbyStatusResponse>;
  }
}
