import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { WebSocketService } from '../../services/websocket.service';
import { TierListGameStateService } from '../../services/tierlist-game-state.service';
import { AvatarService } from '../../services/avatar.service';
import { LobbyService } from '../../services/lobby.service';
import { ToastService } from '../../services/toast.service';
import { ButtonComponent } from '../../components/button/button.component';
import { SpectatorOverlayComponent } from '../../components/spectator-overlay/spectator-overlay.component';
import { SoundToggleComponent } from '../../components/sound-toggle/sound-toggle.component';
import { TierlistLobbyComponent } from './phases/tierlist-lobby/tierlist-lobby.component';
import { TierlistRouletteComponent } from './phases/tierlist-roulette/tierlist-roulette.component';
import { TierlistGameplayComponent } from './phases/tierlist-gameplay/tierlist-gameplay.component';
import { TierlistSuspenseComponent } from './phases/tierlist-suspense/tierlist-suspense.component';
import { TierlistRoundResultComponent } from './phases/tierlist-round-result/tierlist-round-result.component';
import { TierlistEndGameComponent } from './phases/tierlist-end-game/tierlist-end-game.component';
import { CLIENT_MSG, SERVER_MSG } from '@shared/ws-messages';
import type { LobbyUpdatePayload, AvatarAssignedPayload, ErrorPayload, JoinedAsSpectatorPayload } from '@shared/ws-messages';

@Component({
  selector: 'app-tierlist-game',
  standalone: true,
  imports: [
    FormsModule,
    TranslateModule,
    ButtonComponent,
    SpectatorOverlayComponent,
    TierlistLobbyComponent,
    TierlistRouletteComponent,
    TierlistGameplayComponent,
    TierlistSuspenseComponent,
    TierlistRoundResultComponent,
    TierlistEndGameComponent,
    SoundToggleComponent,
  ],
  templateUrl: './tierlist-game.component.html',
  styleUrl: './tierlist-game.component.scss',
})
export class TierlistGameComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly ws = inject(WebSocketService);
  readonly gameState = inject(TierListGameStateService);
  private readonly avatarService = inject(AvatarService);
  private readonly lobbyService = inject(LobbyService);
  private readonly toastService = inject(ToastService);
  private readonly translateService = inject(TranslateService);

  private subscription = new Subscription();

  readonly lobbyCode = signal<string>('');
  readonly usernameInput = signal('');
  readonly joined = signal(false);
  readonly joining = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly showSpectatorOverlay = signal(false);

  ngOnInit(): void {
    const code = this.route.snapshot.paramMap.get('code');
    if (!code) {
      this.router.navigate(['/']);
      return;
    }
    this.lobbyCode.set(code);

    // Auto-rejoin if we have a cached session for this lobby
    const cached = sessionStorage.getItem(`game:${code}`);
    if (cached) {
      try {
        const { username } = JSON.parse(cached);
        if (username) {
          this.usernameInput.set(username);
          this.autoRejoin(code, username);
          return;
        }
      } catch { /* ignore bad cache */ }
    }

    this.validateLobby(code);
  }

  private async autoRejoin(code: string, username: string): Promise<void> {
    try {
      await this.lobbyService.getLobbyStatus(code);
      this.joinLobby();
    } catch {
      sessionStorage.removeItem(`game:${code}`);
      this.toastService.error(this.translateService.instant('errors.lobbyNotFound'));
      this.router.navigate(['/']);
    }
  }

  private async validateLobby(code: string): Promise<void> {
    try {
      await this.lobbyService.getLobbyStatus(code);
    } catch {
      sessionStorage.removeItem(`game:${code}`);
      this.toastService.error(this.translateService.instant('errors.lobbyNotFound'));
      this.router.navigate(['/']);
    }
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    this.gameState.reset();
    this.avatarService.destroy();
    this.ws.disconnect();
  }

  joinLobby(): void {
    const username = this.usernameInput().trim();
    if (!username) return;

    this.joining.set(true);
    this.errorMessage.set(null);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    this.ws.connect(wsUrl);

    const connSub = this.ws.on<LobbyUpdatePayload>(SERVER_MSG.LOBBY_UPDATE).subscribe((payload) => {
      if (!this.joined()) {
        // Find our player by username to get the playerId
        const me = payload.players.find(
          (p) => p.username.toLowerCase() === username.toLowerCase(),
        );
        if (me && !this.gameState.currentPlayerId()) {
          this.gameState.init(this.lobbyCode(), me.id);
          this.gameState.setCurrentPlayer(me.id);
          // Apply this first lobby update directly since the state service
          // subscription was set up after this message was already emitted
          this.gameState.applyLobbyUpdate(payload);
        }
        this.joined.set(true);
        this.joining.set(false);
        // Cache session for reconnection
        sessionStorage.setItem(`game:${this.lobbyCode()}`, JSON.stringify({ username }));
      }
    });
    this.subscription.add(connSub);

    const avatarSub = this.ws.on<AvatarAssignedPayload>(SERVER_MSG.AVATAR_ASSIGNED).subscribe((payload) => {
      if (!this.gameState.currentPlayerId()) {
        this.gameState.init(this.lobbyCode(), payload.playerId);
        this.gameState.setCurrentPlayer(payload.playerId);
      }
    });
    this.subscription.add(avatarSub);

    const errorSub = this.ws.on<ErrorPayload>(SERVER_MSG.ERROR).subscribe((payload) => {
      this.errorMessage.set(payload.message);
      this.joining.set(false);
      this.toastService.error(payload.message);
    });
    this.subscription.add(errorSub);

    const spectatorSub = this.ws.on<JoinedAsSpectatorPayload>(SERVER_MSG.JOINED_AS_SPECTATOR).subscribe(() => {
      this.showSpectatorOverlay.set(true);
    });
    this.subscription.add(spectatorSub);

    this.avatarService.init();

    const checkConnection = setInterval(() => {
      if (this.ws.isConnected()) {
        clearInterval(checkConnection);
        this.ws.send({
          type: CLIENT_MSG.JOIN_LOBBY,
          payload: { lobbyCode: this.lobbyCode(), username },
        });
      }
    }, 100);

    setTimeout(() => {
      clearInterval(checkConnection);
      if (!this.joined()) {
        this.joining.set(false);
        this.errorMessage.set(this.translateService.instant('join.timeout'));
      }
    }, 10000);
  }

  dismissSpectatorOverlay(): void {
    this.showSpectatorOverlay.set(false);
  }
}
