import { Component, input } from '@angular/core';

@Component({
  selector: 'app-banner',
  standalone: true,
  template: `
    <div
      class="banner"
      [class.banner--success]="variant() === 'success'"
      [class.banner--warning]="variant() === 'warning'"
      [class.banner--info]="variant() === 'info'"
    >
      @if (icon()) {
        <span class="banner__icon">{{ icon() }}</span>
      }
      <span class="banner__text">{{ text() }}</span>
    </div>
  `,
  styleUrl: './banner.component.scss',
})
export class BannerComponent {
  readonly variant = input<'success' | 'warning' | 'info'>('info');
  readonly icon = input<string>();
  readonly text = input.required<string>();
}
