import { Component, inject, effect, signal, OnDestroy } from '@angular/core';
import {
  CdkDragDrop,
  CdkDrag,
  CdkDropList,
  CdkDragPlaceholder,
  CdkDragPreview,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { TranslateModule } from '@ngx-translate/core';
import { BannerComponent } from '../../../../components/banner/banner.component';
import { ButtonComponent } from '../../../../components/button/button.component';
import { GameStateService } from '../../../../services/game-state.service';
import { WebSocketService } from '../../../../services/websocket.service';
import { CLIENT_MSG } from '@shared/ws-messages';
import type { Item } from '@shared/types';

@Component({
  selector: 'app-gameplay',
  standalone: true,
  imports: [CdkDropList, CdkDrag, CdkDragPlaceholder, CdkDragPreview, TranslateModule, BannerComponent, ButtonComponent],
  templateUrl: './gameplay.component.html',
  styleUrl: './gameplay.component.scss',
})
export class GameplayComponent implements OnDestroy {
  readonly gameState = inject(GameStateService);
  private readonly ws = inject(WebSocketService);

  readonly submitted = signal(false);
  readonly rankedItems = signal<Item[]>([]);

  private autoSubmitted = false;

  constructor() {
    effect(() => {
      const items = this.gameState.items();
      if (items.length > 0 && !this.submitted()) {
        this.rankedItems.set([...items]);
      }
    });

    effect(() => {
      const seconds = this.gameState.timerSeconds();
      if (seconds === 0 && !this.submitted() && !this.gameState.isSpectator() && !this.autoSubmitted) {
        this.autoSubmitted = true;
        this.submitRanking();
      }
    });
  }

  ngOnDestroy(): void {
    this.autoSubmitted = false;
  }

  onDrop(event: CdkDragDrop<Item[]>): void {
    if (this.submitted() || this.gameState.isSpectator()) return;

    const items = [...this.rankedItems()];
    moveItemInArray(items, event.previousIndex, event.currentIndex);
    this.rankedItems.set(items);
    this.gameState.updateRankings(items.map((item) => item.id));
  }

  submitRanking(): void {
    if (this.submitted() || this.gameState.isSpectator()) return;

    const ranking = this.rankedItems().map((item) => item.id);
    this.ws.send({
      type: CLIENT_MSG.SUBMIT_RANKING,
      payload: {
        lobbyCode: this.gameState.lobbyCode() ?? '',
        roundIndex: this.gameState.currentRound() - 1,
        ranking,
      },
    });
    this.submitted.set(true);
  }
}
