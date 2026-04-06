import { Component, input } from '@angular/core';

@Component({
  selector: 'app-player-avatar',
  standalone: true,
  template: `
    <div class="avatar-wrapper">
      @if (src()) {
        <img
          class="avatar"
          [class.avatar--sm]="size() === 'sm'"
          [src]="src()"
          [alt]="alt()"
        />
      } @else {
        <div
          class="avatar-placeholder"
          [class.avatar-placeholder--sm]="size() === 'sm'"
        >
          {{ fallback() }}
        </div>
      }
      @if (showCrown()) {
        <span class="crown" aria-label="Previous winner">👑</span>
      }
    </div>
  `,
  styleUrl: './player-avatar.component.scss',
})
export class PlayerAvatarComponent {
  readonly src = input<string | undefined>();
  readonly alt = input('avatar');
  readonly fallback = input('?');
  readonly showCrown = input(false);
  readonly size = input<'md' | 'sm'>('md');
}
