import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-button',
  standalone: true,
  template: `
    <button
      class="btn"
      [class.btn--primary]="variant() === 'primary'"
      [class.btn--success]="variant() === 'success'"
      [class.btn--full-width]="fullWidth()"
      [disabled]="disabled() || loading()"
      [type]="type()"
      (click)="clicked.emit()"
    >
      @if (loading()) {
        <span class="btn__spinner"></span>
      }
      <ng-content />
    </button>
  `,
  styleUrl: './button.component.scss',
})
export class ButtonComponent {
  readonly variant = input<'primary' | 'success'>('primary');
  readonly disabled = input(false);
  readonly loading = input(false);
  readonly fullWidth = input(false);
  readonly type = input<'button' | 'submit'>('button');
  readonly clicked = output<void>();
}
