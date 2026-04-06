import { Component, inject, signal, computed } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { CardComponent } from '../../../../components/card/card.component';
import { ButtonComponent } from '../../../../components/button/button.component';
import { PlayerAvatarComponent } from '../../../../components/player-avatar/player-avatar.component';
import { GameStateService } from '../../../../services/game-state.service';
import { WebSocketService } from '../../../../services/websocket.service';
import { AvatarService } from '../../../../services/avatar.service';
import { CLIENT_MSG } from '@shared/ws-messages';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [TranslateModule, CardComponent, ButtonComponent, PlayerAvatarComponent],
  templateUrl: './lobby.component.html',
  styleUrl: './lobby.component.scss',
})
export class LobbyComponent {
  readonly gameState = inject(GameStateService);
  private readonly ws = inject(WebSocketService);
  private readonly avatarService = inject(AvatarService);
  private readonly translateService = inject(TranslateService);

  readonly linkCopied = signal(false);

  readonly shareableLink = computed(() => {
    const code = this.gameState.lobbyCode();
    if (!code) return '';
    return `${window.location.origin}/game/ranking/${code}`;
  });

  startGame(): void {
    this.ws.send({
      type: CLIENT_MSG.START_GAME,
      payload: { lobbyCode: this.gameState.lobbyCode() ?? '' },
    });
  }

  updateRounds(event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    this.ws.send({
      type: CLIENT_MSG.UPDATE_CONFIG,
      payload: { lobbyCode: this.gameState.lobbyCode() ?? '', config: { rounds: value } },
    });
  }

  updateTimer(event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    this.ws.send({
      type: CLIENT_MSG.UPDATE_CONFIG,
      payload: { lobbyCode: this.gameState.lobbyCode() ?? '', config: { timerSeconds: value } },
    });
  }

  updateTimeBetweenRounds(event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    this.ws.send({
      type: CLIENT_MSG.UPDATE_CONFIG,
      payload: { lobbyCode: this.gameState.lobbyCode() ?? '', config: { timeBetweenRounds: value } },
    });
  }

  updateMode(mode: 'category' | 'random'): void {
    this.ws.send({
      type: CLIENT_MSG.UPDATE_CONFIG,
      payload: { lobbyCode: this.gameState.lobbyCode() ?? '', config: { mode } },
    });
  }

  async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.shareableLink());
      this.linkCopied.set(true);
      setTimeout(() => this.linkCopied.set(false), 2000);
    } catch {
      // Fallback: select text
    }
  }

  getAvatar(playerId: string): string | undefined {
    return this.avatarService.getAvatar(playerId);
  }
}
