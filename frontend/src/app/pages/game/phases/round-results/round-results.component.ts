import { Component, inject, viewChild } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { CardComponent } from '../../../../components/card/card.component';
import { ButtonComponent } from '../../../../components/button/button.component';
import { PlayerAvatarComponent } from '../../../../components/player-avatar/player-avatar.component';
import { ImageZoomComponent } from '../../../../components/image-zoom/image-zoom.component';
import { GameStateService } from '../../../../services/game-state.service';
import { WebSocketService } from '../../../../services/websocket.service';
import { AvatarService } from '../../../../services/avatar.service';
import { CLIENT_MSG } from '@shared/ws-messages';

@Component({
  selector: 'app-round-results',
  standalone: true,
  imports: [TranslateModule, CardComponent, ButtonComponent, PlayerAvatarComponent, ImageZoomComponent],
  templateUrl: './round-results.component.html',
  styleUrl: './round-results.component.scss',
})
export class RoundResultsComponent {
  readonly gameState = inject(GameStateService);
  private readonly ws = inject(WebSocketService);
  private readonly avatarService = inject(AvatarService);
  private readonly translate = inject(TranslateService);

  readonly imageZoom = viewChild.required(ImageZoomComponent);

  nextRound(): void {
    this.ws.send({
      type: CLIENT_MSG.NEXT_ROUND,
      payload: { lobbyCode: this.gameState.lobbyCode() ?? '' },
    });
  }

  getAvatar(playerId: string) {
    return this.avatarService.getAvatar(playerId);
  }

  openZoom(src: string, itemId: string): void {
    this.imageZoom().open(src, this.translate.instant('items.' + itemId));
  }
}
