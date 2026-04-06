import * as fc from 'fast-check';
import {
  generateAvatar,
  keyToFeatures,
  FACE_SHAPES,
  SKIN_COLORS,
  EYE_STYLES,
  MOUTH_STYLES,
  HAIR_STYLES,
  HAIR_COLORS,
  ACCESSORIES,
} from './avatar-generator';

/**
 * Feature: multiplayer-game-hub, Property 2: Avatar completeness
 *
 * **Validates: Requirements 4.1**
 *
 * For any generated avatar, it SHALL contain all required facial feature layers:
 * face shape, skin color, eyes, mouth, hair (style and color), and accessories.
 * Each feature value SHALL be within its valid set of options.
 */
describe('Property 2: Avatar completeness', () => {
  it('every generated avatar contains all required layers with values within valid sets', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          const usedCombinations = new Set<string>();
          const result = generateAvatar(usedCombinations);

          // Parse the combination key back to features
          const features = keyToFeatures(result.combinationKey);

          // Verify each feature index is within the valid range for its layer
          expect(features.faceShape).toBeGreaterThanOrEqual(0);
          expect(features.faceShape).toBeLessThan(FACE_SHAPES.length);

          expect(features.skinColor).toBeGreaterThanOrEqual(0);
          expect(features.skinColor).toBeLessThan(SKIN_COLORS.length);

          expect(features.eyes).toBeGreaterThanOrEqual(0);
          expect(features.eyes).toBeLessThan(EYE_STYLES.length);

          expect(features.mouth).toBeGreaterThanOrEqual(0);
          expect(features.mouth).toBeLessThan(MOUTH_STYLES.length);

          expect(features.hairStyle).toBeGreaterThanOrEqual(0);
          expect(features.hairStyle).toBeLessThan(HAIR_STYLES.length);

          expect(features.hairColor).toBeGreaterThanOrEqual(0);
          expect(features.hairColor).toBeLessThan(HAIR_COLORS.length);

          expect(features.accessory).toBeGreaterThanOrEqual(0);
          expect(features.accessory).toBeLessThan(ACCESSORIES.length);

          // Verify the SVG data URI is well-formed and contains expected SVG elements
          expect(result.dataUri).toMatch(/^data:image\/svg\+xml;base64,/);

          const base64 = result.dataUri.replace('data:image/svg+xml;base64,', '');
          const svg = Buffer.from(base64, 'base64').toString('utf-8');

          // Must be a valid SVG with proper structure
          expect(svg).toContain('<svg');
          expect(svg).toContain('</svg>');
          expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');

          // Face shape layer (ellipse for the face)
          expect(svg).toContain('<ellipse cx="50" cy="52"');

          // Skin color layer (face fill uses a skin color)
          const skinColor = SKIN_COLORS[features.skinColor];
          expect(svg).toContain(`fill="${skinColor}"`);

          // Eyes layer (rendered at cx=35 and cx=65)
          expect(svg).toMatch(/cx="35" cy="45"/);
          expect(svg).toMatch(/cx="65" cy="45"/);

          // Mouth layer (rendered around cy=65)
          // Mouth is either a path (smile), ellipse (open), or line
          const mouthStyle = MOUTH_STYLES[features.mouth];
          if (mouthStyle.type === 'smile') {
            expect(svg).toContain('<path d="M');
          } else if (mouthStyle.type === 'open') {
            expect(svg).toMatch(/<ellipse cx="50" cy="65"/);
          } else {
            expect(svg).toContain('<line');
          }

          // Hair layer (path element with hair color)
          const hairColor = HAIR_COLORS[features.hairColor];
          expect(svg).toContain(`fill="${hairColor}"`);
          expect(svg).toContain(`<path d="`);
        }
      ),
      { numRuns: 20 }
    );
  });
});

/**
 * Feature: multiplayer-game-hub, Property 3: Avatar uniqueness
 *
 * **Validates: Requirements 4.2**
 *
 * For any lobby with N players (N ≤ 20), all N generated avatars SHALL have
 * distinct feature combinations (no two players share the same tuple of face
 * shape, skin color, eyes, mouth, hair style, hair color, and accessory).
 */
describe('Property 3: Avatar uniqueness within a lobby', () => {
  it('all N avatars in a lobby have distinct combination keys', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        (n: number) => {
          const usedCombinations = new Set<string>();
          const keys: string[] = [];

          for (let i = 0; i < n; i++) {
            const result = generateAvatar(usedCombinations);
            keys.push(result.combinationKey);
          }

          // All combination keys must be distinct
          const uniqueKeys = new Set(keys);
          expect(uniqueKeys.size).toBe(n);

          // The shared usedCombinations set must have exactly N entries
          expect(usedCombinations.size).toBe(n);
        }
      ),
      { numRuns: 20 }
    );
  });
});
