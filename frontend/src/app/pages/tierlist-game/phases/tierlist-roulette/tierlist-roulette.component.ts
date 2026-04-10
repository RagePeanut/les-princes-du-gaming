import { Component, inject, effect, signal, OnDestroy, ElementRef, viewChild } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { TierListGameStateService } from '../../../../services/tierlist-game-state.service';
import { SoundService } from '../../../../services/sound.service';

@Component({
  selector: 'app-tierlist-roulette',
  standalone: true,
  imports: [TranslateModule],
  templateUrl: './tierlist-roulette.component.html',
  styleUrl: './tierlist-roulette.component.scss',
})
export class TierlistRouletteComponent implements OnDestroy {
  readonly gameState = inject(TierListGameStateService);
  private readonly sound = inject(SoundService);

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
  private targetPosition: number | null = null;
  private lastItemIndex = -1;

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

    // Play tick when crossing an item boundary
    const itemWidth = (el.firstElementChild as HTMLElement)?.offsetWidth ?? 160;
    const gap = 16; // 1rem gap
    const step = itemWidth + gap;
    const currentIndex = Math.floor(this.scrollPosition / step);
    if (currentIndex !== this.lastItemIndex) {
      this.lastItemIndex = currentIndex;
      this.sound.play('rouletteTick');
    }

    el.style.transform = `translateX(-${this.scrollPosition}px)`;

    if (this.stopRequested) {
      // On first deceleration frame, compute the target scroll position
      if (this.targetPosition === null) {
        this.targetPosition = this.computeTargetPosition(el, step);
      }

      this.speed *= this.deceleration;

      // Ease toward the target position as we slow down
      const distToTarget = this.targetPosition - this.scrollPosition;
      if (Math.abs(distToTarget) > 1) {
        // Blend: as speed drops, increasingly steer toward target
        const blend = Math.max(0.02, 1 - this.speed / 12);
        this.scrollPosition += distToTarget * blend * 0.1;
      }

      // When slow enough, snap to the target theme position
      if (this.speed < this.minSpeed) {
        this.scrollPosition = this.targetPosition;
        el.style.transform = `translateX(-${this.scrollPosition}px)`;
        this.spinning.set(false);
        this.selectedTheme.set(this.targetTheme);
        return;
      }
    }

    this.animationFrame = requestAnimationFrame(() => this.animate());
  }

  /**
   * Find a scroll position that centers the target theme under the pointer.
   * Picks an occurrence that is ahead of the current scroll position so the
   * roulette always rolls forward before stopping.
   */
  private computeTargetPosition(track: HTMLElement, step: number): number {
    const allThemes = this.themes();
    const viewportWidth = track.parentElement?.clientWidth ?? 600;
    // Offset so the item is centered under the pointer
    const centerOffset = viewportWidth / 2 - step / 2 + 16; // 16 = gap

    // Find all indices of the target theme
    const indices: number[] = [];
    for (let i = 0; i < allThemes.length; i++) {
      if (allThemes[i] === this.targetTheme) {
        indices.push(i);
      }
    }

    if (indices.length === 0) return this.scrollPosition;

    // Pick the first occurrence that is comfortably ahead of current position
    // so the roulette visually rolls forward before landing
    const minAhead = this.scrollPosition + step * 3;
    for (const idx of indices) {
      const pos = idx * step - centerOffset;
      if (pos >= minAhead) {
        return pos;
      }
    }

    // Fallback: use the last occurrence
    const lastIdx = indices[indices.length - 1];
    return lastIdx * step - centerOffset;
  }
}
