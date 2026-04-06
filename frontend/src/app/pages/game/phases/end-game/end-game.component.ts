import { Component, inject, computed } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { CardComponent } from '../../../../components/card/card.component';
import { PlayerAvatarComponent } from '../../../../components/player-avatar/player-avatar.component';
import { GameStateService } from '../../../../services/game-state.service';
import { AvatarService } from '../../../../services/avatar.service';
import type { LeaderboardEntry } from '@shared/ws-messages';

@Component({
  selector: 'app-end-game',
  standalone: true,
  imports: [TranslateModule, CardComponent, PlayerAvatarComponent],
  templateUrl: './end-game.component.html',
  styleUrl: './end-game.component.scss',
})
export class EndGameComponent {
  readonly gameState = inject(GameStateService);
  private readonly avatarService = inject(AvatarService);

  readonly sortedLeaderboard = computed<LeaderboardEntry[]>(() => {
    const lb = this.gameState.leaderboard();
    return [...lb].sort((a, b) => b.totalScore - a.totalScore);
  });

  readonly showCountdown = computed(() => this.gameState.phase() === 'rematch_countdown');

  getAvatar(playerId: string): string | undefined {
    return this.avatarService.getAvatar(playerId);
  }

  isWinner(entry: LeaderboardEntry): boolean {
    return entry.rank === 1;
  }
}
