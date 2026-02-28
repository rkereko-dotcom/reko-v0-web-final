/**
 * Professional Design System
 * Based on principles from world-class designers:
 * - Dieter Rams, Massimo Vignelli, Josef Müller-Brockmann
 * - Paula Scher, Jessica Walsh, Kenya Hara
 * - Collins, Pentagram, Sagmeister & Walsh
 */

// ============================================
// TYPOGRAPHY SCALES (Mathematical Ratios)
// ============================================

export const TYPE_SCALES = {
  // Minor Second - 1.067 (subtle, conservative)
  minorSecond: [1, 1.067, 1.138, 1.215, 1.296, 1.383],

  // Major Second - 1.125 (gentle progression)
  majorSecond: [1, 1.125, 1.266, 1.424, 1.602, 1.802],

  // Minor Third - 1.2 (balanced, versatile) ★ RECOMMENDED
  minorThird: [1, 1.2, 1.44, 1.728, 2.074, 2.488],

  // Major Third - 1.25 (classic, readable)
  majorThird: [1, 1.25, 1.563, 1.953, 2.441, 3.052],

  // Perfect Fourth - 1.333 (strong hierarchy) ★ BOLD DESIGNS
  perfectFourth: [1, 1.333, 1.777, 2.369, 3.157, 4.209],

  // Golden Ratio - 1.618 (dramatic, expressive) ★ EDITORIAL
  goldenRatio: [1, 1.618, 2.618, 4.236, 6.854, 11.089],
} as const;

// ============================================
// COLOR HARMONY SYSTEMS
// ============================================

export const COLOR_RULES = {
  // 60-30-10 Rule (Dominant-Secondary-Accent)
  distribution: {
    dominant: 60,   // Background, large areas
    secondary: 30,  // Supporting elements
    accent: 10,     // Call-to-action, highlights
  },

  // Contrast Ratios (WCAG Standards)
  contrast: {
    minimum: 4.5,     // AA standard for normal text
    enhanced: 7,      // AAA standard
    largeText: 3,     // Minimum for 18pt+ or 14pt bold
    decorative: 1,    // No requirement
  },

  // Professional Palette Sizes
  paletteSize: {
    minimal: 2,       // Black + one color
    standard: 3,      // Primary, secondary, accent
    extended: 5,      // Full palette
    maximum: 7,       // Never exceed
  },
} as const;

// ============================================
// GRID SYSTEMS
// ============================================

export const GRID_SYSTEMS = {
  // Swiss International Style
  swiss: {
    columns: 12,
    gutter: "8px",
    margin: "5%",
    baseline: "8px",
  },

  // Editorial/Magazine
  editorial: {
    columns: 6,
    gutter: "16px",
    margin: "8%",
    baseline: "12px",
  },

  // Poster/Display
  poster: {
    columns: 4,
    gutter: "24px",
    margin: "10%",
    baseline: "8px",
  },

  // Minimal
  minimal: {
    columns: 3,
    gutter: "32px",
    margin: "15%",
    baseline: "8px",
  },
} as const;

// ============================================
// WHITE SPACE (MA - 間) PRINCIPLES
// ============================================

export const WHITESPACE = {
  // Breathing room multipliers (base = 8px)
  micro: 1,       // 8px - between letters, inline elements
  small: 2,       // 16px - between related items
  medium: 4,      // 32px - between sections
  large: 8,       // 64px - major separations
  macro: 16,      // 128px - dramatic pauses

  // Margin percentages for poster design
  poster: {
    tight: "5%",
    balanced: "10%",
    generous: "15%",
    dramatic: "20%",
  },
} as const;

// ============================================
// DESIGN STYLE DEFINITIONS
// ============================================

export interface DesignStyle {
  name: string;
  nameKo: string;
  characteristics: string[];
  colorApproach: string;
  typographyApproach: string;
  layoutApproach: string;
  whitespaceLevel: "minimal" | "moderate" | "generous" | "dramatic";
  referenceDesigners: {
    name: string;
    technique: string;
    famous_for: string;
  }[];
  doNot: string[];  // Common mistakes to avoid
  mustHave: string[];  // Essential elements
}

export const DESIGN_STYLES: Record<string, DesignStyle> = {
  minimal: {
    name: "Minimal",
    nameKo: "Minimal",
    characteristics: [
      "Maximum white space",
      "Limited color palette (2-3 colors)",
      "Single focal point",
      "Typography as primary element",
      "Intentional emptiness",
      "Every element must earn its place",
    ],
    colorApproach: "Monochromatic or limited palette. Black/white base with single accent. High contrast, no gradients.",
    typographyApproach: "Single font family. Light weights for elegance, bold for impact. Generous letter-spacing for headlines.",
    layoutApproach: "Asymmetric balance. Off-center placement creates tension. Grid-based but not rigid.",
    whitespaceLevel: "dramatic",
    referenceDesigners: [
      { name: "Dieter Rams", technique: "Less but better", famous_for: "Braun products, 10 principles" },
      { name: "Kenya Hara", technique: "Emptiness (空)", famous_for: "MUJI branding, white as active" },
      { name: "John Maeda", technique: "Reduce to essence", famous_for: "Laws of Simplicity" },
    ],
    doNot: [
      "Add decorative elements",
      "Use more than 2 fonts",
      "Fill empty space",
      "Use drop shadows or effects",
      "Center everything",
    ],
    mustHave: [
      "Clear focal point",
      "Intentional white space (40%+ of canvas)",
      "Perfect alignment",
      "Strong typography hierarchy",
    ],
  },

  bold: {
    name: "Bold",
    nameKo: "Bold",
    characteristics: [
      "High contrast and drama",
      "Oversized typography",
      "Strong color statements",
      "Confident, impactful presence",
      "Typography as image",
      "Breaking conventional rules intentionally",
    ],
    colorApproach: "High saturation, complementary or split-complementary. Black as anchor. Vibrant accents.",
    typographyApproach: "Extra bold, condensed. Oversized headlines. Typography becomes the image. Mix scales dramatically.",
    layoutApproach: "Edge-to-edge elements. Overlapping permitted. Dynamic asymmetry. Break the grid intentionally.",
    whitespaceLevel: "minimal",
    referenceDesigners: [
      { name: "Paula Scher", technique: "Typography as landscape", famous_for: "Public Theater, Citibank" },
      { name: "David Carson", technique: "Deconstructivist typography", famous_for: "Ray Gun magazine" },
      { name: "Neville Brody", technique: "Experimental letterforms", famous_for: "The Face magazine" },
    ],
    doNot: [
      "Be timid with scale",
      "Use thin fonts",
      "Create busy complexity",
      "Lose readability for style",
      "Use multiple competing focal points",
    ],
    mustHave: [
      "One dominant element (usually type)",
      "Strong contrast (light/dark, big/small)",
      "Confident color choice",
      "Clear visual hierarchy despite drama",
    ],
  },

  classic: {
    name: "Classic",
    nameKo: "Classic",
    characteristics: [
      "Timeless elegance",
      "Refined typography",
      "Balanced proportions",
      "Traditional craft",
      "Sophisticated restraint",
      "Quality over trend",
    ],
    colorApproach: "Muted, sophisticated. Navy, burgundy, forest green, cream. Gold or copper accents. Low saturation.",
    typographyApproach: "Serif fonts (Garamond, Baskerville, Times). Traditional hierarchy. Proper kerning and tracking.",
    layoutApproach: "Centered or classical symmetry. Golden ratio proportions. Traditional margins.",
    whitespaceLevel: "moderate",
    referenceDesigners: [
      { name: "Massimo Vignelli", technique: "Canonical design", famous_for: "NYC Subway, American Airlines" },
      { name: "Paul Rand", technique: "Simplicity with wit", famous_for: "IBM, ABC, UPS logos" },
      { name: "Herb Lubalin", technique: "Expressive typography", famous_for: "Avant Garde, typographic logos" },
    ],
    doNot: [
      "Follow trends",
      "Use novelty fonts",
      "Over-decorate",
      "Ignore proportions",
      "Mix too many styles",
    ],
    mustHave: [
      "Quality typography",
      "Balanced composition",
      "Timeless color palette",
      "Refined details",
    ],
  },

  modern: {
    name: "Modern",
    nameKo: "Modern",
    characteristics: [
      "Clean and contemporary",
      "Geometric shapes",
      "Sans-serif typography",
      "Fresh color palettes",
      "Digital-native aesthetic",
      "Functional beauty",
    ],
    colorApproach: "Fresh, contemporary palettes. Coral, mint, electric blue. Gradients acceptable. Light backgrounds.",
    typographyApproach: "Geometric sans-serif (Inter, Poppins, DM Sans). Variable weights. Clean hierarchy.",
    layoutApproach: "Grid-based. Component thinking. Cards and containers. Consistent spacing.",
    whitespaceLevel: "generous",
    referenceDesigners: [
      { name: "Jessica Walsh", technique: "Colorful storytelling", famous_for: "Sagmeister & Walsh, &Walsh" },
      { name: "Collins", technique: "Strategic freshness", famous_for: "Spotify, Dropbox, Twitch" },
      { name: "ManvsMachine", technique: "Motion and 3D", famous_for: "Brand films, digital experiences" },
    ],
    doNot: [
      "Use dated effects (bevels, old gradients)",
      "Ignore mobile/digital context",
      "Be generic or template-like",
      "Sacrifice usability for aesthetics",
    ],
    mustHave: [
      "Clean typography",
      "Intentional color palette",
      "Consistent spacing system",
      "Contemporary feeling",
    ],
  },

  swiss: {
    name: "Swiss/International",
    nameKo: "Swiss",
    characteristics: [
      "Mathematical grid systems",
      "Objective, universal design",
      "Helvetica and grotesque fonts",
      "Photographic imagery",
      "Asymmetric but balanced",
      "Function determines form",
    ],
    colorApproach: "Limited, functional. Red/black/white classic. Color as information, not decoration.",
    typographyApproach: "Helvetica, Akzidenz Grotesk, Univers. Flush left, ragged right. Mathematical spacing.",
    layoutApproach: "Strict grid system. Mathematical relationships. Asymmetric balance. Consistent margins.",
    whitespaceLevel: "generous",
    referenceDesigners: [
      { name: "Josef Müller-Brockmann", technique: "Grid systems", famous_for: "Musica Viva posters" },
      { name: "Armin Hofmann", technique: "Contrast and tension", famous_for: "Basel School of Design" },
      { name: "Max Bill", technique: "Concrete art principles", famous_for: "Ulm School, Swiss exhibitions" },
    ],
    doNot: [
      "Use decorative fonts",
      "Break the grid without purpose",
      "Add ornamental elements",
      "Use centered layouts",
      "Mix multiple type families",
    ],
    mustHave: [
      "Visible grid structure",
      "Sans-serif typography",
      "Mathematical proportions",
      "Objective visual language",
    ],
  },

  japanese: {
    name: "Japanese",
    nameKo: "Japanese",
    characteristics: [
      "Ma (間) - meaningful emptiness",
      "Wabi-sabi imperfection",
      "Nature-inspired subtlety",
      "Zen minimalism",
      "Balance of tradition and modernity",
      "Quiet sophistication",
    ],
    colorApproach: "Muted, natural. White (ma), black (sumi), earth tones. Single accent. Inspired by nature.",
    typographyApproach: "Clean sans-serif or traditional. Vertical text optional. Generous spacing. Quiet presence.",
    layoutApproach: "Asymmetric balance. Generous margins (15-20%). Breathing room around elements.",
    whitespaceLevel: "dramatic",
    referenceDesigners: [
      { name: "Kenya Hara", technique: "Exformation (emptiness)", famous_for: "MUJI, Nagano Olympics" },
      { name: "Ikko Tanaka", technique: "Geometric meets cultural", famous_for: "Nihon Buyo, cultural posters" },
      { name: "Kashiwa Sato", technique: "Brand essence", famous_for: "Uniqlo, 7-Eleven Japan" },
    ],
    doNot: [
      "Fill the space",
      "Use aggressive colors",
      "Over-communicate",
      "Add unnecessary elements",
      "Rush the viewer",
    ],
    mustHave: [
      "Meaningful empty space",
      "Subtle color palette",
      "Quiet elegance",
      "Thoughtful composition",
    ],
  },

  editorial: {
    name: "Editorial",
    nameKo: "Editorial",
    characteristics: [
      "Magazine sophistication",
      "Strong typography hierarchy",
      "Image and text interplay",
      "Narrative structure",
      "Elegant grid breaks",
      "High-end aesthetic",
    ],
    colorApproach: "Sophisticated palettes. Black and white base with selective color. Photography-led.",
    typographyApproach: "Serif headlines, sans-serif body. Display fonts for impact. Pull quotes and drop caps.",
    layoutApproach: "Multi-column grids. Bleed images. Varied hierarchy. Dynamic but structured.",
    whitespaceLevel: "moderate",
    referenceDesigners: [
      { name: "Fabien Baron", technique: "Luxurious minimalism", famous_for: "Harper's Bazaar, Interview" },
      { name: "Alexey Brodovitch", technique: "Dynamic spreads", famous_for: "Harper's Bazaar legacy" },
      { name: "Carin Goldberg", technique: "Conceptual covers", famous_for: "Book covers, album art" },
    ],
    doNot: [
      "Ignore reading flow",
      "Make everything the same size",
      "Forget the narrative",
      "Use poor quality images",
    ],
    mustHave: [
      "Clear hierarchy",
      "Quality imagery",
      "Refined typography",
      "Intentional pacing",
    ],
  },

  brutalist: {
    name: "Brutalist",
    nameKo: "Brutalist",
    characteristics: [
      "Raw, unpolished aesthetic",
      "System fonts and defaults",
      "Exposed structure",
      "Anti-design design",
      "Honest materials",
      "Functionality over beauty",
    ],
    colorApproach: "Raw defaults. Black, white, system blue. No decoration. Harsh contrasts.",
    typographyApproach: "System fonts (Arial, Times, Courier). Default sizes. No refinement.",
    layoutApproach: "Exposed grid or no grid. Tables. Raw HTML aesthetic. Borders visible.",
    whitespaceLevel: "minimal",
    referenceDesigners: [
      { name: "David Rudnick", technique: "Digital brutalism", famous_for: "Album art, tech aesthetics" },
      { name: "Experimental Jetset", technique: "Systematic rawness", famous_for: "SM's, Whitney" },
    ],
    doNot: [
      "Polish or refine",
      "Use fancy fonts",
      "Add decorative elements",
      "Hide the structure",
    ],
    mustHave: [
      "Honest, raw materials",
      "Visible structure",
      "Functional focus",
      "Intentional roughness",
    ],
  },
};

// ============================================
// PROFESSIONAL CRITIQUE FRAMEWORK
// ============================================

export const CRITIQUE_FRAMEWORK = {
  // Questions a professional designer asks
  questions: [
    "What is the single most important thing the viewer should see?",
    "Does the hierarchy guide the eye correctly?",
    "Is every element necessary?",
    "Does the white space feel intentional or leftover?",
    "Is the color palette cohesive and purposeful?",
    "Does the typography have clear hierarchy?",
    "Would this work in a professional portfolio?",
    "What would I remove, not add?",
  ],

  // Red flags that indicate amateur design
  redFlags: [
    "Multiple competing focal points",
    "Inconsistent spacing",
    "More than 3 fonts",
    "Weak contrast",
    "Centered everything",
    "Decorative without purpose",
    "Fear of empty space",
    "Random color choices",
    "Poor text readability",
    "Lack of alignment",
  ],

  // What makes a design portfolio-ready
  portfolioReady: [
    "Clear concept and intention",
    "Strong visual hierarchy",
    "Cohesive color palette",
    "Professional typography",
    "Intentional white space",
    "Technical execution quality",
    "Works at multiple sizes",
    "Memorable and distinctive",
  ],
};

// ============================================
// PROMPT GENERATION HELPERS
// ============================================

export function getStylePromptGuidance(style: string): string {
  const styleData = DESIGN_STYLES[style.toLowerCase()];
  if (!styleData) return "";

  const designer = styleData.referenceDesigners[0];

  return `
STYLE: ${styleData.name}
APPROACH: ${styleData.characteristics.slice(0, 3).join(". ")}.
REFERENCE: ${designer.name} - ${designer.technique}

COLOR: ${styleData.colorApproach}
TYPOGRAPHY: ${styleData.typographyApproach}
LAYOUT: ${styleData.layoutApproach}
WHITE SPACE: ${styleData.whitespaceLevel}

MUST HAVE: ${styleData.mustHave.join(", ")}
AVOID: ${styleData.doNot.slice(0, 3).join(", ")}
`;
}

// ============================================
// TEXT RENDERING SPECIFICATIONS
// ============================================

export const TEXT_SPECS = {
  // For when text is rendered separately (not by AI)
  poster: {
    headline: {
      size: "8-15% of poster height",
      weight: "600-800",
      lineHeight: 0.9,
      letterSpacing: "-0.02em to -0.05em",
    },
    subheadline: {
      size: "3-5% of poster height",
      weight: "400-500",
      lineHeight: 1.2,
      letterSpacing: "0 to 0.05em",
    },
    body: {
      size: "1.5-2.5% of poster height",
      weight: "400",
      lineHeight: 1.5,
      letterSpacing: "0 to 0.02em",
    },
  },

  // Safe fonts for rendering
  fonts: {
    sans: ["Inter", "DM Sans", "Poppins", "Helvetica Neue", "Arial"],
    serif: ["Playfair Display", "Libre Baskerville", "Georgia", "Times New Roman"],
    display: ["Bebas Neue", "Oswald", "Anton"],
  },
};
