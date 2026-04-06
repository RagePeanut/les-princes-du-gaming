import { Component, signal, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import type { GameCard } from '@shared/types';
import { LobbyService } from '../../services/lobby.service';

@Component({
  selector: 'app-hub',
  standalone: true,
  imports: [TranslateModule],
  templateUrl: './hub.component.html',
  styleUrl: './hub.component.scss',
})
export class HubComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly lobbyService = inject(LobbyService);
  private readonly translate = inject(TranslateService);

  protected readonly games = signal<GameCard[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.fetchGames();
  }

  private async fetchGames(): Promise<void> {
    try {
      this.loading.set(true);
      this.error.set(null);
      const response = await fetch('/api/games');
      if (!response.ok) {
        throw new Error('Failed to load games');
      }
      const data = (await response.json()) as GameCard[];
      this.games.set(data);
    } catch (e) {
      this.error.set(this.translate.instant('errors.loadGames'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async onInternalCardClick(game: GameCard): Promise<void> {
    try {
      const result = await this.lobbyService.createLobby({});
      await this.router.navigate(['/game/ranking', result.lobbyCode]);
    } catch {
      this.error.set(this.translate.instant('errors.createLobby'));
    }
  }
}
