import { Component, input } from '@angular/core';

@Component({
  selector: 'app-player-avatar',
  standalone: true,
  template: `
    <div class="avatar-wrapper">
      @if (headSrc()) {
        <div class="avatar-layers" [class.avatar-layers--sm]="size() === 'sm'" [class.avatar-layers--no-accessory]="!accessorySrc()">
          @if (accessorySrc()) {
            <img
              class="avatar-layer avatar-layer--accessory"
              [src]="accessorySrc()"
              alt=""
            />
          }
          <img
            class="avatar-layer avatar-layer--head"
            [src]="headSrc()"
            [alt]="alt()"
          />
        </div>
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
  readonly headSrc = input<string | undefined>();
  readonly accessorySrc = input<string | null | undefined>();
  readonly alt = input('avatar');
  readonly fallback = input('?');
  readonly showCrown = input(false);
  readonly size = input<'md' | 'sm'>('md');
}
