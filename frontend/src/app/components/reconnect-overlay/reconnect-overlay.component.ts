import { Component, inject } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { WebSocketService } from '../../services/websocket.service';

@Component({
  selector: 'app-reconnect-overlay',
  standalone: true,
  imports: [TranslateModule],
  template: `
    @if (ws.showReconnectOverlay()) {
      <div class="reconnect-overlay" role="alert" aria-live="assertive">
        <div class="reconnect-overlay__card">
          <div class="reconnect-overlay__spinner"></div>
          <p class="reconnect-overlay__text">{{ 'reconnect.text' | translate }}</p>
          <p class="reconnect-overlay__hint">{{ 'reconnect.hint' | translate }}</p>
        </div>
      </div>
    }
  `,
  styleUrl: './reconnect-overlay.component.scss',
})
export class ReconnectOverlayComponent {
  readonly ws = inject(WebSocketService);
}
