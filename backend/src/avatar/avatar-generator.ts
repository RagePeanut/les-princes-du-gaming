// Avatar Generator Module
// Selects a unique head+accessory combination from Cloudflare R2-hosted PNG assets
// Ensures visual distinctness within a lobby by tracking used combinations

export const HEADS: string[] = [
  'Alberto', 'Antoine', 'Charles', 'Cyprien', 'Dami le boss',
  'Damien', 'Dorian', 'Doriprogra', 'Grotoine', 'Jonathan Normal',
  'Jonathan', 'Michel', 'Miel', 'Ragnarok réel', 'Ragnarok',
];

export const ACCESSORIES: string[] = ['Collar', 'Fool', 'Hood'];

export const ACCESSORY_OPTIONS: string[] = [...ACCESSORIES, 'none'];

export interface AvatarResult {
  headUrl: string;
  accessoryUrl: string | null;
  combinationKey: string;
}

const MAX_REROLL_ATTEMPTS = 1000;

function getBaseUrl(): string {
  const baseUrl = process.env.CLOUDFLARE_AVATAR_BASE_URL;
  if (!baseUrl) {
    throw new Error('CLOUDFLARE_AVATAR_BASE_URL environment variable is required');
  }
  return baseUrl;
}

export function buildHeadUrl(headName: string): string {
  const baseUrl = getBaseUrl();
  return `${baseUrl}/heads/${encodeURIComponent(headName)}.png`;
}

export function buildAccessoryUrl(accessoryName: string): string | null {
  if (accessoryName === 'none') {
    return null;
  }
  const baseUrl = getBaseUrl();
  return `${baseUrl}/accessories/${encodeURIComponent(accessoryName)}.png`;
}

export function buildCombinationKey(head: string, accessory: string): string {
  return `${head}|${accessory}`;
}

/**
 * Generates a unique avatar that doesn't collide with any existing combinations.
 * Rerolls on collision up to MAX_REROLL_ATTEMPTS times.
 *
 * @param usedCombinations - Set of combination keys already in use (per lobby)
 * @returns AvatarResult with head URL, accessory URL, and combination key
 */
export function generateAvatar(usedCombinations: Set<string>): AvatarResult {
  let attempts = 0;

  while (attempts < MAX_REROLL_ATTEMPTS) {
    const head = HEADS[Math.floor(Math.random() * HEADS.length)];
    const accessory = ACCESSORY_OPTIONS[Math.floor(Math.random() * ACCESSORY_OPTIONS.length)];
    const key = buildCombinationKey(head, accessory);

    if (!usedCombinations.has(key)) {
      usedCombinations.add(key);
      return {
        headUrl: buildHeadUrl(head),
        accessoryUrl: buildAccessoryUrl(accessory),
        combinationKey: key,
      };
    }

    attempts++;
  }

  throw new Error('Unable to generate unique avatar after maximum reroll attempts');
}
