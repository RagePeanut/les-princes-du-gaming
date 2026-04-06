import { Component, output } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-spectator-overlay',
  standalone: true,
  imports: [TranslateModule],
  template: `
    <div class="spectator-overlay" role="status" aria-live="polite">
      <div class="spectator-overlay__card">
        <span class="spectator-overlay__icon">👁️</span>
        <h2 class="spectator-overlay__title">{{ 'spectatorOverlay.title' | translate }}</h2>
        <p class="spectator-overlay__text">
          {{ 'spectatorOverlay.text' | translate }}
        </p>
        <button class="spectator-overlay__btn" (click)="dismissed.emit()">
          {{ 'spectatorOverlay.btn' | translate }}
        </button>
      </div>
    </div>
  `,
  styleUrl: './spectator-overlay.component.scss',
})
export class SpectatorOverlayComponent {
  dismissed = output<void>();
}
