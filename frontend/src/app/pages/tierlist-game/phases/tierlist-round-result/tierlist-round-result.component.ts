import { Component, inject, computed } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { CardComponent } from '../../../../components/card/card.component';
import { PlayerAvatarComponent } from '../../../../components/player-avatar/player-avatar.component';
import { TierListGameStateService } from '../../../../services/tierlist-game-state.service';
import { WebSocketService } from '../../../../services/websocket.service';
import { AvatarService } from '../../../../services/avatar.service';
import { TIER_COLORS } from '@shared/types';
import { CLIENT_MSG } from '@shared/ws-messages';
import type { TierName } from '@shared/types';

interface TierRow {
  name: TierName;
  color: string;
}

@Component({
  selector: 'app-tierlist-round-result',
  standalone: true,
  imports: [TranslateModule, CardComponent, PlayerAvatarComponent],
  templateUrl: './tierlist-round-result.component.html',
  styleUrl: './tierlist-round-result.component.scss',
})
export class TierlistRoundResultComponent {
  readonly gameState = inject(TierListGameStateService);
  private readonly avatarService = inject(AvatarService);
  private readonly ws = inject(WebSocketService);

  readonly tiers: TierRow[] = [
    { name: 'S', color: TIER_COLORS.S },
    { name: 'A', color: TIER_COLORS.A },
    { name: 'B', color: TIER_COLORS.B },
    { name: 'C', color: TIER_COLORS.C },
    { name: 'D', color: TIER_COLORS.D },
    { name: 'F', color: TIER_COLORS.F },
  ];

  readonly finalTierColor = computed(() => {
    const tier = this.gameState.roundFinalTier();
    return tier ? TIER_COLORS[tier] : '#ccc';
  });

  readonly votesByTier = computed(() => {
    const votes = this.gameState.roundVotes();
    const map = new Map<TierName, typeof votes>();
    for (const v of votes) {
      const list = map.get(v.votedTier) ?? [];
      list.push(v);
      map.set(v.votedTier, list);
    }
    return map;
  });

  getVotesForTier(tierName: TierName) {
    return this.votesByTier().get(tierName) ?? [];
  }

  getAvatar(playerId: string): string | undefined {
    return this.avatarService.getAvatar(playerId);
  }

  readonly isManualAdvance = computed(() => {
    const config = this.gameState.config();
    return config ? config.timeBetweenRounds === -1 : false;
  });

  nextRound(): void {
    const code = this.gameState.lobbyCode();
    if (!code) return;
    this.ws.send({
      type: CLIENT_MSG.NEXT_ROUND,
      payload: { lobbyCode: code },
    });
  }
}
