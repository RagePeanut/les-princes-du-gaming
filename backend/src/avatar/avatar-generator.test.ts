import {
  generateAvatar,
  buildHeadUrl,
  buildAccessoryUrl,
  buildCombinationKey,
  HEADS,
  ACCESSORIES,
  ACCESSORY_OPTIONS,
  AvatarResult,
} from './avatar-generator';

const TEST_BASE_URL = 'https://pub-test.r2.dev';

beforeAll(() => {
  process.env.CLOUDFLARE_AVATAR_BASE_URL = TEST_BASE_URL;
});

describe('AvatarGenerator', () => {
  describe('asset registry', () => {
    it('should have exactly 15 heads', () => {
      expect(HEADS).toHaveLength(15);
    });

    it('should have exactly 3 accessories', () => {
      expect(ACCESSORIES).toHaveLength(3);
    });

    it('should have exactly 4 accessory options (3 accessories + none)', () => {
      expect(ACCESSORY_OPTIONS).toHaveLength(4);
      expect(ACCESSORY_OPTIONS).toContain('none');
      for (const acc of ACCESSORIES) {
        expect(ACCESSORY_OPTIONS).toContain(acc);
      }
    });
  });

  describe('buildHeadUrl', () => {
    it('should produce a correct URL for a simple head name', () => {
      expect(buildHeadUrl('Antoine')).toBe(`${TEST_BASE_URL}/heads/Antoine.png`);
    });

    it('should URL-encode head names with spaces', () => {
      expect(buildHeadUrl('Dami le boss')).toBe(
        `${TEST_BASE_URL}/heads/Dami%20le%20boss.png`,
      );
    });

    it('should URL-encode head names with special characters', () => {
      expect(buildHeadUrl('Ragnarok réel')).toBe(
        `${TEST_BASE_URL}/heads/Ragnarok%20r%C3%A9el.png`,
      );
    });
  });

  describe('buildAccessoryUrl', () => {
    it('should produce a correct URL for a named accessory', () => {
      expect(buildAccessoryUrl('Hood')).toBe(`${TEST_BASE_URL}/accessories/Hood.png`);
    });

    it('should return null for "none"', () => {
      expect(buildAccessoryUrl('none')).toBeNull();
    });
  });

  describe('buildCombinationKey', () => {
    it('should produce "{head}|{accessory}" format', () => {
      expect(buildCombinationKey('Antoine', 'Hood')).toBe('Antoine|Hood');
      expect(buildCombinationKey('Michel', 'none')).toBe('Michel|none');
    });
  });

  describe('generateAvatar', () => {
    it('should return a valid AvatarResult with headUrl, accessoryUrl, and combinationKey', () => {
      const used = new Set<string>();
      const result = generateAvatar(used);

      expect(result).toHaveProperty('headUrl');
      expect(result).toHaveProperty('accessoryUrl');
      expect(result).toHaveProperty('combinationKey');
      expect(result.headUrl).toContain(`${TEST_BASE_URL}/heads/`);
      expect(result.headUrl).toMatch(/\.png$/);
      expect(result.combinationKey).toMatch(/^.+\|.+$/);
    });

    it('should add the combination key to the usedCombinations set', () => {
      const used = new Set<string>();
      const result = generateAvatar(used);

      expect(used.has(result.combinationKey)).toBe(true);
      expect(used.size).toBe(1);
    });

    it('should generate unique avatars across multiple calls', () => {
      const used = new Set<string>();
      const results: AvatarResult[] = [];

      for (let i = 0; i < 10; i++) {
        results.push(generateAvatar(used));
      }

      expect(used.size).toBe(10);
      const keys = results.map((r) => r.combinationKey);
      expect(new Set(keys).size).toBe(10);
    });

    it('should use valid head and accessory values in the combination key', () => {
      const used = new Set<string>();
      const result = generateAvatar(used);
      const [head, accessory] = result.combinationKey.split('|');

      expect(HEADS).toContain(head);
      expect(ACCESSORY_OPTIONS).toContain(accessory);
    });

    it('should set accessoryUrl to null when accessory is "none"', () => {
      const used = new Set<string>();
      // Generate enough avatars to likely get a "none" accessory
      let foundNone = false;
      for (let i = 0; i < 60; i++) {
        const result = generateAvatar(used);
        if (result.accessoryUrl === null) {
          expect(result.combinationKey).toMatch(/\|none$/);
          foundNone = true;
          break;
        }
      }
      // With 15 heads × 1 "none" option, we should find at least one
      expect(foundNone).toBe(true);
    });

    it('should throw an error when all 60 combinations are exhausted', () => {
      const used = new Set<string>();
      // Fill all 60 combinations
      for (const head of HEADS) {
        for (const accessory of ACCESSORY_OPTIONS) {
          used.add(buildCombinationKey(head, accessory));
        }
      }
      expect(used.size).toBe(60);

      expect(() => generateAvatar(used)).toThrow(
        'Unable to generate unique avatar after maximum reroll attempts',
      );
    });
  });

  describe('missing CLOUDFLARE_AVATAR_BASE_URL', () => {
    const originalEnv = process.env.CLOUDFLARE_AVATAR_BASE_URL;

    afterEach(() => {
      process.env.CLOUDFLARE_AVATAR_BASE_URL = originalEnv;
    });

    it('should throw when CLOUDFLARE_AVATAR_BASE_URL is not set', () => {
      delete process.env.CLOUDFLARE_AVATAR_BASE_URL;

      expect(() => buildHeadUrl('Antoine')).toThrow(
        'CLOUDFLARE_AVATAR_BASE_URL environment variable is required',
      );
    });

    it('should throw from buildAccessoryUrl when CLOUDFLARE_AVATAR_BASE_URL is not set', () => {
      delete process.env.CLOUDFLARE_AVATAR_BASE_URL;

      expect(() => buildAccessoryUrl('Hood')).toThrow(
        'CLOUDFLARE_AVATAR_BASE_URL environment variable is required',
      );
    });

    it('should throw from generateAvatar when CLOUDFLARE_AVATAR_BASE_URL is not set', () => {
      delete process.env.CLOUDFLARE_AVATAR_BASE_URL;

      expect(() => generateAvatar(new Set())).toThrow(
        'CLOUDFLARE_AVATAR_BASE_URL environment variable is required',
      );
    });
  });
});
