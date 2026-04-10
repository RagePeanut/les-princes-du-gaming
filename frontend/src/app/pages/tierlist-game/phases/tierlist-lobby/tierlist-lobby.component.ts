import { Component, inject, signal, computed } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { CardComponent } from '../../../../components/card/card.component';
import { ButtonComponent } from '../../../../components/button/button.component';
import { PlayerAvatarComponent } from '../../../../components/player-avatar/player-avatar.component';
import { TierListGameStateService } from '../../../../services/tierlist-game-state.service';
import { WebSocketService } from '../../../../services/websocket.service';
import { AvatarService } from '../../../../services/avatar.service';
import { SoundService } from '../../../../services/sound.service';
import { CLIENT_MSG } from '@shared/ws-messages';

@Component({
  selector: 'app-tierlist-lobby',
  standalone: true,
  imports: [TranslateModule, CardComponent, ButtonComponent, PlayerAvatarComponent],
  templateUrl: './tierlist-lobby.component.html',
  styleUrl: './tierlist-lobby.component.scss',
})
export class TierlistLobbyComponent {
  readonly gameState = inject(TierListGameStateService);
  private readonly ws = inject(WebSocketService);
  private readonly avatarService = inject(AvatarService);
  private readonly sound = inject(SoundService);

  readonly linkCopied = signal(false);
  private readonly lastTimerValue = signal(15);

  readonly timerValue = computed(() => {
    const val = this.gameState.config()?.timerSeconds ?? 15;
    return val >= 0 ? val : this.lastTimerValue();
  });

  readonly shareableLink = computed(() => {
    const code = this.gameState.lobbyCode();
    if (!code) return '';
    return `${window.location.origin}/game/tierlist/${code}`;
  });

  startGame(): void {
    this.sound.play('gameStart');
    this.ws.send({
      type: CLIENT_MSG.START_GAME,
      payload: { lobbyCode: this.gameState.lobbyCode() ?? '' },
    });
  }

  updateTimer(event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    this.lastTimerValue.set(value);
    this.sound.play('settingChange');
    this.ws.send({
      type: CLIENT_MSG.UPDATE_CONFIG,
      payload: { lobbyCode: this.gameState.lobbyCode() ?? '', config: { timerSeconds: value } },
    });
  }

  updateMode(mode: 'category' | 'random'): void {
    this.sound.play('settingChange');
    this.ws.send({
      type: CLIENT_MSG.UPDATE_CONFIG,
      payload: { lobbyCode: this.gameState.lobbyCode() ?? '', config: { mode } },
    });
  }

  async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.shareableLink());
      this.linkCopied.set(true);
      this.sound.play('copyLink');
      setTimeout(() => this.linkCopied.set(false), 2000);
    } catch { /* fallback */ }
  }

  getAvatar(playerId: string): { headUrl: string; accessoryUrl: string | null } | undefined {
    return this.avatarService.getAvatar(playerId);
  }
}
