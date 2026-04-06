import { Component, input } from '@angular/core';

@Component({
  selector: 'app-card',
  standalone: true,
  template: `
    <div class="card">
      @if (title()) {
        <h2 class="card__title">
          @if (icon()) {
            <span class="card__icon">{{ icon() }}</span>
          }
          {{ title() }}
        </h2>
      }
      <ng-content />
    </div>
  `,
  styleUrl: './card.component.scss',
})
export class CardComponent {
  readonly title = input<string>();
  readonly icon = input<string>();
}
