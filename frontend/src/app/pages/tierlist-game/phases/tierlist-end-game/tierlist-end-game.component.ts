import { Component, inject, signal, computed } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { CardComponent } from '../../../../components/card/card.component';
import { ButtonComponent } from '../../../../components/button/button.component';
import { PlayerAvatarComponent } from '../../../../components/player-avatar/player-avatar.component';
import { TierListGameStateService } from '../../../../services/tierlist-game-state.service';
import { AvatarService, type AvatarData } from '../../../../services/avatar.service';
import { TIER_COLORS } from '@shared/types';
import type { TierName } from '@shared/types';
import type { LeaderboardEntry } from '@shared/ws-messages';

interface TierRow {
  name: TierName;
  color: string;
}

@Component({
  selector: 'app-tierlist-end-game',
  standalone: true,
  imports: [TranslateModule, CardComponent, ButtonComponent, PlayerAvatarComponent],
  templateUrl: './tierlist-end-game.component.html',
  styleUrl: './tierlist-end-game.component.scss',
})
export class TierlistEndGameComponent {
  readonly gameState = inject(TierListGameStateService);
  private readonly avatarService = inject(AvatarService);

  readonly showLeaderboard = signal(false);

  readonly tiers: TierRow[] = [
    { name: 'S', color: TIER_COLORS.S },
    { name: 'A', color: TIER_COLORS.A },
    { name: 'B', color: TIER_COLORS.B },
    { name: 'C', color: TIER_COLORS.C },
    { name: 'D', color: TIER_COLORS.D },
    { name: 'F', color: TIER_COLORS.F },
  ];

  readonly sortedLeaderboard = computed<LeaderboardEntry[]>(() => {
    const lb = this.gameState.leaderboard();
    return [...lb].sort((a, b) => b.totalScore - a.totalScore);
  });

  readonly showCountdown = computed(() =>
    this.gameState.phase() === 'rematch_countdown'
  );

  readonly winners = computed(() => {
    const lb = this.sortedLeaderboard();
    if (lb.length === 0) return [];
    const maxScore = lb[0].totalScore;
    return lb.filter(e => e.totalScore === maxScore);
  });

  toggleView(): void {
    this.showLeaderboard.update(v => !v);
  }

  isWinner(entry: LeaderboardEntry): boolean {
    const w = this.winners();
    return w.some(e => e.playerId === entry.playerId);
  }

  getTierItems(tierName: TierName): { id: string; displayName: string; imageUrl: string }[] {
    const result = this.gameState.tierListResult();
    if (!result) return [];
    const tier = result.tiers.find(t => t.tier === tierName);
    return tier?.items.map(i => ({ id: i.id, displayName: i.displayName, imageUrl: i.imageUrl })) ?? [];
  }

  getAvatar(playerId: string): AvatarData | undefined {
    return this.avatarService.getAvatar(playerId);
  }
}
