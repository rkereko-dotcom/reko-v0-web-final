import fs from "fs";
import path from "path";

type ReferenceItem = {
  id: string;
  title: string;
  intents?: string[];
  styles?: string[];
  moods?: string[];
  palette?: string[];
  tags?: string[];
  layout?: string;
  notes?: string;
};

type ReferenceGallery = {
  version: string;
  items: ReferenceItem[];
};

export type ReferenceMatch = {
  id: string;
  title: string;
  score: number;
  reasons: string[];
  styles?: string[];
  moods?: string[];
  palette?: string[];
  layout?: string;
  tags?: string[];
};

type AnalysisLike = {
  intent_profile?: {
    goal?: string;
    target_audience?: string;
    desired_emotion?: string;
  };
  style_detection?: {
    primary_style?: string;
    what_its_trying_to_be?: string;
  };
  emotional_analysis?: {
    intended_emotion?: string;
  };
  color_analysis?: {
    current_palette?: string[];
    suggested_palette?: string[];
  };
  product_info?: {
    product_type?: string;
  };
  poster_type?: string;
  elements?: {
    purpose?: string;
  };
};

const DEFAULT_REFERENCE_FILE = process.env.REFERENCE_GALLERY_FILE
  ? path.join(process.cwd(), process.env.REFERENCE_GALLERY_FILE)
  : path.join(process.cwd(), "prompts", "reference-gallery.json");

function normalizeTag(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function safeArray(value?: string[]) {
  return Array.isArray(value) ? value : [];
}

function getAnalysisTags(analysis: AnalysisLike) {
  const parts: string[] = [];
  if (analysis.intent_profile?.goal) parts.push(analysis.intent_profile.goal);
  if (analysis.intent_profile?.desired_emotion) parts.push(analysis.intent_profile.desired_emotion);
  if (analysis.style_detection?.primary_style) parts.push(analysis.style_detection.primary_style);
  if (analysis.style_detection?.what_its_trying_to_be) parts.push(analysis.style_detection.what_its_trying_to_be);
  if (analysis.emotional_analysis?.intended_emotion) parts.push(analysis.emotional_analysis.intended_emotion);
  if (analysis.product_info?.product_type) parts.push(analysis.product_info.product_type);
  if (analysis.poster_type) parts.push(analysis.poster_type);
  if (analysis.elements?.purpose) parts.push(analysis.elements.purpose);

  const tags = parts.flatMap((part) => tokenize(part)).map(normalizeTag);
  return Array.from(new Set(tags));
}

function colorToRgb(hex: string) {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return null;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return { r, g, b };
}

function paletteDistance(paletteA: string[], paletteB: string[]) {
  if (paletteA.length === 0 || paletteB.length === 0) return Infinity;
  let total = 0;
  let count = 0;
  for (const colorA of paletteA) {
    const rgbA = colorToRgb(colorA);
    if (!rgbA) continue;
    let best = Infinity;
    for (const colorB of paletteB) {
      const rgbB = colorToRgb(colorB);
      if (!rgbB) continue;
      const dist = Math.sqrt(
        Math.pow(rgbA.r - rgbB.r, 2) +
          Math.pow(rgbA.g - rgbB.g, 2) +
          Math.pow(rgbA.b - rgbB.b, 2)
      );
      if (dist < best) best = dist;
    }
    if (best < Infinity) {
      total += best;
      count += 1;
    }
  }
  return count ? total / count : Infinity;
}

function loadGallery(): ReferenceGallery {
  try {
    if (!fs.existsSync(DEFAULT_REFERENCE_FILE)) {
      return { version: "v1", items: [] };
    }
    const raw = fs.readFileSync(DEFAULT_REFERENCE_FILE, "utf8");
    const parsed = JSON.parse(raw) as ReferenceGallery;
    if (!parsed?.items) return { version: "v1", items: [] };
    return parsed;
  } catch {
    return { version: "v1", items: [] };
  }
}

function scoreOverlap(tags: string[], target: string[]) {
  const set = new Set(target.map(normalizeTag));
  const hits = tags.filter((tag) => set.has(normalizeTag(tag)));
  return { hits, score: hits.length };
}

export function findReferenceMatches(analysis: AnalysisLike, maxResults = 3): ReferenceMatch[] {
  const gallery = loadGallery();
  if (!gallery.items.length) return [];

  const tags = getAnalysisTags(analysis);
  const goal = analysis.intent_profile?.goal?.toLowerCase() || "";
  const analysisPalette =
    safeArray(analysis.color_analysis?.current_palette).length > 0
      ? safeArray(analysis.color_analysis?.current_palette)
      : safeArray(analysis.color_analysis?.suggested_palette);

  const scored = gallery.items.map((item) => {
    let score = 0;
    const reasons: string[] = [];

    if (goal && safeArray(item.intents).map((value) => value.toLowerCase()).includes(goal)) {
      score += 30;
      reasons.push(`Intent match: ${goal}`);
    }

    const styleOverlap = scoreOverlap(tags, safeArray(item.styles));
    if (styleOverlap.score > 0) {
      score += styleOverlap.score * 12;
      reasons.push(`Style match: ${styleOverlap.hits.join(", ")}`);
    }

    const moodOverlap = scoreOverlap(tags, safeArray(item.moods));
    if (moodOverlap.score > 0) {
      score += moodOverlap.score * 10;
      reasons.push(`Mood match: ${moodOverlap.hits.join(", ")}`);
    }

    const tagOverlap = scoreOverlap(tags, safeArray(item.tags));
    if (tagOverlap.score > 0) {
      score += Math.min(20, tagOverlap.score * 4);
      reasons.push(`Tag overlap: ${tagOverlap.hits.join(", ")}`);
    }

    const paletteScore = paletteDistance(analysisPalette, safeArray(item.palette));
    if (paletteScore < 60) {
      score += 15;
      reasons.push("Palette close");
    } else if (paletteScore < 110) {
      score += 6;
      reasons.push("Palette somewhat close");
    }

    return {
      id: item.id,
      title: item.title,
      score,
      reasons,
      styles: item.styles,
      moods: item.moods,
      palette: item.palette,
      layout: item.layout,
      tags: item.tags,
    } as ReferenceMatch;
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

export function buildReferenceCueBlock(matches: ReferenceMatch[]) {
  if (!matches.length) return "";
  const lines = matches.map((match) => {
    const details = [
      match.styles?.length ? `styles: ${match.styles.join(", ")}` : "",
      match.moods?.length ? `mood: ${match.moods.join(", ")}` : "",
      match.layout ? `layout: ${match.layout}` : "",
      match.palette?.length ? `palette: ${match.palette.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(" | ");
    return `- ${match.title}${details ? ` (${details})` : ""}`;
  });

  return [
    "REFERENCE CUES (do not copy content; use for mood, layout, palette):",
    ...lines,
  ].join("\n");
}
