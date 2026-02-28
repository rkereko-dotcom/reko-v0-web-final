/**
 * MASTER DESIGNER DATABASE
 *
 * A curated knowledge base of world-class designers' philosophy, methods, and sensibilities.
 * Studied and systematized for fast reference.
 *
 * Sources:
 * - Pentagram, Collins, &Walsh agencies
 * - Design Museum, It's Nice That, AIGA
 * - Designer interviews and monographs
 */

// ============================================
// MASTER DESIGNER PROFILES
// ============================================

export interface DesignerProfile {
  name: string;
  nationality: string;
  agency: string;
  era: string;
  philosophy: {
    core: string;
    quotes: string[];
    methodology: string[];
  };
  visualSignature: {
    typography: string;
    color: string;
    composition: string;
    whitespace: string;
  };
  strengths: string[];
  bestFor: string[];  // What types of projects this style excels at
  avoidFor: string[]; // What types of projects to avoid
  promptKeywords: string[]; // Keywords that invoke this style in AI
}

export const MASTER_DESIGNERS: Record<string, DesignerProfile> = {

  // ============================================
  // PAULA SCHER - Bold Typography Master
  // ============================================
  "paula_scher": {
    name: "Paula Scher",
    nationality: "American",
    agency: "Pentagram (Partner since 1991)",
    era: "Contemporary",
    philosophy: {
      core: "Typography is a language. Design is a state of play. Ideas happen in an instant.",
      quotes: [
        "You have to be in a state of play to design. If you're not in a state of play, you can't make anything.",
        "The work that I do is best when the ideas are instinctive and fast.",
        "Theoretically, you should be able to recognize something without even seeing the logo.",
        "I'm not trying to be visually funny, I'm trying to communicate.",
      ],
      methodology: [
        "Research extensively before designing - know the client deeply",
        "Sketch in a state of play, trying anything that comes to mind",
        "First ideas are often best - trust instinct",
        "Design for long-term recognition and consistent use",
        "Typography as image - letters become the visual",
      ],
    },
    visualSignature: {
      typography: "Oversized, bold, condensed. Typography AS the image. Mixed scales for drama. Expressive letterforms.",
      color: "High contrast. Bold primaries. Black as anchor. Vibrant, confident palettes.",
      composition: "Edge-to-edge boldness. Typography fills frame. Dynamic asymmetry. Fearless scale.",
      whitespace: "Minimal but intentional. Space exists to amplify the bold elements.",
    },
    strengths: [
      "Cultural institutions and theaters",
      "Bold brand identities",
      "Environmental graphics at scale",
      "Making complex information accessible",
    ],
    bestFor: ["Event posters", "Cultural branding", "Bold statements", "Public spaces"],
    avoidFor: ["Subtle luxury", "Quiet elegance", "Minimal designs"],
    promptKeywords: [
      "bold typography", "oversized letters", "Paula Scher style",
      "typography as image", "fearless scale", "dramatic contrast",
      "Pentagram bold", "Public Theater style", "expressive type"
    ],
  },

  // ============================================
  // KENYA HARA - Emptiness & White Master
  // ============================================
  "kenya_hara": {
    name: "Kenya Hara",
    nationality: "Japanese",
    agency: "Nippon Design Center / MUJI Art Director (since 2001)",
    era: "Contemporary",
    philosophy: {
      core: "Emptiness is not nothingness - it's a creative receptacle ready to receive. White symbolizes the potential for infinite possibility.",
      quotes: [
        "Emptiness doesn't mean nothingness - it indicates a condition which will likely be filled with content in the future.",
        "Empty space sparks imagination in people - they have a conversation with themselves within the empty space.",
        "The Japanese character for white forms a radical of the character for emptiness.",
        "Emptiness is the pursuit of ultimate freedom.",
        "When an object is empty, it is ready to receive any image or use.",
      ],
      methodology: [
        "Design by subtraction, not addition",
        "Create space for the viewer's imagination",
        "White as an active presence, not absence",
        "Simplicity that invites participation",
        "Products should be user-friendly enough for anyone to understand",
      ],
    },
    visualSignature: {
      typography: "Quiet, restrained. Light weights. Generous letter-spacing. Text as a gentle presence.",
      color: "White-dominant. Muted earth tones. Single subtle accent. Natural palette inspired by nature.",
      composition: "Asymmetric balance. Generous margins (15-20%). Subject as focal point within vast space.",
      whitespace: "Dramatic - 50%+ of canvas. Emptiness IS the design. Ma (間) principle.",
    },
    strengths: [
      "Creating quiet luxury",
      "Products that invite imagination",
      "Timeless, non-trendy design",
      "Expressing essence through absence",
    ],
    bestFor: ["Minimal posters", "Luxury branding", "Zen aesthetic", "Product with soul"],
    avoidFor: ["Bold statements", "High energy", "Youth marketing", "Busy retail"],
    promptKeywords: [
      "Kenya Hara style", "MUJI aesthetic", "Japanese minimalism",
      "emptiness", "Ma concept", "white space dominant",
      "zen design", "quiet elegance", "meaningful emptiness"
    ],
  },

  // ============================================
  // JESSICA WALSH - Colorful Narrative Master
  // ============================================
  "jessica_walsh": {
    name: "Jessica Walsh",
    nationality: "American",
    agency: "&Walsh (Founder, 2019)",
    era: "Contemporary",
    philosophy: {
      core: "Every brand has something weird or different about them - that's their most valuable asset. Find the weird, celebrate it.",
      quotes: [
        "We believe every brand has something weird about them, and that's their most valuable asset.",
        "Creativity is not innate talent - it's a journey of passion, curiosity, and persistent effort.",
        "Play is a mindset where you experience a state of flow.",
        "Constraints become opportunities to forge a memorable style.",
        "The heart of creativity is discovery through experimentation.",
      ],
      methodology: [
        "Brand therapy - uncover what makes each brand unique",
        "No house style - each project reflects the brand's personality",
        "Embrace constraints as creative fuel",
        "Keep a sense of humor to make unique connections",
        "Emotionally engaging, concept-driven work",
      ],
    },
    visualSignature: {
      typography: "Playful, contemporary. Mixed weights and styles. Custom lettering. Personality-driven choices.",
      color: "Vibrant, saturated. Unexpected combinations. Warm corals, electric blues. Bold but harmonious.",
      composition: "Narrative-driven. Layered. Playful arrangements. Text and image interplay.",
      whitespace: "Moderate - enough to breathe but filled with visual interest.",
    },
    strengths: [
      "Brands with personality and story",
      "Making serious topics approachable",
      "Contemporary, fresh identities",
      "Emotionally resonant design",
    ],
    bestFor: ["Playful brands", "Modern identity", "Social campaigns", "Youth-focused"],
    avoidFor: ["Traditional corporate", "Somber topics", "Ultra-minimal"],
    promptKeywords: [
      "Jessica Walsh style", "&Walsh aesthetic", "colorful narrative",
      "playful design", "brand personality", "contemporary fresh",
      "emotional design", "creative storytelling"
    ],
  },

  // ============================================
  // MASSIMO VIGNELLI - Canonical Modernist
  // ============================================
  "massimo_vignelli": {
    name: "Massimo Vignelli",
    nationality: "Italian-American",
    agency: "Vignelli Associates",
    era: "Modernist (1931-2014)",
    philosophy: {
      core: "If you can design one thing, you can design everything. Timeless over trendy. Intellectual elegance.",
      quotes: [
        "Trends kill the soul of design.",
        "We are systematic, logical and objective, not trendy.",
        "Modernism took out all the junk, and postmodernism put it all back in.",
        "The grid is a useful tool, rather than a constricting device.",
        "You'll need just 3 colors to create a masterpiece—black, white and red.",
      ],
      methodology: [
        "Semantics, Syntactics, Pragmatics - the design trinity",
        "Only use 4-6 typefaces in entire career (Helvetica preferred)",
        "Grid as structural guide, know when to break it",
        "Gradations of scale for hierarchy, not bold/italic",
        "Color used sparingly and with purpose",
      ],
    },
    visualSignature: {
      typography: "Helvetica dominant. Single typeface per project. Scale creates hierarchy. Severe, disciplined.",
      color: "Black, white, red as foundation. Restrained palette. Color as information, not decoration.",
      composition: "Grid-based. Asymmetric balance. Mathematical proportions. Consistent modules.",
      whitespace: "Functional. Creates structure and rhythm. Part of the grid system.",
    },
    strengths: [
      "Systems thinking and consistency",
      "Wayfinding and information design",
      "Timeless corporate identities",
      "Complex information made clear",
    ],
    bestFor: ["Corporate identity", "Wayfinding", "Publication design", "Systems"],
    avoidFor: ["Playful brands", "Trendy aesthetics", "Emotional expression"],
    promptKeywords: [
      "Massimo Vignelli style", "canonical design", "Helvetica",
      "grid system", "timeless modernist", "intellectual elegance",
      "systematic design", "NYC subway style"
    ],
  },

  // ============================================
  // DIETER RAMS - Less But Better
  // ============================================
  "dieter_rams": {
    name: "Dieter Rams",
    nationality: "German",
    agency: "Braun (Head of Design 1961-1995)",
    era: "Modernist Industrial",
    philosophy: {
      core: "Less, but better (Weniger, aber besser). Good design is as little design as possible.",
      quotes: [
        "Less, but better - because it concentrates on the essential aspects.",
        "Good design is innovative.",
        "Good design makes a product understandable.",
        "Good design is unobtrusive.",
        "Good design is honest.",
        "Good design is long-lasting.",
        "Good design is consistent in every detail.",
        "Good design is environmentally friendly.",
        "Good design is as little design as possible.",
      ],
      methodology: [
        "Question every element - is it necessary?",
        "Design with intention, never more than necessary",
        "Remove non-essentials until only essence remains",
        "Beauty needs longevity - make it worth repairing",
        "Function first, then form follows naturally",
      ],
    },
    visualSignature: {
      typography: "Minimal, functional. Clean sans-serif. Type serves function only.",
      color: "Neutral palette. Black, white, grays. Single accent if needed. No decoration.",
      composition: "Reduction to essence. Perfect proportions. Nothing extra.",
      whitespace: "Necessary for function. Clean, uncluttered. Product-focused.",
    },
    strengths: [
      "Product design principles",
      "Reducing complexity",
      "Creating timeless objects",
      "Functional beauty",
    ],
    bestFor: ["Product-focused design", "Technical communication", "Minimal aesthetic"],
    avoidFor: ["Emotional branding", "Entertainment", "Fashion"],
    promptKeywords: [
      "Dieter Rams style", "less but better", "Braun aesthetic",
      "10 principles", "functional minimalism", "essential design",
      "unobtrusive", "honest design"
    ],
  },

  // ============================================
  // STEFAN SAGMEISTER - Beauty & Emotion
  // ============================================
  "stefan_sagmeister": {
    name: "Stefan Sagmeister",
    nationality: "Austrian-American",
    agency: "Sagmeister & Walsh / Sagmeister Inc.",
    era: "Contemporary",
    philosophy: {
      core: "Beauty is a central function - it's totally underestimated in contemporary design. Design should touch people emotionally.",
      quotes: [
        "Beauty is a central function.",
        "If you want to create something of longevity, it needs to be beautiful so people will look after it.",
        "Beauty needs ugliness to shine.",
        "Design is not just a functionality search.",
        "I need to take a sabbatical every so often - it's the most important idea for keeping design as my calling.",
      ],
      methodology: [
        "Personal human approach over machine-like visuals",
        "Sabbaticals to fight routine and boredom",
        "Self-experiments to understand the topic deeply",
        "Beauty and function must coexist",
        "Find areas beyond promotional to apply design language",
      ],
    },
    visualSignature: {
      typography: "Experimental. Hand-crafted. Sometimes carved into skin. Personal, not mechanical.",
      color: "Varies by concept. Often unexpected. Emotional color choices.",
      composition: "Conceptual. Story-driven. Sometimes shocking. Always memorable.",
      whitespace: "Varies. Serves the concept.",
    },
    strengths: [
      "Album covers and music industry",
      "Conceptual campaigns",
      "Personal expression",
      "Making people feel something",
    ],
    bestFor: ["Music industry", "Art exhibitions", "Conceptual work", "Emotional impact"],
    avoidFor: ["Corporate identity", "Systematic design", "Quick turnaround"],
    promptKeywords: [
      "Stefan Sagmeister style", "beauty in design", "emotional design",
      "conceptual", "hand-crafted typography", "personal expression",
      "provocative design"
    ],
  },

  // ============================================
  // KASHIWA SATO - Iconic Simplicity
  // ============================================
  "kashiwa_sato": {
    name: "Kashiwa Sato",
    nationality: "Japanese",
    agency: "SAMURAI Inc.",
    era: "Contemporary",
    philosophy: {
      core: "A strong identity is an icon. Icons must be simple and direct. Super rationality with aesthetic consciousness.",
      quotes: [
        "The purpose of branding is to create a strong identity. A strong identity is an icon.",
        "Icons must be simple and direct.",
        "Products, packaging, and logos should be simple enough that even housewives could understand.",
        "Super rationality with aesthetic consciousness.",
      ],
      methodology: [
        "Identify the most iconic aspect of the brand",
        "Simplify until the essence is crystal clear",
        "Design should cross linguistic and cultural barriers",
        "Long-term brand partnerships (10-17 years)",
        "Balance Japanese tradition with global appeal",
      ],
    },
    visualSignature: {
      typography: "Clean, iconic. Typefaces as symbols. Bilingual consideration (Roman + Japanese).",
      color: "Bold but simple. Red and white for Japanese identity. Limited, memorable palette.",
      composition: "Centered, iconic. Focus on single memorable element. Perfect balance.",
      whitespace: "Generous. Frames the icon. Creates premium feel.",
    },
    strengths: [
      "Iconic logo design",
      "Global brand identity",
      "Bridging cultures",
      "Long-term brand building",
    ],
    bestFor: ["Logo design", "Global branding", "Retail identity", "Japanese brands going global"],
    avoidFor: ["Complex information", "Editorial design", "Multi-layered concepts"],
    promptKeywords: [
      "Kashiwa Sato style", "iconic branding", "Uniqlo aesthetic",
      "Japanese simplicity", "strong identity", "global design",
      "super rationality"
    ],
  },

  // ============================================
  // IKKO TANAKA - East Meets West
  // ============================================
  "ikko_tanaka": {
    name: "Ikko Tanaka",
    nationality: "Japanese",
    agency: "Tanaka Design Studio",
    era: "Modern (1930-2002)",
    philosophy: {
      core: "Fusion of modernist principles with Japanese tradition. Universal aesthetic value beyond regional or cultural barriers.",
      quotes: [
        "Design should achieve universal aesthetic value beyond regional or cultural barriers.",
        "Traditional aesthetics can be reinterpreted through modern design language.",
      ],
      methodology: [
        "Study both Bauhaus/Swiss and traditional Japanese art",
        "Abstract natural motifs (Rinpa style)",
        "Geometric simplification of cultural icons",
        "Playfulness within structure",
        "Bold colors with Japanese sensibility",
      ],
    },
    visualSignature: {
      typography: "Bold, often geometric. Japanese calligraphy influence. Type as visual element.",
      color: "Soft pastels with contrasting primaries. Japanese color sensibility. Unexpected harmonies.",
      composition: "Grid-based but playful. Geometric shapes as building blocks. Cultural references abstracted.",
      whitespace: "Balanced. Neither excessive nor absent. Frames geometric elements.",
    },
    strengths: [
      "Cultural poster design",
      "East-West fusion",
      "Geometric abstraction",
      "Making tradition contemporary",
    ],
    bestFor: ["Cultural events", "Japanese themes", "Geometric posters", "Art exhibitions"],
    avoidFor: ["Western corporate", "Technical documentation", "Ultra-minimal"],
    promptKeywords: [
      "Ikko Tanaka style", "Japanese modernism", "geometric geisha",
      "East meets West", "cultural fusion", "bold geometry",
      "Nihon Buyo poster style"
    ],
  },

  // ============================================
  // COLLINS AGENCY - Strategic Freshness
  // ============================================
  "collins": {
    name: "Brian Collins / COLLINS",
    nationality: "American",
    agency: "COLLINS (Founded 2008)",
    era: "Contemporary",
    philosophy: {
      core: "Design is not what we do - design is what we make possible for others. Design is hope made visible.",
      quotes: [
        "Design is not what we do, Design is what we make possible for others.",
        "Design is hope made visible.",
        "We never hire for cultural fit - we hire for cultural contribution.",
        "A designer's first job is to clearly articulate the tangible value brought to every situation.",
      ],
      methodology: [
        "Deep reconnaissance into design history before starting",
        "Evolution over revolution - build on what works",
        "Pressure test across every touchpoint",
        "Engineer systems to be timely AND timeless",
        "Language and poetry as design tools",
      ],
    },
    visualSignature: {
      typography: "Contemporary, strategic. Custom solutions per project. Never generic.",
      color: "Fresh, contemporary palettes. Often unexpected. Strategic use.",
      composition: "Systematic yet distinctive. Works across all applications. Performance-tested.",
      whitespace: "Strategic. Varies by project needs.",
    },
    strengths: [
      "Brand strategy and identity",
      "Tech company branding",
      "Systematic design",
      "Making brands feel alive",
    ],
    bestFor: ["Tech brands", "Strategic rebrand", "System design", "Contemporary identity"],
    avoidFor: ["Traditional/heritage brands", "Quick one-off projects"],
    promptKeywords: [
      "Collins agency style", "strategic design", "contemporary brand",
      "Spotify branding", "Dropbox aesthetic", "fresh identity",
      "systematic yet distinctive"
    ],
  },

  // ============================================
  // MICHAEL BIERUT - Accessible Modernism
  // ============================================
  "michael_bierut": {
    name: "Michael Bierut",
    nationality: "American",
    agency: "Pentagram (Partner since 1990)",
    era: "Contemporary",
    philosophy: {
      core: "There's no such thing as a bad design project - everything has potential. Form follows content. Make design accessible.",
      quotes: [
        "I honestly don't think there's any such thing as a bad design project any more. Everything has potential.",
        "For graphic designers, form follows content.",
        "Building on existing foundations rather than always starting from scratch.",
      ],
      methodology: [
        "Use composition notebooks to sketch and refine",
        "Study past solutions - give old designs new life",
        "Be candid about failures and learn from them",
        "Make complex ideas accessible and memorable",
        "Typography as key narrative tool",
      ],
    },
    visualSignature: {
      typography: "Clear, considered. Type as narrative. Accessible hierarchy.",
      color: "Purposeful. Often bold but controlled. Serves the concept.",
      composition: "Organized, clear. Information well-structured. Accessible at first glance.",
      whitespace: "Functional. Creates clarity and reading flow.",
    },
    strengths: [
      "Making complex information clear",
      "Building on existing brand equity",
      "Democratic, accessible design",
      "Long-term brand evolution",
    ],
    bestFor: ["Information design", "Brand evolution", "Cultural institutions", "Accessible communication"],
    avoidFor: ["Avant-garde experiments", "Trendy ephemera"],
    promptKeywords: [
      "Michael Bierut style", "accessible design", "clear communication",
      "narrative typography", "democratic design", "Pentagram clarity"
    ],
  },
};

// ============================================
// DESIGN PRINCIPLES BY CATEGORY
// ============================================

export const UNIVERSAL_PRINCIPLES = {
  typography: {
    hierarchy: "Clear visual priority: what to read first, second, third",
    scale: "Size differences should be meaningful, not arbitrary",
    consistency: "Same level = same treatment throughout",
    readability: "If it can't be read, it can't communicate",
    personality: "Type choice conveys emotion before reading",
  },
  color: {
    palette: "2-4 colors maximum. More isn't more.",
    contrast: "Minimum 4.5:1 for text legibility",
    harmony: "Colors should feel intentional together",
    emotion: "Color evokes feeling before content is processed",
    restraint: "One accent color creates focus. Many create chaos.",
  },
  composition: {
    focalPoint: "Every design needs ONE clear entry point",
    balance: "Visual weight distributed intentionally",
    flow: "Eye should move through design in intended order",
    tension: "Strategic imbalance creates energy",
    closure: "Design should feel complete, nothing missing or extra",
  },
  whitespace: {
    breathing: "Elements need room to be seen",
    grouping: "Space defines relationships between elements",
    emphasis: "Isolation creates importance",
    luxury: "Generous space = premium feel",
    intention: "Empty space is never leftover - it's designed",
  },
};

// ============================================
// STYLE MATCHING FUNCTION
// ============================================

export function matchDesignerToProject(projectType: string, mood: string): string[] {
  const recommendations: string[] = [];

  // Based on project type
  if (projectType.includes("bold") || projectType.includes("event") || projectType.includes("theater")) {
    recommendations.push("paula_scher");
  }
  if (projectType.includes("minimal") || projectType.includes("luxury") || projectType.includes("zen")) {
    recommendations.push("kenya_hara");
  }
  if (projectType.includes("playful") || projectType.includes("brand") || projectType.includes("youth")) {
    recommendations.push("jessica_walsh");
  }
  if (projectType.includes("corporate") || projectType.includes("system") || projectType.includes("wayfinding")) {
    recommendations.push("massimo_vignelli");
  }
  if (projectType.includes("product") || projectType.includes("tech") || projectType.includes("functional")) {
    recommendations.push("dieter_rams");
  }
  if (projectType.includes("cultural") || projectType.includes("japanese") || projectType.includes("geometric")) {
    recommendations.push("ikko_tanaka");
  }
  if (projectType.includes("global") || projectType.includes("iconic") || projectType.includes("logo")) {
    recommendations.push("kashiwa_sato");
  }

  // Based on mood
  if (mood.includes("dramatic") || mood.includes("powerful")) {
    recommendations.push("paula_scher", "stefan_sagmeister");
  }
  if (mood.includes("serene") || mood.includes("calm") || mood.includes("elegant")) {
    recommendations.push("kenya_hara", "kashiwa_sato");
  }
  if (mood.includes("fresh") || mood.includes("contemporary") || mood.includes("modern")) {
    recommendations.push("jessica_walsh", "collins");
  }
  if (mood.includes("timeless") || mood.includes("classic")) {
    recommendations.push("massimo_vignelli", "michael_bierut");
  }

  // Return unique recommendations
  return [...new Set(recommendations)];
}

// ============================================
// PROMPT ENHANCEMENT FUNCTION
// ============================================

export function enhancePromptWithDesignerStyle(
  basePrompt: string,
  designerKey: string
): string {
  const designer = MASTER_DESIGNERS[designerKey];
  if (!designer) return basePrompt;

  const styleGuidance = `
DESIGN REFERENCE: ${designer.name}'s signature approach
- Philosophy: ${designer.philosophy.core}
- Typography: ${designer.visualSignature.typography}
- Color: ${designer.visualSignature.color}
- Composition: ${designer.visualSignature.composition}
- White space: ${designer.visualSignature.whitespace}

KEY CHARACTERISTICS: ${designer.promptKeywords.slice(0, 5).join(", ")}
`;

  return `${basePrompt}\n\n${styleGuidance}`;
}

export default MASTER_DESIGNERS;
