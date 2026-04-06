// Item Store Module
// Stores items organized by category and provides item selection
// for Category_Mode and Random_Mode with used-item tracking

import { Item } from '../../../shared/types';

export interface ItemsByCategory {
  [category: string]: Item[];
}

export class ItemStore {
  private itemsByCategory: ItemsByCategory;

  constructor(items?: Item[]) {
    if (items) {
      this.itemsByCategory = ItemStore.groupByCategory(items);
    } else {
      this.itemsByCategory = ItemStore.loadFromFile();
    }
  }

  private static loadFromFile(): ItemsByCategory {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.resolve(process.cwd(), 'data/items.json');
    const raw = fs.readFileSync(filePath, 'utf-8');
    const items: Item[] = JSON.parse(raw);
    return ItemStore.groupByCategory(items);
  }

  private static groupByCategory(items: Item[]): ItemsByCategory {
    const grouped: ItemsByCategory = {};
    for (const item of items) {
      if (!grouped[item.category]) {
        grouped[item.category] = [];
      }
      grouped[item.category].push(item);
    }
    return grouped;
  }

  getCategories(): string[] {
    return Object.keys(this.itemsByCategory);
  }

  getItemsByCategory(category: string): Item[] {
    return this.itemsByCategory[category] || [];
  }

  getAllItems(): Item[] {
    return Object.values(this.itemsByCategory).flat();
  }

  /**
   * Select 5 items based on the game mode.
   *
   * Category mode: all 5 items from a single category.
   * Random mode: 5 items from multiple categories (at least 2 distinct).
   *
   * @param mode - 'category' or 'random'
   * @param usedItemIds - Set of item IDs already used in this session
   * @param category - Optional category for category mode (random if omitted)
   * @returns Array of 5 items
   */
  selectItems(
    mode: 'category' | 'random',
    usedItemIds: Set<string>,
    category?: string,
  ): Item[] {
    if (mode === 'category') {
      return this.selectCategoryItems(usedItemIds, category);
    }
    return this.selectRandomItems(usedItemIds);
  }

  private selectCategoryItems(usedItemIds: Set<string>, category?: string): Item[] {
    const categories = this.getCategories();
    if (categories.length === 0) {
      throw new Error('No categories available');
    }

    let targetCategory: string;
    if (category) {
      if (!this.itemsByCategory[category]) {
        throw new Error(`Category "${category}" not found`);
      }
      targetCategory = category;
    } else {
      // Pick a random category that has enough unused items
      const eligible = categories.filter((cat) => {
        const available = this.itemsByCategory[cat].filter((item) => !usedItemIds.has(item.id));
        return available.length >= 5;
      });
      if (eligible.length === 0) {
        throw new Error('Not enough unused items in any single category');
      }
      targetCategory = eligible[Math.floor(Math.random() * eligible.length)];
    }

    const available = this.itemsByCategory[targetCategory].filter(
      (item) => !usedItemIds.has(item.id),
    );
    if (available.length < 5) {
      throw new Error(
        `Not enough unused items in category "${targetCategory}" (need 5, have ${available.length})`,
      );
    }

    return ItemStore.pickRandom(available, 5);
  }

  private selectRandomItems(usedItemIds: Set<string>): Item[] {
    // Gather all unused items grouped by category
    const availableByCategory: ItemsByCategory = {};
    for (const [cat, items] of Object.entries(this.itemsByCategory)) {
      const unused = items.filter((item) => !usedItemIds.has(item.id));
      if (unused.length > 0) {
        availableByCategory[cat] = unused;
      }
    }

    const availableCategories = Object.keys(availableByCategory);
    if (availableCategories.length < 2) {
      throw new Error('Not enough categories with unused items for random mode (need at least 2)');
    }

    const allAvailable = Object.values(availableByCategory).flat();
    if (allAvailable.length < 5) {
      throw new Error(
        `Not enough unused items for random mode (need 5, have ${allAvailable.length})`,
      );
    }

    // Ensure at least 2 distinct categories in the selection
    // Strategy: pick 1 item from each of 2 random categories, then fill remaining 3 randomly
    const shuffledCats = ItemStore.shuffle([...availableCategories]);
    const cat1 = shuffledCats[0];
    const cat2 = shuffledCats[1];

    const item1 = ItemStore.pickRandom(availableByCategory[cat1], 1)[0];
    const item2 = ItemStore.pickRandom(availableByCategory[cat2], 1)[0];

    const selected: Item[] = [item1, item2];
    const selectedIds = new Set([item1.id, item2.id]);

    // Fill remaining 3 from all unused items (excluding already selected)
    const remaining = allAvailable.filter((item) => !selectedIds.has(item.id));
    const extra = ItemStore.pickRandom(remaining, 3);
    selected.push(...extra);

    return selected;
  }

  private static pickRandom(items: Item[], count: number): Item[] {
    const shuffled = ItemStore.shuffle([...items]);
    return shuffled.slice(0, count);
  }

  private static shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}
