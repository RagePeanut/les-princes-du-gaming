import { Component, inject } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [TranslateModule],
  template: `
    <div class="toast-container" aria-live="polite">
      @for (toast of toastService.toasts(); track toast.id) {
        <div class="toast" [class]="'toast--' + toast.type">
          <span class="toast__icon">
            @switch (toast.type) {
              @case ('error') { ❌ }
              @case ('success') { ✅ }
              @case ('info') { ℹ️ }
            }
          </span>
          <span class="toast__message">{{ toast.message }}</span>
          <div class="toast__actions">
            @if (toast.retry) {
              <button class="toast__retry-btn" (click)="toast.retry!(); toastService.dismiss(toast.id)">
                {{ 'toast.retry' | translate }}
              </button>
            }
            <button class="toast__close-btn" (click)="toastService.dismiss(toast.id)" [attr.aria-label]="'toast.dismiss' | translate">
              ✕
            </button>
          </div>
        </div>
      }
    </div>
  `,
  styleUrl: './toast.component.scss',
})
export class ToastComponent {
  readonly toastService = inject(ToastService);
}
