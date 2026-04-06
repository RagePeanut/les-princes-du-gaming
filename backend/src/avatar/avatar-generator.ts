// Avatar Generator Module
// Composes randomized cartoon-face avatars from feature layers
// Ensures visual distinctness within a lobby by tracking used combinations

export interface AvatarFeatures {
  faceShape: number;
  skinColor: number;
  eyes: number;
  mouth: number;
  hairStyle: number;
  hairColor: number;
  accessory: number;
}

export interface AvatarResult {
  dataUri: string;
  combinationKey: string;
}

// Feature layer option sets
export const FACE_SHAPES = [
  { rx: 45, ry: 50 },   // oval
  { rx: 48, ry: 48 },   // round
  { rx: 42, ry: 52 },   // tall oval
  { rx: 50, ry: 45 },   // wide
  { rx: 44, ry: 48 },   // slightly narrow
  { rx: 46, ry: 46 },   // balanced
] as const;

export const SKIN_COLORS = [
  '#FFDBB4', '#EDB98A', '#D08B5B', '#AE5D29',
  '#614335', '#F5D6C3', '#C68642', '#8D5524',
] as const;

export const EYE_STYLES = [
  { type: 'circle', r: 4 },
  { type: 'circle', r: 5 },
  { type: 'circle', r: 3 },
  { type: 'ellipse', rx: 5, ry: 4 },
  { type: 'ellipse', rx: 4, ry: 5 },
  { type: 'ellipse', rx: 6, ry: 3 },
  { type: 'circle', r: 6 },
  { type: 'ellipse', rx: 3, ry: 6 },
  { type: 'circle', r: 4.5 },
  { type: 'ellipse', rx: 5, ry: 5 },
] as const;

export const MOUTH_STYLES = [
  { type: 'smile', width: 20 },
  { type: 'smile', width: 16 },
  { type: 'smile', width: 24 },
  { type: 'open', width: 14, height: 8 },
  { type: 'open', width: 10, height: 6 },
  { type: 'line', width: 18 },
  { type: 'line', width: 12 },
  { type: 'open', width: 18, height: 10 },
] as const;

export const HAIR_STYLES = [
  { type: 'short', path: 'M15,30 Q50,5 85,30' },
  { type: 'long', path: 'M10,35 Q50,0 90,35 L90,70 Q50,60 10,70 Z' },
  { type: 'spiky', path: 'M20,35 L30,10 L40,30 L50,5 L60,30 L70,10 L80,35' },
  { type: 'curly', path: 'M15,35 Q25,10 35,30 Q45,10 55,30 Q65,10 75,30 Q85,10 85,35' },
  { type: 'mohawk', path: 'M40,35 Q50,-5 60,35' },
  { type: 'bob', path: 'M15,30 Q50,10 85,30 L85,55 Q50,45 15,55 Z' },
  { type: 'ponytail', path: 'M15,30 Q50,5 85,30 L95,60 Q90,70 85,60' },
  { type: 'buzz', path: 'M20,32 Q50,15 80,32' },
  { type: 'wavy', path: 'M15,35 Q30,15 45,30 Q60,15 75,30 Q85,20 85,35' },
  { type: 'bangs', path: 'M15,30 Q50,5 85,30 L85,40 L15,40 Z' },
  { type: 'side', path: 'M15,30 Q50,10 85,30 L10,55 Q5,45 15,30' },
  { type: 'afro', path: 'M5,50 Q5,0 50,-5 Q95,0 95,50 Q95,35 85,30 Q50,10 15,30 Q5,35 5,50' },
] as const;

export const HAIR_COLORS = [
  '#2C1B18', '#4A3728', '#8B6914', '#D4A017',
  '#C04000', '#1C1C1C', '#8B4513', '#A0522D',
] as const;

export const ACCESSORIES = [
  'none',
  'glasses',
  'sunglasses',
  'hat',
  'headband',
  'earrings',
] as const;

// Total combinations: 6 × 8 × 10 × 8 × 12 × 8 × 6 = 2,211,840

const MAX_REROLL_ATTEMPTS = 1000;

function randomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

function pickRandomFeatures(): AvatarFeatures {
  return {
    faceShape: randomInt(FACE_SHAPES.length),
    skinColor: randomInt(SKIN_COLORS.length),
    eyes: randomInt(EYE_STYLES.length),
    mouth: randomInt(MOUTH_STYLES.length),
    hairStyle: randomInt(HAIR_STYLES.length),
    hairColor: randomInt(HAIR_COLORS.length),
    accessory: randomInt(ACCESSORIES.length),
  };
}

export function featuresToKey(features: AvatarFeatures): string {
  return `${features.faceShape}-${features.skinColor}-${features.eyes}-${features.mouth}-${features.hairStyle}-${features.hairColor}-${features.accessory}`;
}

function renderEyes(style: typeof EYE_STYLES[number]): string {
  if (style.type === 'circle') {
    return `<circle cx="35" cy="45" r="${style.r}" fill="#333"/>` +
           `<circle cx="65" cy="45" r="${style.r}" fill="#333"/>` +
           `<circle cx="${35 + style.r * 0.3}" cy="${45 - style.r * 0.3}" r="${style.r * 0.3}" fill="#fff"/>` +
           `<circle cx="${65 + style.r * 0.3}" cy="${45 - style.r * 0.3}" r="${style.r * 0.3}" fill="#fff"/>`;
  }
  // ellipse type
  const ex = 'rx' in style ? style.rx : 4;
  const ey = 'ry' in style ? style.ry : 4;
  return `<ellipse cx="35" cy="45" rx="${ex}" ry="${ey}" fill="#333"/>` +
         `<ellipse cx="65" cy="45" rx="${ex}" ry="${ey}" fill="#333"/>` +
         `<circle cx="${35 + ex * 0.3}" cy="${45 - ey * 0.3}" r="${Math.min(ex, ey) * 0.3}" fill="#fff"/>` +
         `<circle cx="${65 + ex * 0.3}" cy="${45 - ey * 0.3}" r="${Math.min(ex, ey) * 0.3}" fill="#fff"/>`;
}

function renderMouth(style: typeof MOUTH_STYLES[number]): string {
  const cx = 50;
  const cy = 65;
  if (style.type === 'smile') {
    const hw = style.width / 2;
    return `<path d="M${cx - hw},${cy} Q${cx},${cy + 10} ${cx + hw},${cy}" stroke="#333" stroke-width="2" fill="none"/>`;
  }
  if (style.type === 'open') {
    const hw = style.width / 2;
    const hh = ('height' in style ? style.height : 8) / 2;
    return `<ellipse cx="${cx}" cy="${cy}" rx="${hw}" ry="${hh}" fill="#333"/>`;
  }
  // line type
  const hw = style.width / 2;
  return `<line x1="${cx - hw}" y1="${cy}" x2="${cx + hw}" y2="${cy}" stroke="#333" stroke-width="2" stroke-linecap="round"/>`;
}

function renderAccessory(accessory: typeof ACCESSORIES[number]): string {
  switch (accessory) {
    case 'glasses':
      return `<circle cx="35" cy="45" r="9" fill="none" stroke="#555" stroke-width="1.5"/>` +
             `<circle cx="65" cy="45" r="9" fill="none" stroke="#555" stroke-width="1.5"/>` +
             `<line x1="44" y1="45" x2="56" y2="45" stroke="#555" stroke-width="1.5"/>`;
    case 'sunglasses':
      return `<rect x="26" y="38" width="18" height="12" rx="3" fill="#333" opacity="0.8"/>` +
             `<rect x="56" y="38" width="18" height="12" rx="3" fill="#333" opacity="0.8"/>` +
             `<line x1="44" y1="44" x2="56" y2="44" stroke="#333" stroke-width="1.5"/>`;
    case 'hat':
      return `<rect x="20" y="15" width="60" height="8" rx="2" fill="#555"/>` +
             `<rect x="30" y="5" width="40" height="15" rx="5" fill="#555"/>`;
    case 'headband':
      return `<rect x="12" y="28" width="76" height="4" rx="2" fill="#E74C3C"/>`;
    case 'earrings':
      return `<circle cx="10" cy="55" r="3" fill="#FFD700"/>` +
             `<circle cx="90" cy="55" r="3" fill="#FFD700"/>`;
    case 'none':
    default:
      return '';
  }
}

function composeSvg(features: AvatarFeatures): string {
  const face = FACE_SHAPES[features.faceShape];
  const skin = SKIN_COLORS[features.skinColor];
  const eyeStyle = EYE_STYLES[features.eyes];
  const mouthStyle = MOUTH_STYLES[features.mouth];
  const hair = HAIR_STYLES[features.hairStyle];
  const hairColor = HAIR_COLORS[features.hairColor];
  const accessory = ACCESSORIES[features.accessory];

  const svgParts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">`,
    // Background circle
    `<circle cx="50" cy="55" r="48" fill="#E8E8E8"/>`,
    // Face
    `<ellipse cx="50" cy="52" rx="${face.rx}" ry="${face.ry}" fill="${skin}"/>`,
    // Hair (behind face for some styles, but rendered on top for simplicity)
    `<path d="${hair.path}" fill="${hairColor}" opacity="0.9"/>`,
    // Eyes
    renderEyes(eyeStyle),
    // Mouth
    renderMouth(mouthStyle),
    // Accessory
    renderAccessory(accessory),
    `</svg>`,
  ];

  return svgParts.join('');
}

function svgToDataUri(svg: string): string {
  const encoded = Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${encoded}`;
}

/**
 * Generates a unique avatar that doesn't collide with any existing combinations.
 * Rerolls on collision up to MAX_REROLL_ATTEMPTS times.
 *
 * @param usedCombinations - Set of combination keys already in use (per lobby)
 * @returns AvatarResult with the SVG data URI and the combination key
 */
export function generateAvatar(usedCombinations: Set<string>): AvatarResult {
  let features: AvatarFeatures;
  let key: string;
  let attempts = 0;

  do {
    if (attempts >= MAX_REROLL_ATTEMPTS) {
      throw new Error('Unable to generate unique avatar after maximum reroll attempts');
    }
    features = pickRandomFeatures();
    key = featuresToKey(features);
    attempts++;
  } while (usedCombinations.has(key));

  usedCombinations.add(key);

  const svg = composeSvg(features);
  const dataUri = svgToDataUri(svg);

  return { dataUri, combinationKey: key };
}

/**
 * Parses a combination key back into AvatarFeatures.
 * Useful for testing and validation.
 */
export function keyToFeatures(key: string): AvatarFeatures {
  const parts = key.split('-').map(Number);
  return {
    faceShape: parts[0],
    skinColor: parts[1],
    eyes: parts[2],
    mouth: parts[3],
    hairStyle: parts[4],
    hairColor: parts[5],
    accessory: parts[6],
  };
}
