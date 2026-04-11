import { Component, inject, signal, computed } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { CardComponent } from '../../../../components/card/card.component';
import { ButtonComponent } from '../../../../components/button/button.component';
import { PlayerAvatarComponent } from '../../../../components/player-avatar/player-avatar.component';
import { GameStateService } from '../../../../services/game-state.service';
import { WebSocketService } from '../../../../services/websocket.service';
import { AvatarService } from '../../../../services/avatar.service';
import { SoundService } from '../../../../services/sound.service';
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
  private readonly sound = inject(SoundService);

  readonly linkCopied = signal(false);

  /** Last slider value to restore when re-enabling timer */
  private readonly lastTimerValue = signal(30);

  /** Last slider value to restore when re-enabling auto-advance */
  private readonly lastAutoAdvanceValue = signal(5);

  readonly isTimerEnabled = computed(() => {
    const val = this.gameState.config()?.timerSeconds ?? 30;
    return val >= 0;
  });

  readonly timerValue = computed(() => {
    const val = this.gameState.config()?.timerSeconds ?? 30;
    return val >= 0 ? val : this.lastTimerValue();
  });

  readonly isAutoAdvanceEnabled = computed(() => {
    const val = this.gameState.config()?.timeBetweenRounds ?? -1;
    return val >= 0;
  });

  readonly autoAdvanceValue = computed(() => {
    const val = this.gameState.config()?.timeBetweenRounds ?? -1;
    return val >= 0 ? val : this.lastAutoAdvanceValue();
  });

  readonly shareableLink = computed(() => {
    const code = this.gameState.lobbyCode();
    if (!code) return '';
    return `${window.location.origin}/game/ranking/${code}`;
  });

  startGame(): void {
    this.sound.play('gameStart');
    this.ws.send({
      type: CLIENT_MSG.START_GAME,
      payload: { lobbyCode: this.gameState.lobbyCode() ?? '' },
    });
  }

  updateRounds(event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    this.sound.play('settingChange');
    this.ws.send({
      type: CLIENT_MSG.UPDATE_CONFIG,
      payload: { lobbyCode: this.gameState.lobbyCode() ?? '', config: { rounds: value } },
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

  toggleTimer(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const value = checked ? this.lastTimerValue() : -1;
    this.sound.play(checked ? 'toggleOn' : 'toggleOff');
    this.ws.send({
      type: CLIENT_MSG.UPDATE_CONFIG,
      payload: { lobbyCode: this.gameState.lobbyCode() ?? '', config: { timerSeconds: value } },
    });
  }

  updateTimeBetweenRounds(event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    this.lastAutoAdvanceValue.set(value);
    this.sound.play('settingChange');
    this.ws.send({
      type: CLIENT_MSG.UPDATE_CONFIG,
      payload: { lobbyCode: this.gameState.lobbyCode() ?? '', config: { timeBetweenRounds: value } },
    });
  }

  toggleAutoAdvance(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const value = checked ? this.lastAutoAdvanceValue() : -1;
    this.sound.play(checked ? 'toggleOn' : 'toggleOff');
    this.ws.send({
      type: CLIENT_MSG.UPDATE_CONFIG,
      payload: { lobbyCode: this.gameState.lobbyCode() ?? '', config: { timeBetweenRounds: value } },
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
    } catch {
      // Fallback: select text
    }
  }

  getAvatar(playerId: string) {
    return this.avatarService.getAvatar(playerId);
  }

  rerollAvatar(): void {
    this.sound.play('settingChange');
    this.ws.send({
      type: CLIENT_MSG.REROLL_AVATAR,
      payload: { lobbyCode: this.gameState.lobbyCode() ?? '' },
    });
  }
}
