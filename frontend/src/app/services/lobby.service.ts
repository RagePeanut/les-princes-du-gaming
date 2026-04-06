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

@Injectable({ providedIn: 'root' })
export class LobbyService {
  private readonly baseUrl = '/api/lobbies';

  async createLobby(config: Partial<GameConfig>): Promise<CreateLobbyResponse> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error ?? 'Failed to create lobby');
    }

    return response.json() as Promise<CreateLobbyResponse>;
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
