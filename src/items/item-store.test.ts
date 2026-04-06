import { Item } from '@shared/types';
import { ItemStore } from './item-store';

// Helper to create test items
function makeItem(id: string, category: string): Item {
  return {
    id,
    displayName: `Item ${id}`,
    imageUrl: `https://example.com/${id}.png`,
    category,
  };
}

// Build a test dataset: 4 categories, 10 items each
function buildTestItems(): Item[] {
  const categories = ['fruits', 'animals', 'colors', 'sports'];
  const items: Item[] = [];
  for (const cat of categories) {
    for (let i = 1; i <= 10; i++) {
      items.push(makeItem(`${cat}-${i}`, cat));
    }
  }
  return items;
}

describe('ItemStore', () => {
  let store: ItemStore;
  const testItems = buildTestItems();

  beforeEach(() => {
    store = new ItemStore(testItems);
  });

  describe('constructor and accessors', () => {
    it('should group items by category', () => {
      const categories = store.getCategories();
      expect(categories).toHaveLength(4);
      expect(categories.sort()).toEqual(['animals', 'colors', 'fruits', 'sports']);
    });

    it('should return items for a given category', () => {
      const fruits = store.getItemsByCategory('fruits');
      expect(fruits).toHaveLength(10);
      expect(fruits.every((item) => item.category === 'fruits')).toBe(true);
    });

    it('should return empty array for unknown category', () => {
      expect(store.getItemsByCategory('unknown')).toEqual([]);
    });

    it('should return all items', () => {
      expect(store.getAllItems()).toHaveLength(40);
    });
  });

  describe('selectItems - category mode', () => {
    it('should return exactly 5 items', () => {
      const items = store.selectItems('category', new Set());
      expect(items).toHaveLength(5);
    });

    it('should return all items from the same category', () => {
      const items = store.selectItems('category', new Set());
      const categories = new Set(items.map((i) => i.category));
      expect(categories.size).toBe(1);
    });

    it('should use the specified category when provided', () => {
      const items = store.selectItems('category', new Set(), 'animals');
      expect(items.every((i) => i.category === 'animals')).toBe(true);
    });

    it('should not return used items', () => {
      const usedIds = new Set(['fruits-1', 'fruits-2', 'fruits-3']);
      const items = store.selectItems('category', usedIds, 'fruits');
      const ids = items.map((i) => i.id);
      for (const usedId of usedIds) {
        expect(ids).not.toContain(usedId);
      }
    });

    it('should throw when not enough unused items in specified category', () => {
      // Use 6 of 10 fruits, leaving only 4
      const usedIds = new Set(['fruits-1', 'fruits-2', 'fruits-3', 'fruits-4', 'fruits-5', 'fruits-6']);
      expect(() => store.selectItems('category', usedIds, 'fruits')).toThrow(
        /Not enough unused items in category "fruits"/,
      );
    });

    it('should throw when category not found', () => {
      expect(() => store.selectItems('category', new Set(), 'nonexistent')).toThrow(
        /Category "nonexistent" not found/,
      );
    });

    it('should throw when no categories have enough unused items', () => {
      // Use 6 items from every category
      const usedIds = new Set<string>();
      for (const cat of ['fruits', 'animals', 'colors', 'sports']) {
        for (let i = 1; i <= 6; i++) {
          usedIds.add(`${cat}-${i}`);
        }
      }
      expect(() => store.selectItems('category', usedIds)).toThrow(
        /Not enough unused items in any single category/,
      );
    });
  });

  describe('selectItems - random mode', () => {
    it('should return exactly 5 items', () => {
      const items = store.selectItems('random', new Set());
      expect(items).toHaveLength(5);
    });

    it('should return items from at least 2 distinct categories', () => {
      const items = store.selectItems('random', new Set());
      const categories = new Set(items.map((i) => i.category));
      expect(categories.size).toBeGreaterThanOrEqual(2);
    });

    it('should not return used items', () => {
      const usedIds = new Set(['fruits-1', 'animals-1', 'colors-1']);
      const items = store.selectItems('random', usedIds);
      const ids = items.map((i) => i.id);
      for (const usedId of usedIds) {
        expect(ids).not.toContain(usedId);
      }
    });

    it('should return 5 unique items', () => {
      const items = store.selectItems('random', new Set());
      const ids = items.map((i) => i.id);
      expect(new Set(ids).size).toBe(5);
    });

    it('should throw when fewer than 2 categories have unused items', () => {
      // Only leave items in one category
      const usedIds = new Set<string>();
      for (const cat of ['animals', 'colors', 'sports']) {
        for (let i = 1; i <= 10; i++) {
          usedIds.add(`${cat}-${i}`);
        }
      }
      expect(() => store.selectItems('random', usedIds)).toThrow(
        /Not enough categories with unused items for random mode/,
      );
    });

    it('should throw when not enough total unused items', () => {
      // Leave only 4 items total across 2 categories
      const usedIds = new Set<string>();
      for (const cat of ['colors', 'sports']) {
        for (let i = 1; i <= 10; i++) {
          usedIds.add(`${cat}-${i}`);
        }
      }
      for (let i = 3; i <= 10; i++) {
        usedIds.add(`fruits-${i}`);
        usedIds.add(`animals-${i}`);
      }
      expect(() => store.selectItems('random', usedIds)).toThrow(
        /Not enough unused items for random mode/,
      );
    });
  });

  describe('selectItems - used item tracking across rounds', () => {
    it('should allow tracking used items across multiple rounds', () => {
      const usedIds = new Set<string>();
      const allSelectedIds: string[] = [];

      // Simulate 2 rounds of category mode
      for (let round = 0; round < 2; round++) {
        const items = store.selectItems('category', usedIds, 'fruits');
        for (const item of items) {
          usedIds.add(item.id);
          allSelectedIds.push(item.id);
        }
      }

      // All 10 IDs should be unique
      expect(new Set(allSelectedIds).size).toBe(10);
    });
  });

  describe('edge cases', () => {
    it('should handle store with empty items', () => {
      const emptyStore = new ItemStore([]);
      expect(() => emptyStore.selectItems('category', new Set())).toThrow(
        /No categories available/,
      );
    });

    it('should handle store with exactly 5 items in one category', () => {
      const minItems = Array.from({ length: 5 }, (_, i) => makeItem(`min-${i}`, 'only'));
      // Add a second category for random mode to work
      const extra = Array.from({ length: 5 }, (_, i) => makeItem(`extra-${i}`, 'other'));
      const minStore = new ItemStore([...minItems, ...extra]);
      const items = minStore.selectItems('category', new Set(), 'only');
      expect(items).toHaveLength(5);
    });
  });
});
