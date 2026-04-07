import { Component, inject } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { TierListGameStateService } from '../../../../services/tierlist-game-state.service';
import { TIER_COLORS } from '@shared/types';
import type { TierName } from '@shared/types';

interface TierRow {
  name: TierName;
  color: string;
}

@Component({
  selector: 'app-tierlist-suspense',
  standalone: true,
  imports: [TranslateModule],
  templateUrl: './tierlist-suspense.component.html',
  styleUrl: './tierlist-suspense.component.scss',
})
export class TierlistSuspenseComponent {
  readonly gameState = inject(TierListGameStateService);

  readonly tiers: TierRow[] = [
    { name: 'S', color: TIER_COLORS.S },
    { name: 'A', color: TIER_COLORS.A },
    { name: 'B', color: TIER_COLORS.B },
    { name: 'C', color: TIER_COLORS.C },
    { name: 'D', color: TIER_COLORS.D },
    { name: 'F', color: TIER_COLORS.F },
  ];

  getTierItems(tierName: TierName): { id: string; displayName: string }[] {
    const result = this.gameState.tierListResult();
    if (!result) return [];
    const tier = result.tiers.find(t => t.tier === tierName);
    return tier?.items.map(i => ({ id: i.id, displayName: i.displayName })) ?? [];
  }
}
