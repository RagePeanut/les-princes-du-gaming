import { TestBed } from '@angular/core/testing';
import { HubComponent } from './hub.component';
import { Router } from '@angular/router';
import * as fc from 'fast-check';
import type { GameCard } from '@shared/types';

/**
 * Property 12: Game card rendering completeness
 *
 * *For any* list of game cards (internal and external), the hub page SHALL render all cards.
 * Each card SHALL display its title and description. External cards SHALL include an external
 * link indicator. Internal cards SHALL not have an external link indicator.
 *
 * **Validates: Requirements 1.1, 2.7, 15.1, 15.4**
 *
 * Tag: Feature: multiplayer-game-hub, Property 12: Game card rendering
 */

const internalCardArb: fc.Arbitrary<GameCard> = fc.record({
  id: fc.uuid(),
  title: fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9 ]{0,29}[A-Za-z0-9]$/).filter(s => s.length >= 2),
  description: fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9 ]{0,49}[A-Za-z0-9]$/).filter(s => s.length >= 2),
  imageUrl: fc.constant('/assets/placeholder.png'),
  isExternal: fc.constant(false),
  externalUrl: fc.constant(undefined),
  routePath: fc.constant('/game/ranking'),
});

const externalCardArb: fc.Arbitrary<GameCard> = fc.record({
  id: fc.uuid(),
  title: fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9 ]{0,29}[A-Za-z0-9]$/).filter(s => s.length >= 2),
  description: fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9 ]{0,49}[A-Za-z0-9]$/).filter(s => s.length >= 2),
  imageUrl: fc.constant('/assets/placeholder.png'),
  isExternal: fc.constant(true),
  externalUrl: fc.constant('https://example.com/game'),
  routePath: fc.constant(undefined),
});

const gameCardArb: fc.Arbitrary<GameCard> = fc.oneof(internalCardArb, externalCardArb);

const gameCardListArb: fc.Arbitrary<GameCard[]> = fc.array(gameCardArb, { minLength: 0, maxLength: 10 });

describe('HubComponent - Property 12: Game card rendering completeness', () => {
  let mockRouter: { navigate: ReturnType<typeof vi.fn> };
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockRouter = { navigate: vi.fn().mockResolvedValue(true) };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  async function setupComponentWithGames(games: GameCard[]) {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(games),
      })
    ) as any;

    await TestBed.configureTestingModule({
      imports: [HubComponent],
      providers: [
        { provide: Router, useValue: mockRouter },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(HubComponent);

    // Trigger ngOnInit which calls fetchGames
    fixture.detectChanges();

    // Flush the microtask queue so the fetch promise resolves
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    // Re-render after data is loaded
    fixture.detectChanges();

    return fixture;
  }

  it('should render all game cards with titles, descriptions, and correct external indicators', async () => {
    await fc.assert(
      fc.asyncProperty(gameCardListArb, async (games) => {
        TestBed.resetTestingModule();

        const fixture = await setupComponentWithGames(games);
        const el: HTMLElement = fixture.nativeElement;

        // 1. All cards are rendered (count matches array length)
        const allCards = el.querySelectorAll('.game-card');
        expect(allCards.length).toBe(games.length);

        // 2. Each card displays its title and description
        const titles = el.querySelectorAll('.game-card__title');
        const descriptions = el.querySelectorAll('.game-card__description');
        expect(titles.length).toBe(games.length);
        expect(descriptions.length).toBe(games.length);

        for (let i = 0; i < games.length; i++) {
          expect(titles[i].textContent?.trim()).toBe(games[i].title);
          expect(descriptions[i].textContent?.trim()).toBe(games[i].description);
        }

        // 3. External cards have the external link indicator badge
        const externalCards = el.querySelectorAll('.game-card--external');
        const expectedExternalCount = games.filter(g => g.isExternal).length;
        expect(externalCards.length).toBe(expectedExternalCount);

        externalCards.forEach(card => {
          const badge = card.querySelector('.game-card__external-badge');
          expect(badge).not.toBeNull();
        });

        // 4. Internal cards do NOT have the external link indicator badge
        const internalCards = el.querySelectorAll('.game-card:not(.game-card--external)');
        const expectedInternalCount = games.filter(g => !g.isExternal).length;
        expect(internalCards.length).toBe(expectedInternalCount);

        internalCards.forEach(card => {
          const badge = card.querySelector('.game-card__external-badge');
          expect(badge).toBeNull();
        });

        fixture.destroy();
      }),
      { numRuns: 20 }
    );
  });
});
