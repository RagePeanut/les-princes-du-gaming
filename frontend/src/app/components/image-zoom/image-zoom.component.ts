import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-image-zoom',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (visible()) {
      <div class="zoom-overlay" (click)="close()" role="dialog" aria-modal="true" aria-label="Zoomed image">
        <button class="zoom-overlay__close" (click)="close()" aria-label="Close zoom">&times;</button>
        <img
          class="zoom-overlay__image"
          [src]="imageSrc()"
          [alt]="imageAlt()"
          (click)="$event.stopPropagation()"
        />
        <span class="zoom-overlay__label">{{ imageAlt() }}</span>
      </div>
    }
  `,
  styleUrl: './image-zoom.component.scss',
})
export class ImageZoomComponent {
  readonly visible = signal(false);
  readonly imageSrc = signal('');
  readonly imageAlt = signal('');

  open(src: string, alt: string): void {
    this.imageSrc.set(src);
    this.imageAlt.set(alt);
    this.visible.set(true);
  }

  close(): void {
    this.visible.set(false);
  }
}
