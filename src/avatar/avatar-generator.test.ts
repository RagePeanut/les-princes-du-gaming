import {
  generateAvatar,
  featuresToKey,
  keyToFeatures,
  FACE_SHAPES,
  SKIN_COLORS,
  EYE_STYLES,
  MOUTH_STYLES,
  HAIR_STYLES,
  HAIR_COLORS,
  ACCESSORIES,
  AvatarFeatures,
} from './avatar-generator';

describe('AvatarGenerator', () => {
  describe('generateAvatar', () => {
    it('should return an AvatarResult with dataUri and combinationKey', () => {
      const used = new Set<string>();
      const result = generateAvatar(used);

      expect(result).toHaveProperty('dataUri');
      expect(result).toHaveProperty('combinationKey');
      expect(result.dataUri).toMatch(/^data:image\/svg\+xml;base64,/);
      expect(result.combinationKey).toMatch(/^\d+-\d+-\d+-\d+-\d+-\d+-\d+$/);
    });

    it('should add the combination key to the usedCombinations set', () => {
      const used = new Set<string>();
      const result = generateAvatar(used);

      expect(used.has(result.combinationKey)).toBe(true);
      expect(used.size).toBe(1);
    });

    it('should generate unique avatars when called multiple times', () => {
      const used = new Set<string>();
      const results = [];

      for (let i = 0; i < 10; i++) {
        results.push(generateAvatar(used));
      }

      expect(used.size).toBe(10);
      const keys = results.map(r => r.combinationKey);
      expect(new Set(keys).size).toBe(10);
    });

    it('should produce valid SVG content in the data URI', () => {
      const used = new Set<string>();
      const result = generateAvatar(used);

      const base64 = result.dataUri.replace('data:image/svg+xml;base64,', '');
      const svg = Buffer.from(base64, 'base64').toString('utf-8');

      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
      expect(svg).toContain('viewBox');
    });
  });

  describe('featuresToKey / keyToFeatures', () => {
    it('should round-trip features through key conversion', () => {
      const features: AvatarFeatures = {
        faceShape: 2,
        skinColor: 3,
        eyes: 5,
        mouth: 1,
        hairStyle: 7,
        hairColor: 4,
        accessory: 2,
      };

      const key = featuresToKey(features);
      expect(key).toBe('2-3-5-1-7-4-2');

      const parsed = keyToFeatures(key);
      expect(parsed).toEqual(features);
    });
  });

  describe('feature layer option sets', () => {
    it('should have correct number of options per layer', () => {
      expect(FACE_SHAPES.length).toBe(6);
      expect(SKIN_COLORS.length).toBe(8);
      expect(EYE_STYLES.length).toBe(10);
      expect(MOUTH_STYLES.length).toBe(8);
      expect(HAIR_STYLES.length).toBe(12);
      expect(HAIR_COLORS.length).toBe(8);
      expect(ACCESSORIES.length).toBe(6);
    });

    it('should have total combinations of ~2.2 million', () => {
      const total =
        FACE_SHAPES.length *
        SKIN_COLORS.length *
        EYE_STYLES.length *
        MOUTH_STYLES.length *
        HAIR_STYLES.length *
        HAIR_COLORS.length *
        ACCESSORIES.length;

      expect(total).toBe(2211840);
    });
  });

  describe('SVG content', () => {
    it('should contain face, eyes, and mouth elements', () => {
      const used = new Set<string>();
      const result = generateAvatar(used);

      const base64 = result.dataUri.replace('data:image/svg+xml;base64,', '');
      const svg = Buffer.from(base64, 'base64').toString('utf-8');

      // Face ellipse
      expect(svg).toContain('<ellipse cx="50" cy="52"');
      // Eyes (either circle or ellipse at cx=35 and cx=65)
      expect(svg).toMatch(/cx="35" cy="45"/);
      expect(svg).toMatch(/cx="65" cy="45"/);
    });
  });
});
