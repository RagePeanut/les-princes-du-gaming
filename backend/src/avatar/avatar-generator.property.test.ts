import * as fc from 'fast-check';
import {
  generateAvatar,
  buildHeadUrl,
  buildAccessoryUrl,
  HEADS,
  ACCESSORY_OPTIONS,
} from './avatar-generator';

// Set the required env var before any test runs
beforeAll(() => {
  process.env.CLOUDFLARE_AVATAR_BASE_URL = 'https://test.r2.dev';
});

/**
 * Feature: cloudflare-avatar-system, Property 1: Avatar combination validity
 *
 * **Validates: Requirements 1.1, 1.2, 1.5**
 *
 * For any generated avatar, the combination key SHALL be in the format
 * "{head}|{accessory}" where head is one of the 15 defined head names
 * and accessory is one of the 3 defined accessory names or "none".
 */
describe('Property 1: Avatar combination validity', () => {
  it('every generated avatar has a valid combination key with head in HEADS and accessory in ACCESSORY_OPTIONS', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          const usedCombinations = new Set<string>();
          const result = generateAvatar(usedCombinations);

          // Combination key must contain exactly one pipe separator
          const parts = result.combinationKey.split('|');
          expect(parts).toHaveLength(2);

          const [head, accessory] = parts;

          // Head must be one of the defined HEADS
          expect(HEADS).toContain(head);

          // Accessory must be one of the defined ACCESSORY_OPTIONS (includes "none")
          expect(ACCESSORY_OPTIONS).toContain(accessory);

          // Combination key must match the expected format exactly
          expect(result.combinationKey).toBe(`${head}|${accessory}`);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Feature: cloudflare-avatar-system, Property 2: Avatar uniqueness within a lobby
 *
 * **Validates: Requirements 1.3, 8.1**
 *
 * For any lobby with N players (N ≤ 60), all N generated avatars SHALL have
 * distinct combination keys. The shared `usedCombinations` set SHALL contain
 * exactly N entries after N generations.
 */
describe('Property 2: Avatar uniqueness within a lobby', () => {
  it('all N generated avatars have distinct combination keys and usedCombinations size equals N', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 60 }),
        (n: number) => {
          const usedCombinations = new Set<string>();
          const keys: string[] = [];

          for (let i = 0; i < n; i++) {
            const result = generateAvatar(usedCombinations);
            keys.push(result.combinationKey);
          }

          // All keys must be distinct
          const uniqueKeys = new Set(keys);
          expect(uniqueKeys.size).toBe(n);

          // The shared usedCombinations set must contain exactly N entries
          expect(usedCombinations.size).toBe(n);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Feature: cloudflare-avatar-system, Property 3: URL construction correctness
 *
 * **Validates: Requirements 2.2, 2.3, 2.4, 2.5**
 *
 * For any head/accessory from the valid sets, the head URL SHALL equal
 * "{baseUrl}/heads/{encodeURIComponent(head)}.png" and the accessory URL
 * SHALL equal "{baseUrl}/accessories/{encodeURIComponent(accessory)}.png"
 * when accessory is not "none", or null when accessory is "none".
 * Parsing the URLs back should recover the original names.
 */
describe('Property 3: URL construction correctness', () => {
  const baseUrl = 'https://test.r2.dev';

  it('buildHeadUrl produces correctly formatted and encoded URLs for any valid head', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...HEADS),
        (head: string) => {
          const url = buildHeadUrl(head);

          // URL must match the expected format
          const expected = `${baseUrl}/heads/${encodeURIComponent(head)}.png`;
          expect(url).toBe(expected);

          // Round-trip: decode the head name back from the URL
          const pathPart = url.replace(`${baseUrl}/heads/`, '').replace('.png', '');
          const decoded = decodeURIComponent(pathPart);
          expect(decoded).toBe(head);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('buildAccessoryUrl produces correctly formatted and encoded URLs for non-"none" accessories', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ACCESSORY_OPTIONS.filter(a => a !== 'none')),
        (accessory: string) => {
          const url = buildAccessoryUrl(accessory);

          // URL must not be null for real accessories
          expect(url).not.toBeNull();

          // URL must match the expected format
          const expected = `${baseUrl}/accessories/${encodeURIComponent(accessory)}.png`;
          expect(url).toBe(expected);

          // Round-trip: decode the accessory name back from the URL
          const pathPart = url!.replace(`${baseUrl}/accessories/`, '').replace('.png', '');
          const decoded = decodeURIComponent(pathPart);
          expect(decoded).toBe(accessory);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('"none" accessory maps to null', () => {
    fc.assert(
      fc.property(
        fc.constant('none'),
        (accessory: string) => {
          const url = buildAccessoryUrl(accessory);
          expect(url).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('for any valid head/accessory pair, URL construction is consistent with combination key', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...HEADS),
        fc.constantFrom(...ACCESSORY_OPTIONS),
        (head: string, accessory: string) => {
          const headUrl = buildHeadUrl(head);
          const accessoryUrl = buildAccessoryUrl(accessory);

          // Head URL always starts with baseUrl/heads/ and ends with .png
          expect(headUrl).toMatch(/^https:\/\/test\.r2\.dev\/heads\/.+\.png$/);

          if (accessory === 'none') {
            expect(accessoryUrl).toBeNull();
          } else {
            // Accessory URL starts with baseUrl/accessories/ and ends with .png
            expect(accessoryUrl).toMatch(/^https:\/\/test\.r2\.dev\/accessories\/.+\.png$/);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
