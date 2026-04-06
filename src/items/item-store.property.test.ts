import * as fc from 'fast-check';
import { Item } from '@shared/types';
import { ItemStore } from './item-store';

/**
 * Arbitrary that generates a test Item with a given category.
 */
function arbItem(category: string, index: number): Item {
  return {
    id: `${category}-${index}`,
    displayName: `${category} Item ${index}`,
    imageUrl: `https://example.com/${category}-${index}.png`,
    category,
  };
}

/**
 * Arbitrary that generates a dataset of items across multiple categories.
 * Each category has between `minPerCategory` and `maxPerCategory` items.
 * Number of categories is between `minCategories` and `maxCategories`.
 */
function arbItemDataset(opts: {
  minCategories: number;
  maxCategories: number;
  minPerCategory: number;
  maxPerCategory: number;
}): fc.Arbitrary<Item[]> {
  return fc
    .integer({ min: opts.minCategories, max: opts.maxCategories })
    .chain((numCategories) => {
      const categoryArbs = Array.from({ length: numCategories }, (_, catIdx) =>
        fc.integer({ min: opts.minPerCategory, max: opts.maxPerCategory }).map((count) => {
          const catName = `cat${catIdx}`;
          return Array.from({ length: count }, (_, i) => arbItem(catName, i));
        }),
      );
      return fc.tuple(...categoryArbs).map((arrays) => arrays.flat());
    });
}

/**
 * Feature: multiplayer-game-hub, Property 5: Category mode
 *
 * **Validates: Requirements 6.1**
 *
 * For any round played in Category_Mode, all 5 selected items
 * SHALL belong to the same category.
 */
describe('Property 5: Category mode selects items from a single category', () => {
  it('all 5 selected items belong to the same category', () => {
    fc.assert(
      fc.property(
        arbItemDataset({
          minCategories: 1,
          maxCategories: 6,
          minPerCategory: 5,
          maxPerCategory: 25,
        }),
        (items: Item[]) => {
          const store = new ItemStore(items);
          const selected = store.selectItems('category', new Set<string>());

          // Exactly 5 items selected
          expect(selected).toHaveLength(5);

          // All items belong to the same category
          const categories = new Set(selected.map((item) => item.category));
          expect(categories.size).toBe(1);

          // The single category must be one of the store's categories
          const [category] = categories;
          expect(store.getCategories()).toContain(category);
        },
      ),
      { numRuns: 20 },
    );
  });
});


/**
 * Feature: multiplayer-game-hub, Property 6: Random mode
 *
 * **Validates: Requirements 6.2**
 *
 * For any round played in Random_Mode (given an item store with at least 2
 * categories each having at least 3 items), the 5 selected items SHALL span
 * at least 2 distinct categories.
 */
describe('Property 6: Random mode selects items from multiple categories', () => {
  it('selected items span at least 2 distinct categories', () => {
    fc.assert(
      fc.property(
        arbItemDataset({
          minCategories: 2,
          maxCategories: 6,
          minPerCategory: 3,
          maxPerCategory: 25,
        }),
        (items: Item[]) => {
          const store = new ItemStore(items);

          // Only run when preconditions are met: at least 2 categories with enough items
          const categories = store.getCategories();
          const categoriesWithEnough = categories.filter(
            (cat) => store.getItemsByCategory(cat).length >= 3,
          );
          fc.pre(categoriesWithEnough.length >= 2);

          // Total available items must be at least 5
          fc.pre(store.getAllItems().length >= 5);

          const selected = store.selectItems('random', new Set<string>());

          // Exactly 5 items selected
          expect(selected).toHaveLength(5);

          // Items span at least 2 distinct categories
          const selectedCategories = new Set(selected.map((item) => item.category));
          expect(selectedCategories.size).toBeGreaterThanOrEqual(2);
        },
      ),
      { numRuns: 20 },
    );
  });
});

/**
 * Feature: multiplayer-game-hub, Property 7: No item repeats
 *
 * **Validates: Requirements 6.3**
 *
 * For any game session with R rounds, the union of all item IDs across all
 * rounds SHALL contain exactly 5 × R unique item IDs (no duplicates).
 */
describe('Property 7: No item repetition across rounds', () => {
  it('all item IDs across R rounds are unique (5×R total)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        arbItemDataset({
          minCategories: 2,
          maxCategories: 6,
          minPerCategory: 10,
          maxPerCategory: 30,
        }),
        fc.constantFrom('category' as const, 'random' as const),
        (rounds: number, items: Item[], mode: 'category' | 'random') => {
          const store = new ItemStore(items);

          // Precondition: enough items for R rounds
          if (mode === 'category') {
            // At least one category must have 5 * rounds items
            const hasEnough = store.getCategories().some(
              (cat) => store.getItemsByCategory(cat).length >= 5 * rounds,
            );
            fc.pre(hasEnough);
          } else {
            // Random mode needs at least 2 categories with >= 3 items and 5*rounds total
            const categories = store.getCategories();
            const categoriesWithEnough = categories.filter(
              (cat) => store.getItemsByCategory(cat).length >= 3,
            );
            fc.pre(categoriesWithEnough.length >= 2);
            fc.pre(store.getAllItems().length >= 5 * rounds);
          }

          const usedItemIds = new Set<string>();
          const allSelectedIds: string[] = [];

          for (let r = 0; r < rounds; r++) {
            const selected = store.selectItems(mode, usedItemIds);
            for (const item of selected) {
              allSelectedIds.push(item.id);
              usedItemIds.add(item.id);
            }
          }

          // Total items selected should be 5 * rounds
          expect(allSelectedIds).toHaveLength(5 * rounds);

          // All IDs should be unique (no repeats across rounds)
          const uniqueIds = new Set(allSelectedIds);
          expect(uniqueIds.size).toBe(5 * rounds);
        },
      ),
      { numRuns: 20 },
    );
  });
});
