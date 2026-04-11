import { Component, inject, signal, computed, viewChild } from '@angular/core';
import {
  CdkDragDrop,
  CdkDrag,
  CdkDropList,
  CdkDropListGroup,
} from '@angular/cdk/drag-drop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PlayerAvatarComponent } from '../../../../components/player-avatar/player-avatar.component';
import { ImageZoomComponent } from '../../../../components/image-zoom/image-zoom.component';
import { TierListGameStateService } from '../../../../services/tierlist-game-state.service';
import { WebSocketService } from '../../../../services/websocket.service';
import { AvatarService, type AvatarData } from '../../../../services/avatar.service';
import { SoundService } from '../../../../services/sound.service';
import { TIER_COLORS } from '@shared/types';
import type { TierName } from '@shared/types';
import { CLIENT_MSG } from '@shared/ws-messages';

interface TierRow {
  name: TierName;
  color: string;
}

@Component({
  selector: 'app-tierlist-gameplay',
  standalone: true,
  imports: [CdkDropListGroup, CdkDropList, CdkDrag, TranslateModule, PlayerAvatarComponent, ImageZoomComponent],
  templateUrl: './tierlist-gameplay.component.html',
  styleUrl: './tierlist-gameplay.component.scss',
})
export class TierlistGameplayComponent {
  readonly gameState = inject(TierListGameStateService);
  private readonly ws = inject(WebSocketService);
  private readonly avatarService = inject(AvatarService);
  private readonly sound = inject(SoundService);
  private readonly translate = inject(TranslateService);

  readonly imageZoom = viewChild.required(ImageZoomComponent);

  /** Whether the player has confirmed their vote */
  readonly confirmed = signal(false);
  /** Which tier the item is currently placed in (null = still in source) */
  readonly placedTier = signal<TierName | null>(null);

  readonly tiers: TierRow[] = [
    { name: 'S', color: TIER_COLORS.S },
    { name: 'A', color: TIER_COLORS.A },
    { name: 'B', color: TIER_COLORS.B },
    { name: 'C', color: TIER_COLORS.C },
    { name: 'D', color: TIER_COLORS.D },
    { name: 'F', color: TIER_COLORS.F },
  ];

  readonly previousPlacements = computed(() => {
    const result = this.gameState.tierListResult();
    if (!result) return new Map<TierName, { id: string; displayName: string; imageUrl: string }[]>();
    const map = new Map<TierName, { id: string; displayName: string; imageUrl: string }[]>();
    for (const t of result.tiers) {
      if (t.items.length > 0) {
        map.set(t.tier, t.items.map(i => ({ id: i.id, displayName: i.displayName, imageUrl: i.imageUrl })));
      }
    }
    return map;
  });

  readonly activePlayers = computed(() =>
    this.gameState.players().filter(p => !p.isSpectator && p.isConnected)
  );

  hasVoted(playerId: string): boolean {
    return this.gameState.voteStatuses().some(v => v.playerId === playerId && v.hasVoted);
  }

  /** Item dropped into a tier — send vote to server (not confirmed) */
  onDropInTier(event: CdkDragDrop<string>, tierName: TierName): void {
    if (this.confirmed() || this.gameState.isSpectator()) return;
    this.placedTier.set(tierName);
    this.sendVote(tierName, false);
    this.sound.play('drop');
  }

  /** Item dragged back to source */
  onDropInSource(event: CdkDragDrop<string>): void {
    if (this.confirmed() || this.gameState.isSpectator()) return;
    this.placedTier.set(null);
  }

  /** Confirm button — sends the vote as confirmed (triggers early completion check) */
  confirmVote(): void {
    const tier = this.placedTier();
    if (!tier || this.confirmed() || this.gameState.isSpectator()) return;
    this.sendVote(tier, true);
    this.confirmed.set(true);
    this.sound.play('confirm');
  }

  private sendVote(tier: TierName, isConfirmed: boolean): void {
    this.ws.submitTierVote(
      this.gameState.lobbyCode() ?? '',
      this.gameState.currentRound() - 1,
      tier,
      isConfirmed
    );
  }

  getAvatar(playerId: string): AvatarData | undefined {
    return this.avatarService.getAvatar(playerId);
  }

  getTierItems(tierName: TierName): { id: string; displayName: string; imageUrl: string }[] {
    return this.previousPlacements().get(tierName) ?? [];
  }

  openZoom(src: string, itemId: string): void {
    this.imageZoom().open(src, this.translate.instant('items.' + itemId));
  }

  skipCategory(): void {
    this.ws.send({
      type: CLIENT_MSG.SKIP_CATEGORY,
      payload: { lobbyCode: this.gameState.lobbyCode() ?? '' },
    });
  }
}
