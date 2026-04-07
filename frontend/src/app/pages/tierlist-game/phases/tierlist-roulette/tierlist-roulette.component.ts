import { Component, inject, effect, signal, OnDestroy, ElementRef, viewChild } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { TierListGameStateService } from '../../../../services/tierlist-game-state.service';

@Component({
  selector: 'app-tierlist-roulette',
  standalone: true,
  imports: [TranslateModule],
  templateUrl: './tierlist-roulette.component.html',
  styleUrl: './tierlist-roulette.component.scss',
})
export class TierlistRouletteComponent implements OnDestroy {
  readonly gameState = inject(TierListGameStateService);

  readonly themes = signal<string[]>([]);
  readonly selectedTheme = signal<string | null>(null);
  readonly spinning = signal(true);

  private animationFrame: number | null = null;
  private scrollPosition = 0;
  private speed = 12;
  private readonly deceleration = 0.985;
  private readonly minSpeed = 0.3;
  private stopRequested = false;
  private targetTheme: string | null = null;

  readonly trackEl = viewChild<ElementRef<HTMLDivElement>>('track');

  constructor() {
    // When themes arrive, start spinning
    effect(() => {
      const t = this.gameState.rouletteThemes();
      if (t.length > 0) {
        // Duplicate themes for seamless loop
        const repeated = [...t, ...t, ...t, ...t, ...t];
        this.themes.set(repeated);
        this.startAnimation();
      }
    });

    // When selected theme arrives, decelerate and stop
    effect(() => {
      const selected = this.gameState.selectedTheme();
      if (selected) {
        this.targetTheme = selected;
        this.stopRequested = true;
      }
    });
  }

  ngOnDestroy(): void {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
    }
  }

  private startAnimation(): void {
    this.speed = 12;
    this.scrollPosition = 0;
    this.spinning.set(true);
    this.animate();
  }

  private animate(): void {
    const el = this.trackEl()?.nativeElement;
    if (!el) {
      this.animationFrame = requestAnimationFrame(() => this.animate());
      return;
    }

    this.scrollPosition += this.speed;

    // Loop: reset when we've scrolled past half the track
    const halfWidth = el.scrollWidth / 2;
    if (halfWidth > 0 && this.scrollPosition >= halfWidth) {
      this.scrollPosition -= halfWidth;
    }

    el.style.transform = `translateX(-${this.scrollPosition}px)`;

    if (this.stopRequested) {
      this.speed *= this.deceleration;
      if (this.speed < this.minSpeed) {
        this.spinning.set(false);
        this.selectedTheme.set(this.targetTheme);
        return;
      }
    }

    this.animationFrame = requestAnimationFrame(() => this.animate());
  }
}
