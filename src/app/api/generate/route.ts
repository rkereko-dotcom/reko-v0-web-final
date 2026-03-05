import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import sharp from "sharp";
import { rateLimit } from "@/lib/rate-limit";
import { logEvent } from "@/lib/telemetry";
import { extractCodeBlocks, loadPromptFile } from "@/lib/prompt-loader";
import { pickCoreRulesPrompt } from "@/lib/prompt-policy";
import { buildReferenceCueBlock, findReferenceMatches } from "@/lib/reference-matcher";
import { saveGeneratedImages, saveGeneratedImageRecords } from "@/lib/save-image";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

// Increase timeout for image generation
export const maxDuration = 60;

const HF_TOKEN = process.env.HF_TOKEN;
const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image-preview";
const GEMINI_IMAGE_FALLBACK_MODELS = (
  process.env.GEMINI_IMAGE_FALLBACK_MODELS ||
  ""
)
  .split(",")
  .map((model) => model.trim())
  .filter((model) => Boolean(model) && model !== GEMINI_IMAGE_MODEL);
const RATE_LIMIT_PER_MINUTE = 4;
const DEFAULT_CORE_RULES = "00-core-rules.md";

function getClientId(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip") || "unknown";
}

type AspectRatio = "9:16" | "16:9" | "1:1" | "4:5" | "3:4";
type RedesignPreset = "clean" | "bold" | "swiss" | "pop" | "luxury" | "retro";
type ArtisticStyleKey =
  | "dnaLayout"
  | "dnaIconic"
  | "dnaGradient"
  | "painterly"
  | "hand"
  | "elevated"
  | "mood"
  | "riso"
  | "paper"
  | "ink"
  | "halftone"
  | "boldMinimal"
  | "warmEditorial"
  | "handcrafted"
  | "texturedGrain"
  | "neoTech"
  | "windowLight"
  | "retroMetallic"
  | "abstractBotanicals";

interface SketchInputs {
  headline: string;
  subheadline: string;
  price: string;
  cta: string;
  brand: string;
  additionalText: string;
}

interface SketchLayout {
  header_area: string;
  main_area: string;
  footer_area: string;
  elements: string[];
  hierarchy: string;
}

interface ProductInputs {
  headline: string;
  subheadline: string;
  price: string;
  cta: string;
  brand: string;
}

interface ProductInfo {
  product_type: string;
  brand_detected: string | null;
  target_demographic: {
    age_range: string;
    gender: string;
    lifestyle: string;
  };
  use_cases: string[];
  price_positioning: string;
  color_mood: string;
  suggested_headlines: string[];
  key_features?: string[];
  benefits?: string[];
  differentiators?: string[];
  reasons_to_believe?: string[];
  primary_claim?: string;
}

interface GenerateRequest {
  prompts?: string[];
  mode?: "artistic" | "redesign" | "sketch-to-design" | "product-to-poster";  // Generation mode
  provider?: "flux" | "nano" | "gemini3";  // Default: nano (uses Gemini 3 Pro Image / Nano Banana PRO)
  aspectRatio?: AspectRatio;   // Default: 9:16
  parallel?: boolean;          // Default: true
  originalImage?: string;      // Base64 original image for image-to-image improvement
  analysisResult?: unknown;    // Analysis result for context
  analysisId?: string;         // Optional analysis id for learning
  sourceImageName?: string;    // Source upload filename for better logo matching
  // Sketch-to-Design parameters
  sketchInputs?: SketchInputs;
  sketchStyle?: "minimal" | "bold" | "playful" | "premium" | "dark";
  sketchCategory?: "product" | "event" | "sale" | "announcement" | "social";
  sketchLayout?: SketchLayout;
  // Product-to-Poster parameters
  productInputs?: ProductInputs;
  productCampaign?: "sale" | "launch" | "awareness" | "seasonal";
  productStyle?: "fun" | "premium" | "athletic" | "eco" | "minimal" | "bold";
  productInfo?: ProductInfo;
  // Redesign preset
  redesignPreset?: RedesignPreset;
  // Artistic controls
  artisticIntensity?: "subtle" | "balanced" | "extreme";
  artisticTextSafety?: "strict" | "creative";
  artisticColorFidelity?: "preserve" | "explore";
  artisticExtra?: boolean;
  artisticStyles?: string[];
  artisticStyleBatch?: number;
  inspirationNotes?: string;
  gradientPreset?: "auto" | "mesh-soft" | "duotone-wash" | "dark-spotlight" | "warm-film";
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return [];
}

function resolveBrandHint(analysisResult: unknown, sourceImageName?: string): string | null {
  if (!analysisResult || typeof analysisResult !== "object") return null;
  const result = analysisResult as Record<string, unknown>;
  const elements = (result.elements as { brand?: unknown; visual_elements?: unknown; logo?: unknown; wordmark?: unknown; brand_name?: unknown }) || undefined;
  const productInfo = result.product_info as { brand_detected?: unknown } | undefined;
  const fileHint = sourceImageName
    ? sourceImageName
        .replace(/\.[^.]+$/, "")
        .replace(/[_-]+/g, " ")
        .toLowerCase()
    : "";
  const hasFilenameLogoSignal = Boolean(fileHint && /\b(logo|wordmark|icon|brand|mark|badge|symbol|emblem)\b/i.test(fileHint));
  const hasKnownLogoToken = Boolean(fileHint && /\b(logoen|logo[- ]en|ixon|bond|ixons?|reko|reko-v1)\b/i.test(fileHint));

  const candidates = [
    elements?.brand,
    elements?.logo,
    elements?.wordmark,
    elements?.brand_name,
    productInfo?.brand_detected,
    (result as { brand_detected?: unknown }).brand_detected || elements?.brand,
    result.brand,
    result.brand_text,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed.length > 0 && /[A-Za-z0-9]/.test(trimmed)) return trimmed;
    }
  }

  const hasLogoSignals =
    toStringArray(result.visual_elements)
      .concat(toStringArray(result.what_must_stay))
      .concat(toStringArray(result.what_must_change))
      .concat(toStringArray(result.what_must_go))
      .concat(toStringArray(elements?.visual_elements))
      .concat(toStringArray((result.feedback as { the_good?: unknown })?.the_good))
      .concat(toStringArray((result.feedback as { the_bad?: unknown })?.the_bad))
      .some((value) => /\b(logo|wordmark|icon|brand|mark|badge|symbol|emblem)\b/i.test(value));

  if (hasLogoSignals) return "Detected from analysis";
  if (hasKnownLogoToken || hasFilenameLogoSignal) return "Detected from filename";
  return null;
}

function getDataUrlParts(dataUrl?: string): { mimeType: string; data: string } | null {
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

function extractJsonObjectFromText(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return raw.slice(start, end + 1);
}

function extractRetryDelayMs(message: string): number | null {
  if (!message) return null;
  const secondsMatch = message.match(/Please retry in\s*([\d.]+)s/i);
  if (secondsMatch) {
    const seconds = Number.parseFloat(secondsMatch[1]);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.ceil(seconds * 1000);
    }
  }
  const msMatch = message.match(/Please retry in\s*([\d.]+)ms/i);
  if (msMatch) {
    const ms = Number.parseFloat(msMatch[1]);
    if (Number.isFinite(ms) && ms > 0) {
      return Math.ceil(ms);
    }
  }
  return null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseTimeoutMs(value: string | undefined, fallbackMs: number): number {
  if (!value) return fallbackMs;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallbackMs;
  return parsed;
}

const GEMINI_REQUEST_TIMEOUT_MS = parseTimeoutMs(process.env.GEMINI_REQUEST_TIMEOUT_MS, 45_000);
const GEMINI_VERIFY_TIMEOUT_MS = parseTimeoutMs(process.env.GEMINI_VERIFY_TIMEOUT_MS, 12_000);
const GENERATE_SINGLE_IMAGE_TIMEOUT_MS = parseTimeoutMs(process.env.GENERATE_SINGLE_IMAGE_TIMEOUT_MS, 45_000);
const GENERATE_TOTAL_TIMEOUT_MS = parseTimeoutMs(process.env.GENERATE_TOTAL_TIMEOUT_MS, 90_000);

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });
  try {
    return (await Promise.race([promise, timeoutPromise])) as T;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function readResponseJsonWithTimeout<T>(
  response: Response,
  timeoutMs: number,
  context: string
): Promise<T> {
  return withTimeout(
    response.json() as Promise<T>,
    timeoutMs,
    `${context} response parse timeout after ${timeoutMs}ms`
  );
}

function isHardQuotaError(message: string): boolean {
  return /quota exceeded/i.test(message) && /limit:\s*0/i.test(message);
}

function isTransientGeminiError(message: string, statusCode?: number): boolean {
  if (typeof statusCode === "number" && [429, 500, 502, 503, 504].includes(statusCode)) {
    return true;
  }
  return /(high demand|try again later|temporar(?:y|ily)|unavailable|overloaded|rate limit|too many requests|deadline exceeded|timeout)/i.test(
    message
  );
}

function computeRetryDelayMs(attempt: number, retryAfterMs?: number): number {
  if (retryAfterMs && retryAfterMs > 0) {
    return Math.min(retryAfterMs + 500, 15000);
  }
  const backoff = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
  const jitter = Math.floor(Math.random() * 400);
  return backoff + jitter;
}

async function verifyLogoIdentityWithGemini(
  originalImage: string,
  generatedImage: string,
  brandHint?: string | null
): Promise<boolean> {
  if (!GOOGLE_AI_API_KEY) return true;
  const source = getDataUrlParts(originalImage);
  const output = getDataUrlParts(generatedImage);
  if (!source || !output) return true;

  const expectedWordmark =
    brandHint && !/^Detected from /i.test(brandHint) ? brandHint.trim() : "";
  const expectedWordmarkRule = expectedWordmark
    ? `Expected logo/wordmark text exactly: "${expectedWordmark}".`
    : "";

  const prompt = `Compare the two poster images and evaluate ONLY the logo icon + wordmark identity.
Return ONLY strict JSON:
{"match": true|false, "icon_match": true|false, "confidence": number, "reason": string, "wordmark_source": string, "wordmark_generated": string, "duplicate_or_ghost": true|false, "extra_logo_count": number}
Rules:
- "match" must be false if any wordmark letters differ (including missing/extra/reordered letters), if casing changes, if icon shape is redrawn, if logo is duplicated, if logo orientation changes, or if logo position/size changes.
- "icon_match" must be false if icon silhouette/inner geometry differs in any way.
- Any duplicate, echo, faint ghost, shadow-copy, or second logo/icon/wordmark anywhere in the image must set match=false and duplicate_or_ghost=true.
- If uncertain, set match=false and icon_match=false.
- Ignore background/color/style changes outside the logo mark.
${expectedWordmarkRule}`;

  try {
    const response = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${GOOGLE_AI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inlineData: { mimeType: source.mimeType, data: source.data } },
                { inlineData: { mimeType: output.mimeType, data: output.data } },
                { text: prompt },
              ],
            },
          ],
          generationConfig: { temperature: 0.0 },
        }),
      },
      GEMINI_VERIFY_TIMEOUT_MS
    );

    if (!response.ok) return false;
    const data = await readResponseJsonWithTimeout<Record<string, unknown>>(
      response,
      GEMINI_VERIFY_TIMEOUT_MS,
      "Logo verify"
    ).catch(() => ({} as Record<string, unknown>));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parts = (data as any)?.candidates?.[0]?.content?.parts || [];
    const responseText = parts
      .map((part: { text?: string }) => part.text)
      .filter(Boolean)
      .join("\n");
    const jsonText = extractJsonObjectFromText(responseText);
    if (!jsonText) return false;
    const parsed = JSON.parse(jsonText) as {
      match?: unknown;
      logo_match?: unknown;
      icon_match?: unknown;
      confidence?: unknown;
      wordmark_source?: unknown;
      wordmark_generated?: unknown;
      duplicate_or_ghost?: unknown;
      extra_logo_count?: unknown;
    };

    const matchValue =
      typeof parsed.match === "boolean"
        ? parsed.match
        : typeof parsed.logo_match === "boolean"
          ? parsed.logo_match
          : false;
    const iconMatchValue = typeof parsed.icon_match === "boolean" ? parsed.icon_match : false;
    const confidenceValue = typeof parsed.confidence === "number" ? parsed.confidence : 0;
    const duplicateOrGhostValue = typeof parsed.duplicate_or_ghost === "boolean" ? parsed.duplicate_or_ghost : false;
    const extraLogoCountValue = typeof parsed.extra_logo_count === "number" ? parsed.extra_logo_count : 1;
    const sourceWordmark = typeof parsed.wordmark_source === "string" ? parsed.wordmark_source.trim() : "";
    const generatedWordmark = typeof parsed.wordmark_generated === "string" ? parsed.wordmark_generated.trim() : "";
    const normalizeWordmark = (value: string) =>
      value
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

    if (sourceWordmark && generatedWordmark) {
      const sourceNorm = normalizeWordmark(sourceWordmark);
      const generatedNorm = normalizeWordmark(generatedWordmark);
      if (sourceNorm && generatedNorm && sourceNorm !== generatedNorm) {
        return false;
      }
    }

    if (expectedWordmark && generatedWordmark) {
      const expectedNorm = normalizeWordmark(expectedWordmark);
      const generatedNorm = normalizeWordmark(generatedWordmark);
      if (expectedNorm && generatedNorm && !generatedNorm.includes(expectedNorm)) {
        return false;
      }
    }

    if (duplicateOrGhostValue) return false;
    if (Number.isFinite(extraLogoCountValue) && extraLogoCountValue > 1) return false;

    if (confidenceValue < 0.9) return false;
    return Boolean(matchValue && iconMatchValue);
  } catch {
    return false;
  }
}

// ARTISTIC STYLE PROMPTS - loaded from prompts/02-artistic-styles.md
const ARTISTIC_STYLE_BLOCKS = extractCodeBlocks(loadPromptFile("02-artistic-styles.md").content)
  .filter((block) => !/follow core rules/i.test(block));
const [
  painterlyPrompt,
  handDrawnPrompt,
  elevatedPrompt,
  moodPrompt,
  risoPrompt,
  paperPrompt,
  inkPrompt,
  halftonePrompt,
  boldMinimalPrompt,
  warmEditorialPrompt,
  handcraftedPrompt,
  texturedGrainPrompt,
  neoTechPrompt,
  windowLightPrompt,
  retroMetallicPrompt,
  abstractBotanicalPrompt,
  dnaLayoutPrompt,
  dnaIconicPrompt,
  dnaGradientPrompt,
] = ARTISTIC_STYLE_BLOCKS;

const ARTISTIC_STYLE_LIBRARY: Record<ArtisticStyleKey, { name: string; prompt: string }> = {
  dnaLayout: { name: "Layout/Ratio DNA", prompt: dnaLayoutPrompt || "" },
  dnaIconic: { name: "Iconic Hero Object", prompt: dnaIconicPrompt || "" },
  dnaGradient: { name: "Gradient Atmosphere", prompt: dnaGradientPrompt || "" },
  painterly: { name: "Painterly Touch", prompt: painterlyPrompt || "" },
  hand: { name: "Hand-Drawn Heart", prompt: handDrawnPrompt || "" },
  elevated: { name: "Elevated Essence", prompt: elevatedPrompt || "" },
  mood: { name: "Mood Amplified", prompt: moodPrompt || "" },
  riso: { name: "Risograph Print", prompt: risoPrompt || "" },
  paper: { name: "Paper Cut Collage", prompt: paperPrompt || "" },
  ink: { name: "Ink Wash", prompt: inkPrompt || "" },
  halftone: { name: "Halftone Screenprint", prompt: halftonePrompt || "" },
  boldMinimal: { name: "Bold Minimal", prompt: boldMinimalPrompt || "" },
  warmEditorial: { name: "Warm Editorial", prompt: warmEditorialPrompt || "" },
  handcrafted: { name: "Handcrafted Type", prompt: handcraftedPrompt || "" },
  texturedGrain: { name: "Textured Grain", prompt: texturedGrainPrompt || "" },
  neoTech: { name: "Neo-Tech Glow", prompt: neoTechPrompt || "" },
  windowLight: { name: "Window Light Depth", prompt: windowLightPrompt || "" },
  retroMetallic: { name: "Retro Serif Metallic", prompt: retroMetallicPrompt || "" },
  abstractBotanicals: { name: "Abstract Botanicals", prompt: abstractBotanicalPrompt || "" },
};

const ARTISTIC_STYLE_BASE_KEYS: ArtisticStyleKey[] = [
  "dnaLayout",
  "dnaIconic",
  "dnaGradient",
  "elevated",
];
const ARTISTIC_STYLE_EXTRA_KEYS: ArtisticStyleKey[] = ["riso", "paper", "ink", "halftone"];
function resolveArtisticStyles(selectedKeys?: string[], useExtra?: boolean) {
  const selected = (selectedKeys || [])
    .filter((key): key is ArtisticStyleKey => key in ARTISTIC_STYLE_LIBRARY)
    ;
  if (selected.length > 0) {
    return selected
      .map((key) => ({ key, ...ARTISTIC_STYLE_LIBRARY[key] }))
      .filter((style) => style.prompt);
  }
  const base = ARTISTIC_STYLE_BASE_KEYS.map((key) => ({
    key,
    ...ARTISTIC_STYLE_LIBRARY[key],
  }));
  const extra = useExtra
    ? ARTISTIC_STYLE_EXTRA_KEYS.map((key) => ({
        key,
        ...ARTISTIC_STYLE_LIBRARY[key],
      }))
    : [];
  return [...base, ...extra].filter((style) => style.prompt);
}

function buildArtisticOptionsBlock(options?: {
  intensity?: "subtle" | "balanced" | "extreme";
  textSafety?: "strict" | "creative";
  colorFidelity?: "preserve" | "explore";
}) {
  const intensity = options?.intensity || "balanced";
  const textSafety = options?.textSafety || "strict";
  const colorFidelity = options?.colorFidelity || "preserve";

  const intensityRules: Record<string, string> = {
    subtle: "Subtle: minimal stylization, keep layout and proportions very close to original.",
    balanced: "Balanced: artistic stylization is clear but still faithful to the original structure.",
    extreme: "Extreme: bold stylization and textures, but text must stay legible and the face identical.",
  };

  const textRules: Record<string, string> = {
    strict: "Text safety: preserve all original text content exactly; no reflow, no repositioning, no font substitution for logo or wordmark.",
    creative: "Text safety: you may reflow the layout significantly. Change alignment, spacing, and grid. Keep ALL text content and hierarchy.",
  };

  const colorRules: Record<string, string> = {
    preserve: "Color fidelity: preserve the original palette (only refine tones and contrast).",
    explore: "Color fidelity: you may introduce a new palette if it matches the mood.",
  };

  return `
ARTISTIC CONTROL SETTINGS:
- ${intensityRules[intensity]}
- ${textRules[textSafety]}
- ${colorRules[colorFidelity]}
- Layout freedom: ${textSafety === "creative" ? "high (recompose layout)" : "low (keep layout)"}
- Always keep text content EXACT and 100% readable.`;
}

function buildMoodboardCueBlock(
  analysisResult?: unknown,
  options?: { disableGradientCue?: boolean }
) {
  if (!analysisResult || typeof analysisResult !== "object") return "";
  const data = analysisResult as {
    intent_profile?: { goal?: string; desired_emotion?: string };
    emotional_analysis?: { intended_emotion?: string };
    steal_from?: { feeling_detected?: string };
    style_detection?: { primary_style?: string; what_its_trying_to_be?: string };
    color_analysis?: { suggested_palette?: string[]; current_palette?: string[] };
    poster_type?: string;
  };

  const palette =
    data.color_analysis?.suggested_palette?.length
      ? data.color_analysis.suggested_palette
      : data.color_analysis?.current_palette || [];
  const intent = data.intent_profile?.goal || "";
  const mood =
    data.intent_profile?.desired_emotion ||
    data.emotional_analysis?.intended_emotion ||
    data.steal_from?.feeling_detected ||
    "";
  const style = data.style_detection?.primary_style || data.style_detection?.what_its_trying_to_be || "";
  const styleLower = style.toLowerCase();

  let layoutCue = "Poster layout with strong hierarchy and generous whitespace.";
  if (data.poster_type === "banner") layoutCue = "Wide layout, left-to-right hierarchy, clear CTA lane.";
  if (data.poster_type === "thumbnail") layoutCue = "Center focus, oversized headline for small-size legibility.";
  if (data.poster_type === "carousel_slide") layoutCue = "Slide layout, clear focal point, short copy.";

  let typeCue = "Use one clean sans-serif family with 2 weights max.";
  if (styleLower.includes("editorial") || styleLower.includes("classic")) {
    typeCue = "Serif headline + clean sans body, refined tracking.";
  } else if (styleLower.includes("bold")) {
    typeCue = "Condensed bold headline, high contrast, tight tracking.";
  } else if (styleLower.includes("minimal") || styleLower.includes("swiss")) {
    typeCue = "Neutral grotesk sans, generous spacing, grid-aligned.";
  }

  const gradientOptions = [
    "Mesh Gradient (soft)",
    "Duotone Wash",
    "Dark-to-Light Spotlight",
    "Warm Film Fade",
  ];

  const moodLower = mood.toLowerCase();
  let gradientCue = "";
  if (!options?.disableGradientCue && !styleLower.includes("minimal") && !styleLower.includes("swiss")) {
    if (styleLower.includes("luxury") || styleLower.includes("premium") || moodLower.includes("dramatic")) {
      gradientCue = gradientOptions[2];
    } else if (styleLower.includes("editorial") || moodLower.includes("warm")) {
      gradientCue = gradientOptions[3];
    } else if (styleLower.includes("tech") || styleLower.includes("modern")) {
      gradientCue = gradientOptions[0];
    } else {
      gradientCue = gradientOptions[1];
    }
  }

  const lines = [
    "AUTO MOODBOARD CUES (use for mood, palette, typography only):",
    intent ? `- Intent: ${intent}` : "",
    mood ? `- Mood: ${mood}` : "",
    style ? `- Style direction: ${style}` : "",
    palette.length ? `- Palette: ${palette.join(", ")}` : "",
    `- Layout cue: ${layoutCue}`,
    `- Type cue: ${typeCue}`,
    gradientCue ? `- Gradient cue: ${gradientCue}` : "",
    "Do NOT copy layouts or assets. Translate these cues into a fresh design.",
  ].filter(Boolean);

  return lines.join("\n");
}

function buildGradientPresetBlock(preset?: GenerateRequest["gradientPreset"]) {
  if (!preset || preset === "auto") return "";
  const map: Record<string, string> = {
    "mesh-soft": "Mesh Gradient (soft)",
    "duotone-wash": "Duotone Wash",
    "dark-spotlight": "Dark-to-Light Spotlight",
    "warm-film": "Warm Film Fade",
  };
  const label = map[preset] || preset;
  return `GRADIENT PRESET:\n- Use ${label} as the background gradient.\n- Keep it subtle and readable.\n- Do not add extra textures unless required.`;
}

const REDESIGN_PRESET_RULES: Record<RedesignPreset, string> = {
  clean: `
PRESET: CLEAN MINIMAL
- Pure minimalism, 60-70% whitespace
- One dominant hero, calm layout
- 2-3 colors max, low saturation
- Clean sans-serif typography, no texture
`,
  bold: `
PRESET: BOLD TYPOGRAPHY
- Massive headline, high contrast
- Typography-led composition, minimal imagery
- Black/white + one strong accent color
- Tight hierarchy: hero dominates, support is small
`,
  swiss: `
PRESET: SWISS / GRID EDITORIAL
- Strict grid system, precise alignment
- Asymmetric layout, left-aligned text blocks
- Neutral palette with one accent
- Grotesk or neo-grotesk type
`,
  pop: `
PRESET: ENERGETIC POP
- Vibrant accent colors, dynamic shapes
- Strong contrast and playful energy
- Bold icons, simplified graphics
- Keep layout clean, no clutter
`,
  luxury: `
PRESET: LUXURY
- Black/white base with one elegant accent
- Subtle gradients and soft shadows only
- Premium spacing, refined details
- Elegant serif or high-end sans pairing
`,
  retro: `
PRESET: RETRO POSTER
- Vintage palette (muted reds, creams, ochres)
- Simple geometric shapes, bold blocks
- Slightly imperfect texture, but clean layout
- Classic display type with modern spacing
`,
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// âœï¸ SKETCH-TO-DESIGN - Ð“Ð°Ñ€ Ð·ÑƒÑ€Ð³Ð°Ð°Ñ Ð¼ÑÑ€Ð³ÑÐ¶Ð»Ð¸Ð¹Ð½ Ð´Ð¸Ð·Ð°Ð¹Ð½ Ò¯Ò¯ÑÐ³ÑÑ…
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function generateSketchToDesignPrompts(
  sketchInputs?: SketchInputs,
  sketchStyle?: string,
  sketchCategory?: string,
  sketchLayout?: SketchLayout
): Array<{name: string, prompt: string}> {

  const headline = sketchInputs?.headline || "HEADLINE";
  const subheadline = sketchInputs?.subheadline || "";
  const price = sketchInputs?.price || "";
  const cta = sketchInputs?.cta || "";
  const brand = sketchInputs?.brand || "";
  const additionalText = sketchInputs?.additionalText || "";
  const style = sketchStyle || "minimal";
  const category = sketchCategory || "product";

  // Style-specific guidelines
  const styleGuides: Record<string, string> = {
    minimal: `
MINIMAL STYLE:
â€¢ Clean white or light gray background
â€¢ Maximum 2 colors (black + 1 accent)
â€¢ Sans-serif fonts (Helvetica, Inter, Montserrat)
â€¢ Lots of white space (60%+)
â€¢ Simple geometric shapes
â€¢ No gradients, no shadows
â€¢ Typography as the hero element`,
    bold: `
BOLD STYLE:
â€¢ High contrast colors (black/yellow, red/white)
â€¢ Extra bold, impactful fonts
â€¢ Large text that commands attention
â€¢ Strong geometric shapes
â€¢ Accent color used sparingly but powerfully
â€¢ Energetic, urgent feeling
â€¢ Some texture or grain allowed`,
    playful: `
PLAYFUL STYLE:
â€¢ Bright, fun colors (pink, orange, teal, yellow)
â€¢ Rounded fonts, friendly typography
â€¢ Organic shapes, curves
â€¢ Illustrations or icons
â€¢ Gradient backgrounds allowed
â€¢ Fun, energetic composition
â€¢ Can include subtle patterns`,
    premium: `
PREMIUM STYLE:
â€¢ Dark background (black, navy, deep gray)
â€¢ Gold, silver, or copper accents
â€¢ Elegant serif or thin sans-serif fonts
â€¢ Subtle luxury textures
â€¢ Refined spacing and alignment
â€¢ High-end product photography feel
â€¢ Minimalist but expensive feeling`,
    dark: `
DARK STYLE:
â€¢ Deep black or dark gray background
â€¢ Neon accents (cyan, magenta, lime)
â€¢ Modern, tech-inspired fonts
â€¢ Glowing effects on text
â€¢ Sharp, angular shapes
â€¢ Cyberpunk or gaming aesthetic
â€¢ High contrast elements`
  };

  // Category-specific elements
  const categoryGuides: Record<string, string> = {
    product: "Focus on product presentation, clear pricing, brand visibility",
    event: "Include date/time placeholder, location area, event branding",
    sale: "Emphasize discount percentage, urgency, call-to-action",
    announcement: "Clear headline, supporting info, brand identity",
    social: "Square-friendly composition, shareable design, engaging visuals"
  };

  const layoutDescription = sketchLayout ? `
DETECTED LAYOUT FROM SKETCH:
â€¢ Header: ${sketchLayout.header_area}
â€¢ Main: ${sketchLayout.main_area}
â€¢ Footer: ${sketchLayout.footer_area}
â€¢ Elements: ${sketchLayout.elements.join(", ")}
â€¢ Hierarchy: ${sketchLayout.hierarchy}

RESPECT THIS LAYOUT STRUCTURE!
` : "";

  const textContent = `
TEXT TO INCLUDE:
â€¢ Headline: "${headline}"
${subheadline ? `â€¢ Subheadline: "${subheadline}"` : ""}
${price ? `â€¢ Price/Discount: "${price}"` : ""}
${cta ? `â€¢ CTA Button: "${cta}"` : ""}
${brand ? `â€¢ Brand: "${brand}"` : ""}
${additionalText ? `â€¢ Additional: "${additionalText}"` : ""}
`;

  const basePrompt = `
âœï¸ SKETCH-TO-DESIGN: Create a professional poster design

YOU ARE LOOKING AT A HAND-DRAWN SKETCH.
Your job is to transform this sketch into a PROFESSIONAL, POLISHED design.

${layoutDescription}

${textContent}

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
STYLE REQUIREMENTS:
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
${styleGuides[style]}

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
CATEGORY: ${category.toUpperCase()}
${categoryGuides[category]}
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

IMPORTANT RULES:
1. Follow the LAYOUT from the sketch
2. Use PROFESSIONAL fonts (not hand-written)
3. Apply the ${style.toUpperCase()} style consistently
4. Include ALL text content provided
5. Create a design that looks professionally made
6. Keep the same element positions as the sketch
7. Make it look like a real poster, not a mockup
`;

  return [
    {
      name: "ðŸŽ¯ Layout Faithful",
      prompt: `${basePrompt}

VARIATION: LAYOUT FAITHFUL
Strictly follow the sketch layout while applying professional styling.
The positioning of elements should match the sketch exactly.
Focus on clean execution of the sketched composition.`
    },
    {
      name: "âœ¨ Enhanced",
      prompt: `${basePrompt}

VARIATION: ENHANCED
Follow the sketch layout but IMPROVE the composition.
Add subtle enhancements: better spacing, refined alignment.
Make it look even more professional than the sketch suggested.`
    },
    {
      name: "ðŸ”¥ Bold Statement",
      prompt: `${basePrompt}

VARIATION: BOLD STATEMENT
Follow the sketch layout but make the headline MORE IMPACTFUL.
Increase the visual weight of the main message.
The headline should grab attention immediately.`
    },
    {
      name: "ðŸŽ¨ Creative Twist",
      prompt: `${basePrompt}

VARIATION: CREATIVE TWIST
Use the sketch as inspiration but add a creative element.
Keep the core layout but add one unexpected visual element.
Make it memorable while staying true to the sketch's intent.`
    }
  ];
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ðŸ“¦ PRODUCT-TO-POSTER - Product Ð·ÑƒÑ€Ð³Ð°Ð°Ñ Ð¼Ð°Ñ€ÐºÐµÑ‚Ð¸Ð½Ð³Ð¸Ð¹Ð½ poster Ò¯Ò¯ÑÐ³ÑÑ…
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function generateProductToPosterPrompts(
  productInputs?: ProductInputs,
  productCampaign?: string,
  productStyle?: string,
  productInfo?: ProductInfo
): Array<{name: string, prompt: string}> {

  const headline = productInputs?.headline || "HEADLINE";
  const subheadline = productInputs?.subheadline || "";
  const price = productInputs?.price || "";
  const cta = productInputs?.cta || "";
  const brand = productInputs?.brand || productInfo?.brand_detected || "";
  const campaign = productCampaign || "awareness";
  const style = productStyle || "premium";

  // Style-specific guidelines
  const styleGuides: Record<string, string> = {
    fun: `
FUN STYLE:
- Bright palette (pink, yellow, orange, cyan)
- Playful rounded fonts
- Light 3D/cartoon accents
- Energetic, youthful
- Confetti/sparkles only if NOT cluttered`,
    premium: `
PREMIUM STYLE:
- Dark background (black, navy, deep gray)
- Gold/silver/copper accent
- Elegant serif or thin sans-serif
- Soft dramatic lighting
- Subtle reflections/shadows
- Luxury feel`,
    athletic: `
ATHLETIC STYLE:
- High energy colors (orange, red, electric blue)
- Bold dynamic typography
- Motion hints (speed lines, splashes)
- Strong diagonals`,
    eco: `
ECO STYLE:
- Earth tones (green, brown, cream)
- Organic textures (wood, leaves, linen)
- Natural lighting
- Clean, sustainable aesthetic`,
    minimal: `
MINIMAL STYLE:
- Clean white/light gray background
- 2-3 colors max
- Modern sans-serif
- 70%+ white space
- Product as hero, subtle shadows`,
    bold: `
BOLD STYLE:
- High contrast (black/yellow, red/white)
- Extra-large typography
- Geometric shapes only
- Impact over subtlety`
  };

  // Campaign-specific elements
  const campaignGuides: Record<string, string> = {
    awareness: `CAMPAIGN: BRAND AWARENESS
- Focus on product beauty and brand identity
- Emotional connection
- Brand name present but calm`,
    launch: `CAMPAIGN: PRODUCT LAUNCH
- "NEW/INTRODUCING" energy
- Clean reveal moment
- Spotlight on product`,
    sale: `CAMPAIGN: SALE/DISCOUNT
- Price/discount very visible
- Urgency and excitement
- Strong accent for urgency`,
    seasonal: `CAMPAIGN: SEASONAL
- Match the season mood and palette
- Timely, relevant feeling`
  };

  // Target audience adaptation
  const audienceGuide = productInfo ? `
TARGET AUDIENCE ADAPTATION:
â€¢ Age: ${productInfo.target_demographic.age_range}
  ${productInfo.target_demographic.age_range === 'kids' ? 'â†’ COLORFUL, FUN, 3D CARTOON style!' : ''}
  ${productInfo.target_demographic.age_range === 'teens' ? 'â†’ TRENDY, BOLD, SOCIAL MEDIA style!' : ''}
  ${productInfo.target_demographic.age_range === 'young_adults' ? 'â†’ MODERN, ASPIRATIONAL style!' : ''}
  ${productInfo.target_demographic.age_range === 'adults' ? 'â†’ SOPHISTICATED, PREMIUM style!' : ''}
â€¢ Gender: ${productInfo.target_demographic.gender}
â€¢ Lifestyle: ${productInfo.target_demographic.lifestyle}
â€¢ Product type: ${productInfo.product_type}
â€¢ Price tier: ${productInfo.price_positioning}
` : "";

  const productInsights = productInfo ? `
PRODUCT INSIGHTS (use for emphasis only; do NOT invent):
${productInfo.primary_claim ? `â€¢ Primary claim: ${productInfo.primary_claim}` : ""}
${productInfo.key_features?.length ? `â€¢ Key features: ${productInfo.key_features.join(", ")}` : ""}
${productInfo.benefits?.length ? `â€¢ Benefits: ${productInfo.benefits.join(", ")}` : ""}
${productInfo.differentiators?.length ? `â€¢ Differentiators: ${productInfo.differentiators.join(", ")}` : ""}
${productInfo.reasons_to_believe?.length ? `â€¢ Reasons to believe: ${productInfo.reasons_to_believe.join(", ")}` : ""}
` : "";

  const textContent = `
TEXT TO INCLUDE (exact text, no new copy):
â€¢ Headline: "${headline}"
${subheadline ? `â€¢ Subheadline: "${subheadline}"` : ""}
${price ? `â€¢ Price/Discount: "${price}"` : ""}
${cta ? `â€¢ CTA: "${cta}"` : ""}
${brand ? `â€¢ Brand: "${brand}"` : ""}`;

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // ðŸš« ANTI-CANVA DIRECTIVE - What makes posters look CHEAP
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const antiCanvaRules = `
ANTI-CANVA RULES (FAIL IF BROKEN):
- ONE product only
- No generic gradients, clipart, or random shapes
- No "floating product" stock-template look
- 2 font families max, 3 colors max
- 60%+ empty space
- Asymmetric, editorial composition
- Must feel curated, not templated`;

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // âœ¨ PREMIUM REFERENCE - What makes posters look EXPENSIVE
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const premiumReference = `
PREMIUM REFERENCES:
- Apple: product as hero, negative space, dramatic lighting
- Aesop/Le Labo: editorial, tactile, refined typography
- Nike: bold but clean, strong hierarchy
Lighting: dramatic side light, rim light, soft shadows
Composition: 60-70% negative space, asymmetric balance`;

  const basePrompt = `
PRODUCT-TO-POSTER: Create a premium marketing poster.
${antiCanvaRules}
${premiumReference}

PRODUCT CONTEXT:
${audienceGuide}
${productInsights}

TEXT:
${textContent}

STYLE:
${styleGuides[style] || styleGuides.premium}

CAMPAIGN:
${campaignGuides[campaign] || campaignGuides.awareness}

LAYOUT (STRICT):
- Use a 12-column grid with full-bleed composition (edge-to-edge; no outer margins or frames)
- Choose ONE:
  A) Product left (cols 1-6), text right (cols 8-12)
  B) Product right (cols 7-12), text left (cols 1-5)
  C) Product centered, text bottom-left
- 50-70% negative space
`;

  return [
    {
      name: "ðŸŽ¯ Hero Product Spotlight",
      prompt: `${basePrompt}

VARIATION: HERO PRODUCT SPOTLIGHT
- Product dominates the frame, clean silhouette
- High contrast, crisp edges, no clutter
- Bold CTA and key benefit near the hero
- 60-70% negative space, strong hierarchy
- Modern sans-serif, confident weight
Feeling: "Flagship launch moment."`
    },
    {
      name: "ðŸ§¼ Minimal Tech Clean",
      prompt: `${basePrompt}

VARIATION: MINIMAL TECH CLEAN
- Single product, slight offset center
- Pure white or deep charcoal background, no gradient
- Soft rim light + subtle shadow
- 75% empty space, text in one corner only
- Thin sans-serif with wide tracking
Feeling: "Premium tech, effortless."`
    },
    {
      name: "ðŸ“… Event Hype Poster",
      prompt: `${basePrompt}

VARIATION: EVENT HYPE POSTER
- Product or key visual as hero, angled for energy
- Date/time/location pulled from TEXT and highlighted
- Dynamic diagonal typography, bold accents
- Vibrant contrast background, punchy color pop
- Clear CTA (register/buy/learn more)
Feeling: "Can't-miss event energy."`
    },
    {
      name: "âœ¨ Luxury Matte",
      prompt: `${basePrompt}

VARIATION: LUXURY MATTE
- Product on refined surface (stone, matte paper, linen)
- Warm neutral background (cream, beige, taupe)
- One subtle prop only, understated
- 60% negative space, soft window light
- Elegant serif headline, deep brown/charcoal
Feeling: "Quiet luxury, premium tactile."`
    }
  ];
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ðŸ§  UNDERSTANDING-BASED REDESIGN - Poster-Ð¸Ð¹Ð½ Ð“ÐžÐ› Ð¡ÐÐÐÐÐ“ Ð¾Ð¹Ð»Ð³Ð¾Ð¾Ð´ Ñ…Ò¯Ñ‡Ð¸Ñ€Ñ…ÑÐ³Ð¶Ò¯Ò¯Ð»ÑÑ…
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function generateUnderstandingPrompts(analysisResult: any): Array<{name: string, prompt: string}> {
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // ðŸ§  INTELLIGENT POSTER UNDERSTANDING SYSTEM
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  //
  // Step 1: UNDERSTAND what type of poster this is
  // Step 2: UNDERSTAND what message it wants to communicate
  // Step 3: Generate TAILORED prompts for that specific type
  //
  // RHYTHM + FLAT DESIGN applies to ALL types
  // But the VISUAL APPROACH changes based on poster type
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  const intentProfile = analysisResult?.intent_profile;
  const preferenceSignals = analysisResult?.user_preference_signals;
  const productInfo = analysisResult?.product_info;

  const theirVisionBase = analysisResult?.their_vision || analysisResult?.feedback?.overall || "";
  const intentParts: string[] = [];
  if (intentProfile?.primary_message) intentParts.push(`Primary message: ${intentProfile.primary_message}`);
  if (intentProfile?.goal) intentParts.push(`Goal: ${intentProfile.goal}`);
  if (intentProfile?.target_audience) intentParts.push(`Audience: ${intentProfile.target_audience}`);
  if (intentProfile?.desired_emotion) intentParts.push(`Desired feeling: ${intentProfile.desired_emotion}`);
  if (intentProfile?.cta && intentProfile.cta !== "none") intentParts.push(`CTA: ${intentProfile.cta}`);
  if (intentProfile?.brand_tone) intentParts.push(`Tone: ${intentProfile.brand_tone}`);
  if (intentProfile?.what_they_want_to_show) intentParts.push(`Show: ${intentProfile.what_they_want_to_show}`);

  const intentBlock = intentParts.length ? `INTENT:\n${intentParts.join("\n")}` : "";

  const preferenceParts: string[] = [];
  if (preferenceSignals?.style_bias) preferenceParts.push(`Style bias: ${preferenceSignals.style_bias}`);
  if (preferenceSignals?.color_bias) preferenceParts.push(`Color bias: ${preferenceSignals.color_bias}`);
  if (preferenceSignals?.composition_bias) preferenceParts.push(`Composition bias: ${preferenceSignals.composition_bias}`);
  if (preferenceSignals?.type_bias) preferenceParts.push(`Type bias: ${preferenceSignals.type_bias}`);
  const preferenceBlock = preferenceParts.length ? `PREFERENCE SIGNALS:\n${preferenceParts.join("\n")}` : "";

  const productParts: string[] = [];
  if (productInfo?.product_type) productParts.push(`Product: ${productInfo.product_type}`);
  if (productInfo?.benefits?.length) productParts.push(`Benefits: ${productInfo.benefits.join(", ")}`);
  if (productInfo?.differentiators?.length) productParts.push(`Differentiators: ${productInfo.differentiators.join(", ")}`);
  if (productInfo?.primary_claim) productParts.push(`Primary claim: ${productInfo.primary_claim}`);
  const productBlock = productParts.length ? `PRODUCT INSIGHTS:\n${productParts.join("\n")}` : "";

  const theirVision = [theirVisionBase, intentBlock, preferenceBlock, productBlock].filter(Boolean).join("\n");
  const coreFeeling =
    intentProfile?.desired_emotion ||
    analysisResult?.steal_from?.feeling_detected ||
    analysisResult?.emotional_analysis?.intended_emotion ||
    "";
  const soulElements = analysisResult?.emotional_analysis?.soul_elements?.join(", ") || "";
  const analysisText = JSON.stringify(analysisResult || {}).toLowerCase();

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // ðŸ” DETECT POSTER TYPE - What is this poster trying to do?
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  type PosterCategory = "christmas" | "greeting" | "educational" | "gaming" | "event" | "product" | "kids" | "general";

  function detectPosterCategory(): PosterCategory {
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // ðŸŽ„ CHRISTMAS - Check FIRST! Christmas is NOT generic greeting!
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    const christmasKeywords = ["christmas", "xmas", "Ð·ÑƒÐ» ÑÐ°Ñ€", "Ð·ÑƒÐ» ÑÐ°Ñ€Ñ‹Ð½", "santa", "snowflake",
      "Ñ†Ð°Ñ", "snow", "reindeer", "december", "12-Ñ€ ÑÐ°Ñ€", "12 ÑÐ°Ñ€", "holiday season", "new year",
      "ÑˆÐ¸Ð½Ñ Ð¶Ð¸Ð»", "stocking", "candy cane", "ornament", "pine", "Ð³Ð°Ñ†ÑƒÑƒÑ€", "winter", "Ó©Ð²Ó©Ð»",
      "jingle", "bells", "mistletoe", "gift", "Ð±ÑÐ»ÑÐ³", "festive", "Ñ…Ð¾Ð½Ñ…", "merry", "carol",
      "wreath", "Ñ‘Ð»ÐºÐ°", "Ð½Ð°Ñ€Ñ", "red and green", "Ð³ÑÑ€ÑÐ» Ñ‡Ð¸Ð¼ÑÐ³Ð»ÑÐ»", "december 12", "12-Ñ€ ÑÐ°Ñ€Ñ‹Ð½"];

    let christmasScore = 0;
    christmasKeywords.forEach(kw => { if (analysisText.includes(kw)) christmasScore++; });

    // If ANY Christmas keyword found - it's CHRISTMAS, not generic greeting!
    if (christmasScore >= 1) {
      console.log(`ðŸŽ„ CHRISTMAS DETECTED! Score: ${christmasScore}`);
      return "christmas";
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // ðŸ§’ KIDS/CHILDREN - Check SECOND! Colorful, playful, 3D cartoon style
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    const kidsKeywords = ["back to school", "school", "ÑÑƒÑ€Ð³ÑƒÑƒÐ»ÑŒ", "children", "Ñ…Ò¯Ò¯Ñ…ÑÐ´", "kids",
      "cartoon", "3d", "colorful", "playful", "fun", "adventure", "rocket", "Ð¿ÑƒÑƒÐ¶Ð¸Ð½",
      "backpack", "Ñ†Ò¯Ð½Ñ…", "pencil", "Ñ…Ð°Ñ€Ð°Ð½Ð´Ð°Ð°", "toy", "Ñ‚Ð¾Ð³Ð»Ð¾Ð¾Ð¼", "piggy bank", "saving",
      "learning", "dream", "Ð¼Ó©Ñ€Ó©Ó©Ð´Ó©Ð»", "cloud", "Ò¯Ò¯Ð»", "bright", "Ñ‚Ð¾Ð´ Ó©Ð½Ð³Ó©", "Ñ…Ó©Ð³Ð¶Ð¸Ð»Ñ‚ÑÐ¹"];

    let kidsScore = 0;
    kidsKeywords.forEach(kw => { if (analysisText.includes(kw)) kidsScore++; });

    // Check for visual style indicators (3D, colorful, cartoon)
    if (analysisText.includes("3d") || analysisText.includes("cartoon") ||
        analysisText.includes("colorful") || analysisText.includes("playful") ||
        (analysisText.includes("school") && analysisText.includes("backpack"))) {
      kidsScore += 3; // Boost score for visual style
    }

    if (kidsScore >= 2) {
      console.log(`ðŸ§’ KIDS/CHILDREN DETECTED! Score: ${kidsScore}`);
      return "kids";
    }

    // GREETING: flowers, thank you, birthday, Valentine's, Mother's day, etc (NOT Christmas!)
    const greetingKeywords = ["thank", "Ð±Ð°ÑÑ€Ð»Ð°Ð»Ð°Ð°", "flower", "Ñ†ÑÑ†ÑÐ³", "birthday", "Ñ‚Ó©Ñ€ÑÓ©Ð½ Ó©Ð´Ó©Ñ€",
      "Ð±Ð°ÑÑ€", "Ð¼ÑÐ½Ð´ Ñ…Ò¯Ñ€Ð³Ñ", "greeting", "congratulat", "love", "Ñ…Ð°Ð¹Ñ€", "mother", "father",
      "valentine", "happy", "wish", "blessing", "anniversary", "Ð¾Ð¹"];

    // EDUCATIONAL: design thinking, process, learn, how to, steps, Ð¼ÐµÑ‚Ð¾Ð´Ð¾Ð»Ð¾Ð³
    const educationalKeywords = ["design thinking", "process", "learn", "how to", "steps",
      "method", "tutorial", "guide", "principle", "concept", "understand", "empathy", "empathize",
      "define", "ideate", "prototype", "test", "skill", "technique", "ÑÑƒÑ€Ð³Ð°Ð»Ñ‚", "Ð°Ñ€Ð³Ð°"];

    // GAMING: game, counter-strike, play, gaming, level, score, battle, Ñ‚Ð¾Ð³Ð»Ð¾Ð¾Ð¼
    const gamingKeywords = ["game", "gaming", "counter-strike", "counter strike", "play",
      "level", "score", "battle", "Ñ‚Ð¾Ð³Ð»Ð¾Ð¾Ð¼", "Ñ‚Ð¾Ð³Ð»Ð¾Ð³Ñ‡", "winner", "champion", "esport",
      "fps", "shooter", "æˆ˜", "éŠæˆ²", "gamer"];

    // EVENT: date, location, speaker, seminar, workshop, conference, Ð°Ñ€Ð³Ð° Ñ…ÑÐ¼Ð¶ÑÑ
    const eventKeywords = ["event", "Ð¾Ð³Ð½Ð¾Ð¾", "location", "Ð±Ð°Ð¹Ñ€ÑˆÐ¸Ð»", "speaker",
      "seminar", "workshop", "conference", "Ð°Ñ€Ð³Ð° Ñ…ÑÐ¼Ð¶ÑÑ", "Ð·Ð°Ñ€Ð»Ð°Ð»", "announcement", "register"];

    // PRODUCT: sale, price, discount, product, buy, shop, Ñ…ÑƒÐ´Ð°Ð»Ð´Ð°Ð°, Ò¯Ð½Ñ
    const productKeywords = ["sale", "price", "Ò¯Ð½Ñ", "discount", "Ñ…ÑÐ¼Ð´Ñ€Ð°Ð»", "%", "product",
      "Ð±Ò¯Ñ‚ÑÑÐ³Ð´ÑÑ…Ò¯Ò¯Ð½", "buy", "Ñ…ÑƒÐ´Ð°Ð»Ð´Ð°Ð°", "shop", "offer", "deal"];

    let greetingScore = 0, educationalScore = 0, gamingScore = 0, eventScore = 0, productScore = 0;

    greetingKeywords.forEach(kw => { if (analysisText.includes(kw)) greetingScore++; });
    educationalKeywords.forEach(kw => { if (analysisText.includes(kw)) educationalScore++; });
    gamingKeywords.forEach(kw => { if (analysisText.includes(kw)) gamingScore++; });
    eventKeywords.forEach(kw => { if (analysisText.includes(kw)) eventScore++; });
    productKeywords.forEach(kw => { if (analysisText.includes(kw)) productScore++; });

    console.log(`ðŸ“Š Poster category scores: Greeting=${greetingScore}, Educational=${educationalScore}, Gaming=${gamingScore}, Event=${eventScore}, Product=${productScore}`);

    const maxScore = Math.max(greetingScore, educationalScore, gamingScore, eventScore, productScore);

    if (maxScore === 0) return "general";
    if (greetingScore === maxScore) return "greeting";
    if (educationalScore === maxScore) return "educational";
    if (gamingScore === maxScore) return "gaming";
    if (eventScore === maxScore) return "event";
    if (productScore === maxScore) return "product";

    return "general";
  }

  const posterCategory = detectPosterCategory();
  console.log(`ðŸŽ¯ DETECTED POSTER CATEGORY: ${posterCategory.toUpperCase()}`);
  console.log(`ðŸ’­ Poster Vision: ${theirVision.slice(0, 100)}...`);

  // INTENT-FIRST REDESIGN (new): Use intent + preference signals if available
  if (intentProfile || preferenceSignals || productInfo) {
    const safeJoin = (items?: string[]) => (items && items.length ? items.join(", ") : "");
    const mustKeep = safeJoin(analysisResult?.what_must_stay);
    const mustChange = safeJoin(analysisResult?.what_must_change);
    const soulLine = soulElements ? `Soul elements: ${soulElements}` : "";

    const categoryHints: Record<PosterCategory, string> = {
      event: "Highlight date/time/location and make the CTA obvious.",
      product: "Make the product the hero and surface 1-2 key benefits.",
      greeting: "Make the message warm and personal; reduce visual noise.",
      educational: "Clarify steps/structure and make learning flow clear.",
      gaming: "Add energy and contrast while keeping hierarchy tight.",
      kids: "Keep it playful and friendly; simple, bold shapes.",
      christmas: "Warm, festive, and celebratory; keep it joyful.",
      general: "Focus on the single most important message."
    };

    const preferenceLine = [
      preferenceSignals?.style_bias ? `Style bias: ${preferenceSignals.style_bias}` : "",
      preferenceSignals?.color_bias ? `Color bias: ${preferenceSignals.color_bias}` : "",
      preferenceSignals?.composition_bias ? `Composition bias: ${preferenceSignals.composition_bias}` : "",
      preferenceSignals?.type_bias ? `Type bias: ${preferenceSignals.type_bias}` : ""
    ].filter(Boolean).join(" | ");

    const productLine = productInfo?.product_type
      ? `Product: ${productInfo.product_type}${productInfo.primary_claim ? ` (${productInfo.primary_claim})` : ""}`
      : "";

    const intentBrief = `
INTENT BRIEF:
Goal: ${intentProfile?.goal || "unknown"}
Primary message: ${intentProfile?.primary_message || "unknown"}
What to show: ${intentProfile?.what_they_want_to_show || "unknown"}
Desired feeling: ${intentProfile?.desired_emotion || coreFeeling || "unknown"}
Audience: ${intentProfile?.target_audience || "unknown"}
CTA: ${intentProfile?.cta || "none"}
Tone: ${intentProfile?.brand_tone || "unknown"}
${preferenceLine ? `Preferences: ${preferenceLine}` : ""}
${productLine}
${mustKeep ? `Must keep: ${mustKeep}` : ""}
${mustChange ? `Must change: ${mustChange}` : ""}
${soulLine}
Category focus: ${categoryHints[posterCategory]}
`;

    const baseRedesign = `
UNDERSTANDING-BASED REDESIGN (INTENT-FIRST)
This is a transformation of the existing poster, not a new concept.
Keep ALL original text and brand marks EXACT. You may rebuild the layout.
${intentBrief}
`;

    return [
      {
        name: "Message First Reset",
        prompt: `${baseRedesign}
Make the main message impossible to miss and remove everything that distracts from it.
Use one clear hierarchy: headline first, support second, CTA last, with generous breathing room.
The viewer should understand the purpose instantly and feel the intended emotion.`
      },
      {
        name: "Hero + CTA Focus",
        prompt: `${baseRedesign}
Create a strong hero focal point (product/person/event title) and anchor the layout around it.
Bring the CTA and key details into a single clear block with high contrast.
The viewer should know what to do in 3 seconds.`
      },
      {
        name: "Mood Match",
        prompt: `${baseRedesign}
Match the desired emotion through lighting, palette, and typography choices.
Keep the layout simple and calm while amplifying the feeling.
The viewer should feel exactly what the poster is trying to communicate.`
      },
      {
        name: "Premium Craft Grid",
        prompt: `${baseRedesign}
Rebuild on a clean grid with disciplined alignment and refined typography.
Increase whitespace and reduce visual noise until it feels premium and intentional.
The viewer should sense quality and trust at first glance.`
      }
    ];
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // ðŸŽ¨ CATEGORY-SPECIFIC PROMPTS - Tailored to poster's PURPOSE
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // Common style rules for ALL categories
  const RHYTHM_FLAT_RULES = `
ðŸŽµ RHYTHM RULES (ALL POSTERS):
â€¢ Typography: tiny intro â†’ MASSIVE KEYWORD (3x bigger!) â†’ small support
â€¢ Visual: simple shapes, ONE element pops with accent color
â€¢ Maximum 4-5 elements total - less is more

ðŸŽ¨ FLAT DESIGN RULES (ALL POSTERS):
â€¢ NO realistic/complex illustrations - only GEOMETRIC shapes
â€¢ Simple icons, lines, circles, arrows
â€¢ ONE accent color only (orange, red, or themed color)
â€¢ Solid clean background (white, cream, or themed)
â€¢ Clean, minimal, breathable

LAYOUT SYSTEM (ALL POSTERS):
- Use full-bleed layout: background and composition must touch all canvas edges (no safe-area margins)
- Use a grid; align edges and baselines
- Type scale: Hero 100%, Subhead 45-60%, Support 20-30%
- 2 font families max, 2 weights max
- 2-3 colors max, 1 accent max
- 50-70% negative space`;


  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // ðŸŽ® GAMING CATEGORY - Dynamic, bold, exciting
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  if (posterCategory === "gaming") {
    console.log("ðŸŽ® Generating GAMING-specific prompts...");
    return [
      {
        name: "ðŸŽ® Gaming Bold",
        prompt: `ðŸŽ¨ GAMING POSTER REDESIGN: ðŸŽ® BOLD GAMING STYLE

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸŽ® THIS IS A GAMING POSTER - Make it EXCITING and BOLD!
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

POSTER MESSAGE:
${theirVision}

FEELING:
${coreFeeling}

${RHYTHM_FLAT_RULES}

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸŽ® GAMING STYLE - Bold, Dynamic, Exciting
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

GAMING VISUAL ELEMENTS (FLAT STYLE):
â€¢ Crosshairs/targets ðŸŽ¯ (simple circles with cross)
â€¢ Controllers (simple flat icon)
â€¢ Helmets (simple geometric)
â€¢ Bullets/ammo (simple shapes)
â€¢ Stars, badges (flat geometric)

COLOR SCHEME:
â€¢ Dark background (black, dark green, military)
â€¢ Accent: orange, gold, or neon green
â€¢ High contrast for excitement

TYPOGRAPHY:
â€¢ MASSIVE game/title name
â€¢ Bold, impactful fonts
â€¢ Military or tech style

VISUAL APPROACH:
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â”‚
â”‚â–“â–“â–“  small intro                            â–“â–“â–“â”‚
â”‚â–“â–“â–“  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆ       â–“â–“â–“â”‚
â”‚â–“â–“â–“  â–ˆâ–ˆ  GAME TITLE (MASSIVE)  â–ˆâ–ˆ           â–“â–“â–“â”‚
â”‚â–“â–“â–“  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆ       â–“â–“â–“â”‚
â”‚â–“â–“â–“  small tagline                          â–“â–“â–“â”‚
â”‚â–“â–“â–“                                         â–“â–“â–“â”‚
â”‚â–“â–“â–“     ðŸŽ¯  ðŸŽ®  â­  (flat gaming icons)      â–“â–“â–“â”‚
â”‚â–“â–“â–“                                         â–“â–“â–“â”‚
â”‚â–“â–“â–“  GREETING/MESSAGE (if any)              â–“â–“â–“â”‚
â”‚â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

ðŸŽ¯ GOAL: Exciting, bold, gaming aesthetic with RHYTHM!`
      },
      {
        name: "ðŸŽ¯ Target Stand Out",
        prompt: `ðŸŽ¨ GAMING POSTER REDESIGN: ðŸŽ¯ TARGET STAND OUT

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸŽ® THIS IS A GAMING POSTER - Use TARGET/CROSSHAIR visual!
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

POSTER MESSAGE:
${theirVision}

${RHYTHM_FLAT_RULES}

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸŽ¯ TARGET STAND OUT - Crosshairs with ONE highlighted
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

CONCEPT: Row of crosshair/target icons, ONE stands out.
Like the matchstick poster but with gaming targets!

VISUAL:
ðŸŽ¯ðŸŽ¯ðŸŽ¯ðŸŽ¯ðŸŽ¯ðŸŽ¯ðŸŽ¯ â† all gray/dark
              ðŸŸ  â† ONE is accent color!

STYLE:
â€¢ Light or dark background
â€¢ Simple flat crosshair icons in a row
â€¢ All same color EXCEPT ONE
â€¢ MASSIVE title above
â€¢ Message below

VISUAL APPROACH:
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                                                 â”‚
â”‚  small intro                                    â”‚
â”‚  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆ               â”‚
â”‚  â–ˆâ–ˆ    GAME TITLE (MASSIVE)    â–ˆâ–ˆ               â”‚
â”‚  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆ               â”‚
â”‚  tagline text                                   â”‚
â”‚                                                 â”‚
â”‚     ðŸŽ¯ ðŸŽ¯ ðŸŽ¯ ðŸŽ¯ ðŸŽ¯ ðŸŽ¯ ðŸŽ¯  â† ONE orange!           â”‚
â”‚                                                 â”‚
â”‚  GREETING MESSAGE                               â”‚
â”‚                                                 â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

ðŸŽ¯ GOAL: Gaming targets with ONE standing out!`
      },
      {
        name: "ðŸ† Victory Flow",
        prompt: `ðŸŽ¨ GAMING POSTER REDESIGN: ðŸ† VICTORY FLOW

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸŽ® THIS IS A GAMING POSTER - Show the path to VICTORY!
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

POSTER MESSAGE:
${theirVision}

${RHYTHM_FLAT_RULES}

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸ† VICTORY FLOW - Journey to winning
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

CONCEPT: Visual flow showing gaming journey.
Start â†’ Play â†’ Win progression.

GAMING FLOW IDEAS:
â€¢ Controller â†’ Target â†’ Trophy
â€¢ Helmet â†’ Weapon â†’ Victory
â€¢ Practice â†’ Battle â†’ Champion
â€¢ â—‹â—‹â—‹â—‹â— progress circles

VISUAL APPROACH:
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                                                 â”‚
â”‚  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆ               â”‚
â”‚  â–ˆâ–ˆ    GAME TITLE (MASSIVE)    â–ˆâ–ˆ               â”‚
â”‚  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆ               â”‚
â”‚                                                 â”‚
â”‚     ðŸŽ® â”€â”€â†’ ðŸŽ¯ â”€â”€â†’ ðŸ†                            â”‚
â”‚    (start)  (play)  (win)                       â”‚
â”‚                                                 â”‚
â”‚  â˜… GREETING MESSAGE â˜…                           â”‚
â”‚                                                 â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

ðŸŽ¯ GOAL: Gaming journey flow to victory!`
      },
      {
        name: "â­ Military Honor",
        prompt: `ðŸŽ¨ GAMING POSTER REDESIGN: â­ MILITARY HONOR

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸŽ® THIS IS A GAMING/MILITARY POSTER - Honor and respect style!
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

POSTER MESSAGE:
${theirVision}

${RHYTHM_FLAT_RULES}

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
â­ MILITARY HONOR - Respectful, strong, proud
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

CONCEPT: Military honor aesthetic with stars and badges.
Strong, proud, respectful design.

MILITARY ELEMENTS (FLAT):
â€¢ Stars â­ (simple 5-point)
â€¢ Badges (simple geometric shapes)
â€¢ Stripes, bars
â€¢ Laurel wreaths (simple lines)

COLOR SCHEME:
â€¢ Green (military) or dark background
â€¢ Gold/orange accents for honor
â€¢ White text for contrast

VISUAL APPROACH:
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                                                 â”‚
â”‚           â­â­â­                                 â”‚
â”‚                                                 â”‚
â”‚  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆ               â”‚
â”‚  â–ˆâ–ˆ    TITLE (MASSIVE)    â–ˆâ–ˆ                    â”‚
â”‚  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆ               â”‚
â”‚                                                 â”‚
â”‚        â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•                      â”‚
â”‚        â˜… HONOR MESSAGE â˜…                        â”‚
â”‚        â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•                      â”‚
â”‚                                                 â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

ðŸŽ¯ GOAL: Military honor with stars and respect!`
      }
    ];
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // ðŸŽ„ CHRISTMAS - ELEVATE the original! Keep core element, improve everything!
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    if (posterCategory === "christmas") {
    console.log("CHRISTMAS ELEVATION - Keep core element, improve everything!");

    return [
      {
        name: "?? Elegant Gift",
        prompt: `CHRISTMAS POSTER ELEVATION

GOAL: Keep the main holiday element (gift/stocking/tree). Simplify and elevate.
LAYOUT:
- Small logo at top
- Hero element centered and large
- Big headline, smaller supporting line
- Optional CTA at bottom

STYLE:
- Clean background (solid or soft gradient)
- Limited palette (red/green/gold or modern neutral + accent)
- Clear hierarchy, high readability
- Remove clutter, keep only essentials

IMPORTANT: Do NOT remove the hero element.`
      },
      {
        name: "? Warm Glow",
        prompt: `CHRISTMAS POSTER ELEVATION - WARM GLOW

GOAL: Keep the hero element and add a warm, premium glow.
LOOK & FEEL:
- Deep burgundy or midnight base
- Warm gold highlights and soft glow
- Cozy, inviting, premium holiday mood

LAYOUT:
- Center hero element with soft halo
- Large headline, small supporting text
- Minimal decoration (subtle sparkles only)

IMPORTANT: Keep the hero element intact. No clutter.`
      },
      {
        name: "?? Minimal Snow",
        prompt: `CHRISTMAS POSTER ELEVATION - MINIMAL CLEAN

GOAL: Ultra-clean Christmas poster with lots of breathing room.
STYLE:
- 60-70% whitespace
- Single hero element
- Black/charcoal text with one accent color
- No extra icons or ornaments

LAYOUT:
- Hero element centered
- Big headline
- Small brand mark

IMPORTANT: Keep the main element. Remove everything else.`
      },
      {
        name: "?? Holiday Cheer",
        prompt: `CHRISTMAS POSTER ELEVATION - HOLIDAY CHEER

GOAL: Festive energy without chaos.
STYLE:
- Bright but controlled palette (red/green/gold)
- Confetti/sparkles in small quantity
- Playful but clean composition

LAYOUT:
- Hero element centered and dominant
- Large headline with strong hierarchy
- Secondary details small and minimal

IMPORTANT: Keep the hero element. Do not overcrowd.`
      }
    ];
  }

  if (posterCategory === "kids") {
    console.log("?? KIDS POSTER DETECTED - Keeping FUN, COLORFUL, 3D CARTOON style!");
    console.log("?? NOT using flat design - kids need FUN visuals!");

    return [
      {
        name: "?? Adventure Burst",
        prompt: `?? KIDS POSTER ELEVATION - ADVENTURE

CRITICAL RULES:
- Keep 3D cartoon style. NO flat design.
- Keep bright, saturated colors.
- Keep playful elements (rockets, backpacks, coins, stars).

POSTER MESSAGE:
${theirVision}

CORE FEELING:
${coreFeeling}

IMPROVE:
- Stronger hierarchy on the main text
- More dynamic layout and motion
- Bolder, more energetic color contrast

GOAL: Fun, adventurous, high-energy kids poster in 3D cartoon style.`
      },
      {
        name: "?? Vibrant Colors",
        prompt: `?? KIDS POSTER ELEVATION - VIBRANT COLORS

CRITICAL RULES:
- Keep 3D cartoon style. NO flat design.
- Push color saturation and contrast.
- Keep playful, child-friendly shapes.

POSTER MESSAGE:
${theirVision}

CORE FEELING:
${coreFeeling}

IMPROVE:
- More vivid palette
- Brighter background gradient
- Stronger glow and highlights on 3D text

GOAL: Super colorful, joyful kids poster with lively 3D energy.`
      },
      {
        name: "? Sparkle & Shine",
        prompt: `?? KIDS POSTER ELEVATION - SPARKLE & SHINE

CRITICAL RULES:
- Keep 3D cartoon style. NO flat design.
- Add sparkle, glow, and shine effects.
- Keep playful, magical mood.

POSTER MESSAGE:
${theirVision}

CORE FEELING:
${coreFeeling}

IMPROVE:
- Add sparkle highlights on text and key elements
- Soft glow around hero elements
- Maintain clean, readable hierarchy

GOAL: Magical, shiny kids poster that feels exciting and fun.`
      },
      {
        name: "?? Playful Layout",
        prompt: `?? KIDS POSTER ELEVATION - PLAYFUL LAYOUT

CRITICAL RULES:
- Keep 3D cartoon style. NO flat design.
- Dynamic composition (angled, lively, not static).
- Keep bright, kid-friendly colors.

POSTER MESSAGE:
${theirVision}

CORE FEELING:
${coreFeeling}

IMPROVE:
- Tilted/angled elements for motion
- Strong visual rhythm
- Clear hierarchy with playful balance

GOAL: Dynamic, playful kids poster with bold 3D energy.`
      }
    ];
  }

// Helper function to extract short message - use ACTUAL poster text, not analysis description
  function extractShortMessage(analysis: any): string {
    // Priority 1: Look for actual detected text from poster
    const detectedText = analysis?.detected_text || analysis?.text_elements || "";
    const allText = typeof detectedText === "string" ? detectedText : JSON.stringify(detectedText);

    // Priority 2: Look for core message in analysis
    const coreMessage = analysis?.core_message || analysis?.main_message || "";

    const searchText = (allText + " " + coreMessage).toLowerCase();

    // Christmas greeting patterns - return appropriate SHORT message
    if (searchText.includes("Ð·ÑƒÐ» ÑÐ°Ñ€") || searchText.includes("christmas") || searchText.includes("xmas")) {
      return "MERRY CHRISTMAS";
    }
    if (searchText.includes("ÑˆÐ¸Ð½Ñ Ð¶Ð¸Ð»") || searchText.includes("new year")) {
      return "HAPPY NEW YEAR";
    }
    if (searchText.includes("Ð±Ð°ÑÑ€Ð»Ð°Ð»Ð°Ð°") || searchText.includes("thank")) {
      return "THANK YOU";
    }
    if (searchText.includes("12-Ñ€ ÑÐ°Ñ€") || searchText.includes("december") || searchText.includes("12 ÑÐ°Ñ€")) {
      return "HAPPY HOLIDAYS";
    }
    if (searchText.includes("happy holiday")) {
      return "HAPPY HOLIDAYS";
    }
    if (searchText.includes("merry christmas")) {
      return "MERRY CHRISTMAS";
    }
    if (searchText.includes("season") && searchText.includes("greet")) {
      return "SEASON'S GREETINGS";
    }

    // Default Christmas message
    return "SEASON'S GREETINGS";
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // ðŸŒ¸ GREETING CATEGORY - Beautiful, emotional, elegant (Valentine, Birthday, etc - NOT Christmas!)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  if (posterCategory === "greeting") {
    console.log("ðŸŒ¸ Generating GREETING-specific prompts...");
    return [
      {
        name: "ðŸŒ¸ Elegant Bloom",
        prompt: `ðŸŽ¨ GREETING POSTER REDESIGN: ðŸŒ¸ ELEGANT BLOOM

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸŒ¸ THIS IS A GREETING POSTER - Make it BEAUTIFUL and EMOTIONAL!
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

POSTER MESSAGE:
${theirVision}

FEELING:
${coreFeeling}

${RHYTHM_FLAT_RULES}

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸŒ¸ ELEGANT BLOOM - Beautiful, soft, emotional
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

GREETING VISUAL ELEMENTS (FLAT STYLE):
â€¢ Simple flower silhouettes (not realistic!)
â€¢ Leaves, stems (simple lines)
â€¢ Hearts (geometric)
â€¢ Soft shapes, curves

COLOR SCHEME:
â€¢ Soft background (cream, blush, light)
â€¢ Accent: soft pink, coral, or gold
â€¢ Elegant, warm feeling

TYPOGRAPHY:
â€¢ MASSIVE greeting word (THANK YOU, HAPPY, etc.)
â€¢ Elegant serif or script style
â€¢ Warm, inviting

VISUAL APPROACH:
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                                                 â”‚
â”‚  small "with love" or intro                     â”‚
â”‚  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆ               â”‚
â”‚  â–ˆâ–ˆ  THANK YOU (MASSIVE)  â–ˆâ–ˆ                    â”‚
â”‚  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆ               â”‚
â”‚  for being amazing                              â”‚
â”‚                                                 â”‚
â”‚        ðŸŒ¸ (simple flat flower)                  â”‚
â”‚                                                 â”‚
â”‚  from [name]                                    â”‚
â”‚                                                 â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

ðŸŽ¯ GOAL: Beautiful, emotional, elegant greeting!`
      },
      {
        name: "ðŸ’ Heart Stand Out",
        prompt: `ðŸŽ¨ GREETING POSTER REDESIGN: ðŸ’ HEART STAND OUT

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸŒ¸ THIS IS A GREETING POSTER - Hearts with ONE standing out!
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

POSTER MESSAGE:
${theirVision}

${RHYTHM_FLAT_RULES}

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸ’ HEART STAND OUT - Row of hearts, ONE pops
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

CONCEPT: Simple hearts in a row, ONE is accent color.
Like matchstick poster but with hearts!

VISUAL:
â™¡â™¡â™¡â™¡â™¡â™¡â™¡ â† all gray/light
        â™¥ â† ONE is colored!

VISUAL APPROACH:
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                                                 â”‚
â”‚  small intro                                    â”‚
â”‚  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆ               â”‚
â”‚  â–ˆâ–ˆ  GREETING WORD (MASSIVE)  â–ˆâ–ˆ                â”‚
â”‚  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆ               â”‚
â”‚  subtitle                                       â”‚
â”‚                                                 â”‚
â”‚     â™¡ â™¡ â™¡ â™¡ â™¡ â™¡ â™¥  â† ONE colored!               â”‚
â”‚                                                 â”‚
â”‚  message or signature                           â”‚
â”‚                                                 â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

ðŸŽ¯ GOAL: Hearts with ONE standing out - emotional rhythm!`
      },
      {
        name: "âœ¨ Minimal Precious",
        prompt: `ðŸŽ¨ GREETING POSTER REDESIGN: âœ¨ MINIMAL PRECIOUS

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸŒ¸ THIS IS A GREETING POSTER - Minimal but precious!
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

POSTER MESSAGE:
${theirVision}

${RHYTHM_FLAT_RULES}

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
âœ¨ MINIMAL PRECIOUS - Simple, elegant, meaningful
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

CONCEPT: Maximum white space, ONE precious element.
Like a museum piece - refined and elegant.

VISUAL:
â€¢ 80% white/cream space
â€¢ ONE simple flower or heart
â€¢ Typography as art

VISUAL APPROACH:
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                                                 â”‚
â”‚                                                 â”‚
â”‚                                                 â”‚
â”‚           ðŸŒ¸ (one simple element)               â”‚
â”‚                                                 â”‚
â”‚        GREETING WORD                            â”‚
â”‚        small subtitle                           â”‚
â”‚                                                 â”‚
â”‚                                                 â”‚
â”‚                                                 â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

ðŸŽ¯ GOAL: Minimal, precious, museum-quality greeting!`
      },
      {
        name: "ðŸŽ€ Soft Gradient",
        prompt: `ðŸŽ¨ GREETING POSTER REDESIGN: ðŸŽ€ SOFT GRADIENT

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸŒ¸ THIS IS A GREETING POSTER - Soft, warm, inviting!
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

POSTER MESSAGE:
${theirVision}

${RHYTHM_FLAT_RULES}

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸŽ€ SOFT GRADIENT - Warm colors flowing
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

CONCEPT: Soft color gradient background with clean typography.
Warm, inviting, gentle feeling.

COLORS:
â€¢ Soft gradient: cream to blush, or peach to coral
â€¢ White or dark text for contrast
â€¢ Gentle, warm feeling

VISUAL APPROACH:
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â”‚
â”‚â–‘â–‘â–‘  (soft gradient background)             â–‘â–‘â–‘â”‚
â”‚â–‘â–‘â–‘                                         â–‘â–‘â–‘â”‚
â”‚â–‘â–‘â–‘  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆ       â–‘â–‘â–‘â”‚
â”‚â–‘â–‘â–‘  â–ˆâ–ˆ  GREETING (MASSIVE)  â–ˆâ–ˆ             â–‘â–‘â–‘â”‚
â”‚â–‘â–‘â–‘  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆ       â–‘â–‘â–‘â”‚
â”‚â–‘â–‘â–‘                                         â–‘â–‘â–‘â”‚
â”‚â–‘â–‘â–‘        simple element                   â–‘â–‘â–‘â”‚
â”‚â–‘â–‘â–‘                                         â–‘â–‘â–‘â”‚
â”‚â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

ðŸŽ¯ GOAL: Soft, warm gradient with clean greeting!`
      }
    ];
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // ðŸ“š EDUCATIONAL CATEGORY - Clear, informative, visual metaphors
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // (Default - use existing prompts for educational/general)

  console.log("ðŸ“š Generating EDUCATIONAL/GENERAL prompts...");
  return [
    {
      name: "ðŸ”„ Transformation",
      prompt: `ðŸŽ¨ STEVE REDESIGN: ðŸ”„ TRANSFORMATION (RHYTHM + FLAT)

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸŽµ RHYTHM: Elements CHANGE to move the viewer's heart
ðŸŽ¨ FLAT DESIGN: Simple shapes, ONE accent color, meaningful visual
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

POSTER CORE MESSAGE:
${theirVision}

CORE FEELING:
${coreFeeling}

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸ”„ TRANSFORMATION - BEFORE â†’ AFTER with RHYTHM
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

CONCEPT: Show change/transformation with RHYTHM and FLAT DESIGN.

ðŸŽµ RHYTHM RULES (STRONG CONTRAST!):
â€¢ Typography: tiny intro â†’ MASSIVE KEYWORD (3x bigger!) â†’ small support
â€¢ The KEYWORD must be SO BIG it dominates the poster
â€¢ Visual: simple shapes, ONE pops with accent color
â€¢ Less is more - maximum 4-5 elements total

ðŸŽ¨ FLAT DESIGN RULES (ULTRA SIMPLE!):
â€¢ NO realistic illustrations - only GEOMETRIC shapes
â€¢ Simple circles, lines, arrows (no complex drawings)
â€¢ ONE accent color only (orange preferred)
â€¢ Solid white/cream background
â€¢ Clean, minimal, breathable

VISUAL STRUCTURE:
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                                                 â”‚
â”‚  small intro text                               â”‚
â”‚  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆ                   â”‚
â”‚  â–ˆâ–ˆ   HUGE KEYWORD   â–ˆâ–ˆ                         â”‚
â”‚  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆ                   â”‚
â”‚  medium supporting text                         â”‚
â”‚                                                 â”‚
â”‚     â—‹â—‹â—‹â—‹â—‹â—‹â—‹â—‹â—  â† one stands out                 â”‚
â”‚     [BEFORE] â†’ [AFTER]                          â”‚
â”‚     (flat, simple illustration)                 â”‚
â”‚                                                 â”‚
â”‚  â€¢ detail  â€¢ detail  â€¢ detail                   â”‚
â”‚                                                 â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

TRANSFORMATION VISUALS (FLAT STYLE):
â€¢ Tangled line â†’ Clean line (simple strokes)
â€¢ Gray circles â†’ One ORANGE circle stands out
â€¢ Scattered dots â†’ Connected dots
â€¢ Question mark â†’ Exclamation mark
â€¢ Closed lock â†’ Open lock (simple icons)

STYLE:
â€¢ Dark or light solid background
â€¢ White/black text + ONE accent (orange/red preferred)
â€¢ Simple flat icons and illustrations
â€¢ Dashed lines or arrows for FLOW/MOVEMENT
â€¢ Clean sans-serif typography with SIZE RHYTHM

ðŸŽ¯ GOAL: RHYTHM moves the eye, FLAT keeps it clean!`
    },
    {
      name: "ðŸ“ Editorial Grid",
      prompt: `ðŸŽ¨ STEVE REDESIGN: ðŸ“ EDITORIAL GRID (RHYTHM + FLAT)

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸŽµ RHYTHM: Typography size changes create visual music
ðŸŽ¨ FLAT DESIGN: Grid structure, clean shapes, one accent color
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

POSTER CORE MESSAGE:
${theirVision}

CORE FEELING:
${coreFeeling}

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸ“ EDITORIAL GRID - Swiss Typography with RHYTHM
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

CONCEPT: Magazine cover style with typography RHYTHM.

ðŸŽµ TYPOGRAPHY RHYTHM (EXTREME CONTRAST!):
â€¢ Line 1: tiny text (10% size)
â€¢ Line 2: MASSIVE KEYWORD (60% of poster width!) - in ACCENT COLOR
â€¢ Line 3: small supporting text
â€¢ The keyword must DOMINATE - 3-4x bigger than other text!

ðŸŽ¨ FLAT DESIGN RULES (ULTRA MINIMAL!):
â€¢ Subtle grid lines (very light gray)
â€¢ Cream or white background
â€¢ Black text + ONE accent color (orange/red) for KEYWORD ONLY
â€¢ Maximum 1 simple visual element (scribble, simple icon)
â€¢ NO complex illustrations - only geometric shapes

VISUAL STRUCTURE:
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ â”ƒ     â”ƒ     â”ƒ     â”ƒ     â”ƒ     â”ƒ     â”ƒ     â”ƒ    â”‚
â”‚ â”ƒ We know what it takes to make your     â”ƒ    â”‚
â”‚ â”ƒ â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆ     â”ƒ    â”‚
â”‚ â”ƒ â–ˆâ–ˆ    KEYWORD (accent color)    â–ˆâ–ˆ     â”ƒ    â”‚
â”‚ â”ƒ â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆ     â”ƒ    â”‚
â”‚ â”ƒ stand out from the rest.               â”ƒ    â”‚
â”‚ â”ƒ     â”ƒ     â”ƒ     â”ƒ     â”ƒ     â”ƒ     â”ƒ     â”ƒ    â”‚
â”‚ â”ƒ     â”ƒ     â”ƒ     â”ƒ     â—‹â—‹â—‹â—‹â—  (flat visual)   â”‚
â”‚ â”ƒ     â”ƒ     â”ƒ     â”ƒ     â”ƒ     â”ƒ     â”ƒ     â”ƒ    â”‚
â”‚ â”ƒâ”€â”€â”€â”€â”€â”ƒâ”€â”€â”€â”€â”€â”ƒâ”€â”€â”€â”€â”€â”ƒâ”€â”€â”€â”€â”€â”ƒâ”€â”€â”€â”€â”€â”ƒâ”€â”€â”€â”€â”€â”ƒâ”€â”€â”€â”€â”€â”ƒ    â”‚
â”‚ â”ƒ â€¢ point  â€¢ point  â€¢ point  â€¢ point     â”ƒ    â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

FLAT VISUAL ELEMENTS:
â€¢ Simple scribble/tangle (one accent color)
â€¢ Flat icons in a row (one highlighted)
â€¢ Geometric shapes (circles, squares)
â€¢ Simple line illustration
â€¢ Dashed arrow showing direction/flow

STYLE:
â€¢ Light background with visible grid
â€¢ Black text, ONE accent color (red/orange)
â€¢ LEFT-ALIGNED text (editorial feel)
â€¢ Simple flat visual element
â€¢ Footer with bullet points

ðŸŽ¯ GOAL: Typography rhythm + Grid structure + Flat visual!`
    },
    {
      name: "ðŸ’¡ Stand Out",
      prompt: `ðŸŽ¨ STEVE REDESIGN: ðŸ’¡ STAND OUT (RHYTHM + FLAT)

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸŽµ RHYTHM: Repetition with ONE element standing out
ðŸŽ¨ FLAT DESIGN: Simple shapes, ONE accent pops
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

POSTER CORE MESSAGE:
${theirVision}

CORE FEELING:
${coreFeeling}

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸ’¡ STAND OUT - One Element Breaks the Pattern
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

CONCEPT: Like the matchstick poster - many similar elements,
but ONE stands out with the accent color.

ðŸŽµ RHYTHM PATTERN (BOLD CONTRAST!):
â€¢ Typography: tiny â†’ MASSIVE KEYWORD â†’ small
â€¢ Visual: â—‹â—‹â—‹â—‹â—‹â— - simple shapes, ONE is accent color
â€¢ Maximum 5-6 repeated elements, ONE stands out
â€¢ The accent element must be OBVIOUSLY different

ðŸŽ¨ FLAT DESIGN RULES (SUPER SIMPLE!):
â€¢ ONLY geometric shapes - circles, squares, lines
â€¢ NO realistic illustrations (no hearts, no complex icons)
â€¢ Solid flat colors - gray/black + ONE accent (orange)
â€¢ Clean white/cream background
â€¢ The visual must be SIMPLE but MEANINGFUL

VISUAL STRUCTURE:
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                                                 â”‚
â”‚  intro text line                                â”‚
â”‚  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆ                   â”‚
â”‚  â–ˆâ–ˆ   KEYWORD   â–ˆâ–ˆ                              â”‚
â”‚  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆ                   â”‚
â”‚  supporting text                                â”‚
â”‚                                                 â”‚
â”‚        â—‹ â—‹ â—‹ â—‹ â—‹ â—‹ â— â† ONE stands out!          â”‚
â”‚        (gray gray gray ORANGE)                  â”‚
â”‚                                                 â”‚
â”‚  OR:  ||||||||| |  â† one taller                 â”‚
â”‚  OR:  â–¡â–¡â–¡â–¡â–¡â–¡â–¡â– â–¡ â† one different color           â”‚
â”‚                                                 â”‚
â”‚  â€¢ detail  â€¢ detail  â€¢ detail                   â”‚
â”‚                                                 â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

STAND OUT VISUAL IDEAS:
â€¢ Matchsticks: all gray tips, ONE orange
â€¢ Circles: all gray, ONE colored
â€¢ People icons: all gray, ONE highlighted
â€¢ Bars/lines: all same height, ONE taller
â€¢ Arrows: all pointing one way, ONE different

STYLE:
â€¢ Light or dark solid background
â€¢ Simple flat shapes (no 3D)
â€¢ Muted colors + ONE bright accent
â€¢ Clean typography with size rhythm
â€¢ The visual SHOWS the message

ðŸŽ¯ GOAL: Pattern pattern pattern â†’ STAND OUT!`
    },
    {
      name: "ðŸŽ¯ Focus Flow",
      prompt: `ðŸŽ¨ STEVE REDESIGN: ðŸŽ¯ FOCUS FLOW (RHYTHM + FLAT)

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸŽµ RHYTHM: Visual flow guides the eye through the message
ðŸŽ¨ FLAT DESIGN: Clean arrows, simple shapes, one accent
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

POSTER CORE MESSAGE:
${theirVision}

CORE FEELING:
${coreFeeling}

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸŽ¯ FOCUS FLOW - Guide the Eye with Visual Rhythm
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

CONCEPT: Use arrows, lines, and flow to create RHYTHM.
The eye follows a PATH through the design.

ðŸŽµ FLOW RHYTHM (SIMPLE PATH!):
â€¢ Typography: tiny â†’ MASSIVE KEYWORD â†’ small
â€¢ Visual: simple dashed arrow showing A â†’ B journey
â€¢ Maximum 3-4 elements along the path
â€¢ Clear visual flow - eye knows where to go

ðŸŽ¨ FLAT DESIGN RULES (GEOMETRIC ONLY!):
â€¢ Simple dashed lines and arrows (no complex curves)
â€¢ Basic shapes: circles, squares, simple icons
â€¢ NO realistic illustrations (no anatomical hearts!)
â€¢ ONE accent color (orange) for focal points
â€¢ Clean white/cream background

VISUAL STRUCTURE:
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                                                 â”‚
â”‚  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆ                       â”‚
â”‚  â–ˆâ–ˆ   HEADLINE   â–ˆâ–ˆ                             â”‚
â”‚  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆ                       â”‚
â”‚                                                 â”‚
â”‚        â•­â”€ â”€ â”€ â”€ â”€ â”€ â”€ â”€ â”€â•®                      â”‚
â”‚        â†“                 â†“                      â”‚
â”‚     [START]    â†’â†’â†’    [END]                     â”‚
â”‚     (problem)        (solution)                 â”‚
â”‚        â†‘                                        â”‚
â”‚        â•°â”€ â”€ â”€ â”€ â”€ â”€ â”€ â”€ â”€                       â”‚
â”‚                                                 â”‚
â”‚  step 1 â†’ step 2 â†’ step 3 â†’ step 4              â”‚
â”‚                                                 â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

FLOW ELEMENTS (FLAT):
â€¢ Dashed curved arrows (showing journey)
â€¢ Simple flat icons at key points
â€¢ Linear process: A â†’ B â†’ C â†’ D
â€¢ Circular flow returning to start
â€¢ Connecting lines between elements

STYLE:
â€¢ Clean background (light or dark)
â€¢ Black/white + ONE accent color
â€¢ Flat arrows and lines (no 3D)
â€¢ Typography with size rhythm
â€¢ Visual flow guides the eye

ðŸŽ¯ GOAL: The eye FLOWS through the design naturally!`
    }
  ];
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ðŸ” POSTER TYPE DETECTION (Legacy - for greeting/event specific styles)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
type PosterType = "greeting" | "event" | "product" | "unknown";

function detectPosterType(analysisResult: any): PosterType {
  if (!analysisResult) return "unknown";

  const analysisText = JSON.stringify(analysisResult).toLowerCase();

  // EVENT indicators: person, date, location, announcement, seminar, training
  const eventKeywords = ["person", "Ñ…Ò¯Ð½", "event", "date", "Ð¾Ð³Ð½Ð¾Ð¾", "ÑÐ°Ñ€", "location",
    "announcement", "Ð·Ð°Ñ€Ð»Ð°Ð»", "seminar", "ÑÑƒÑ€Ð³Ð°Ð»Ñ‚", "training", "workshop", "conference",
    "chicago", "Ð±Ð°Ð¹Ñ€ÑˆÐ¸Ð»", "speaker", "Ð¸Ð»Ñ‚Ð³ÑÐ³Ñ‡", "meeting"];

  // GREETING indicators: thank you, flower, birthday, congratulation
  const greetingKeywords = ["thank", "Ð±Ð°ÑÑ€Ð»Ð°Ð»Ð°Ð°", "flower", "Ñ†ÑÑ†ÑÐ³", "birthday",
    "Ñ‚Ó©Ñ€ÑÓ©Ð½ Ó©Ð´Ó©Ñ€", "congratulation", "Ð±Ð°ÑÑ€ Ñ…Ò¯Ñ€Ð³ÑÐµ", "greeting", "Ð¼ÑÐ½Ð´Ñ‡Ð¸Ð»Ð³ÑÑ",
    "love", "Ñ…Ð°Ð¹Ñ€", "mother", "ÑÑ…", "father", "Ð°Ð°Ð²", "wish"];

  // PRODUCT indicators: sale, price, discount, product, buy
  const productKeywords = ["sale", "Ñ…ÑÐ¼Ð´Ñ€Ð°Ð»", "price", "Ò¯Ð½Ñ", "discount", "%",
    "product", "Ð±Ò¯Ñ‚ÑÑÐ³Ð´ÑÑ…Ò¯Ò¯Ð½", "buy", "Ñ…ÑƒÐ´Ð°Ð»Ð´Ð°Ð°", "shop", "Ð´ÑÐ»Ð³Ò¯Ò¯Ñ€", "offer"];

  let eventScore = 0;
  let greetingScore = 0;
  let productScore = 0;

  eventKeywords.forEach(kw => { if (analysisText.includes(kw)) eventScore++; });
  greetingKeywords.forEach(kw => { if (analysisText.includes(kw)) greetingScore++; });
  productKeywords.forEach(kw => { if (analysisText.includes(kw)) productScore++; });

  console.log(`ðŸ“Š Poster type scores: Event=${eventScore}, Greeting=${greetingScore}, Product=${productScore}`);

  if (eventScore > greetingScore && eventScore > productScore) return "event";
  if (greetingScore > eventScore && greetingScore > productScore) return "greeting";
  if (productScore > eventScore && productScore > greetingScore) return "product";

  return "unknown";
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ðŸŽ‰ EVENT POSTER REDESIGN PROMPTS (Person + Event Announcement)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const EVENT_REDESIGN_PROMPTS = [
  {
    name: "ðŸŽ¯ Modern Clean",
    prompt: `ðŸ”§ EVENT POSTER REDESIGN: ðŸŽ¯ MODERN CLEAN STYLE

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
âš ï¸ THIS IS AN EVENT ANNOUNCEMENT POSTER WITH A PERSON!
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

MUST PRESERVE:
âœ… The PERSON (face must be IDENTICAL!)
âœ… The EVENT information (date, location, title)
âœ… The brand/name

REDESIGN TO MODERN CLEAN STYLE:
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  [brand/logo]                                   â”‚
â”‚                                                 â”‚
â”‚         EVENT TITLE                             â”‚
â”‚      (bold, modern font)                        â”‚
â”‚                                                 â”‚
â”‚         ðŸ“… Date  ðŸ“ Location                   â”‚
â”‚                                                 â”‚
â”‚              ðŸ‘¤                                 â”‚
â”‚         [PERSON PHOTO]                          â”‚
â”‚      (clean cutout, centered)                   â”‚
â”‚                                                 â”‚
â”‚         Speaker Name                            â”‚
â”‚                                                 â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

STYLE:
â€¢ Clean solid background (gradient or single color)
â€¢ Modern sans-serif typography
â€¢ Person photo with clean edges
â€¢ Clear hierarchy: Title â†’ Date/Location â†’ Person
â€¢ Professional, corporate quality`
  },
  {
    name: "âœ¨ Premium Dark",
    prompt: `ðŸ”§ EVENT POSTER REDESIGN: âœ¨ PREMIUM DARK STYLE

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
âš ï¸ THIS IS AN EVENT ANNOUNCEMENT POSTER WITH A PERSON!
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

MUST PRESERVE:
âœ… The PERSON (face must be IDENTICAL!)
âœ… The EVENT information (date, location, title)
âœ… The brand/name

REDESIGN TO PREMIUM DARK STYLE:
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â”‚
â”‚â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“ [brand] â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â”‚
â”‚â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â”‚
â”‚â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“ EVENT TITLE â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â”‚
â”‚â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“ (gold/white) â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â”‚
â”‚â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â”‚
â”‚â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“ ðŸ‘¤ â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â”‚
â”‚â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“ [PERSON] â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â”‚
â”‚â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â”‚
â”‚â–“â–“â–“â–“â–“â–“â–“â–“ ðŸ“… Date  ðŸ“ Location â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â”‚
â”‚â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

STYLE:
â€¢ Dark background (black, navy, dark purple)
â€¢ Gold or white elegant text
â€¢ Person dramatically lit
â€¢ Luxury, premium feeling
â€¢ High contrast, professional`
  },
  {
    name: "ðŸŒˆ Vibrant Gradient",
    prompt: `ðŸ”§ EVENT POSTER REDESIGN: ðŸŒˆ VIBRANT GRADIENT STYLE

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
âš ï¸ THIS IS AN EVENT ANNOUNCEMENT POSTER WITH A PERSON!
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

MUST PRESERVE:
âœ… The PERSON (face must be IDENTICAL!)
âœ… The EVENT information (date, location, title)
âœ… The brand/name

REDESIGN TO VIBRANT GRADIENT STYLE:
â€¢ Bold, colorful gradient background
â€¢ Modern, energetic typography
â€¢ Person with dynamic pose
â€¢ Eye-catching, social media friendly
â€¢ Contemporary, trendy design

STYLE:
â€¢ Gradient background (purple-pink, blue-teal, orange-yellow)
â€¢ Bold white or dark text
â€¢ Clean person cutout
â€¢ Modern, Instagram-worthy
â€¢ Energetic and exciting`
  },
  {
    name: "ðŸ“ Minimal Grid",
    prompt: `ðŸ”§ EVENT POSTER REDESIGN: ðŸ“ MINIMAL GRID STYLE

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
âš ï¸ THIS IS AN EVENT ANNOUNCEMENT POSTER WITH A PERSON!
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

MUST PRESERVE:
âœ… The PERSON (face must be IDENTICAL!)
âœ… The EVENT information (date, location, title)
âœ… The brand/name

REDESIGN TO MINIMAL GRID STYLE:
â€¢ Clean white or light background
â€¢ Strong grid-based layout
â€¢ Lots of white space
â€¢ Minimal, Swiss design inspired
â€¢ Typography-focused

STYLE:
â€¢ Maximum white space
â€¢ Black text, minimal color
â€¢ Person photo in clean frame
â€¢ Grid alignment
â€¢ Professional, editorial quality`
  }
];

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ðŸŒ¸ GREETING/FLOWER POSTER REDESIGN PROMPTS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const GREETING_REDESIGN_PROMPTS = [
  {
    name: "?? Watercolor",
    prompt: `ðŸ”§ COMPLETE REDESIGN: ðŸŽ¨ WATERCOLOR + NEW LAYOUT

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
âš ï¸ THIS IS A LAYOUT REDESIGN, NOT JUST AN EFFECT!
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

ðŸš« DO NOT COPY THE ORIGINAL LAYOUT!
ðŸš« Original has: flower LEFT, text RIGHT â†’ DO NOT DO THIS!
ðŸš« CREATE A COMPLETELY NEW COMPOSITION!

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸ“ NEW LAYOUT: CENTERED GREETING CARD
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚               [brand - small]                   â”‚
â”‚                                                 â”‚
â”‚                    ðŸŒ»                           â”‚
â”‚              WATERCOLOR FLOWER                  â”‚
â”‚                (CENTERED)                       â”‚
â”‚                                                 â”‚
â”‚               Thank You                         â”‚
â”‚            (centered below)                     â”‚
â”‚                                                 â”‚
â”‚        secondary message here                   â”‚
â”‚                                                 â”‚
â”‚               [footer]                          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

LAYOUT REQUIREMENTS:
â€¢ Flower in CENTER of design (not left, not right!)
â€¢ Text BELOW flower (not beside it!)
â€¢ Everything CENTERED and balanced
â€¢ 30-40% white space around edges
â€¢ Greeting card proportions

VISUAL STYLE:
â€¢ Soft watercolor illustration
â€¢ Color bleeds, visible brushstrokes
â€¢ Cream/white clean background
â€¢ Elegant script typography

CREATE A NEW DESIGN, NOT A FILTERED VERSION!`
  },
  {
    name: "?? Pencil",
    prompt: `ðŸ”§ COMPLETE REDESIGN: âœï¸ PENCIL + MINIMAL LAYOUT

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
âš ï¸ THIS IS A LAYOUT REDESIGN, NOT JUST AN EFFECT!
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

ðŸš« DO NOT COPY THE ORIGINAL LAYOUT!
ðŸš« Original has: flower LEFT, text RIGHT â†’ DO NOT DO THIS!
ðŸš« CREATE A COMPLETELY NEW COMPOSITION!

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸ“ NEW LAYOUT: MINIMAL ART PRINT (70% WHITE SPACE!)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                                                 â”‚
â”‚                                                 â”‚
â”‚                                                 â”‚
â”‚                   ðŸŒ»                            â”‚
â”‚              (small flower)                     â”‚
â”‚                                                 â”‚
â”‚                                                 â”‚
â”‚              thank you                          â”‚
â”‚           (tiny elegant text)                   â”‚
â”‚                                                 â”‚
â”‚                                                 â”‚
â”‚                                                 â”‚
â”‚                                                 â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

LAYOUT REQUIREMENTS:
â€¢ 70% OF THE POSTER IS EMPTY WHITE SPACE!
â€¢ Small, delicate flower in center
â€¢ Tiny elegant text below
â€¢ Museum art print feeling
â€¢ Extreme minimalism

VISUAL STYLE:
â€¢ Black & white or sepia pencil sketch
â€¢ Fine linework, delicate shading
â€¢ Clean white/cream background
â€¢ Thin, elegant typography

CREATE A NEW DESIGN, NOT A FILTERED VERSION!`
  },
  {
    name: "ðŸ“· Real",
    prompt: `ðŸ”§ COMPLETE REDESIGN: ðŸ“· REAL PHOTO - SWEET & DELICATE

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
âš ï¸ THIS IS A LAYOUT REDESIGN, NOT JUST AN EFFECT!
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

ðŸš« DO NOT COPY THE ORIGINAL LAYOUT!
ðŸš« Original has: flower LEFT, text RIGHT â†’ DO NOT DO THIS!
ðŸš« CREATE A COMPLETELY NEW COMPOSITION!

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸ“ NEW LAYOUT: TEXT TOP, SMALL DELICATE FLOWER BOTTOM
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                                                 â”‚
â”‚            [brand - small]                      â”‚
â”‚                                                 â”‚
â”‚             Thank You                           â”‚
â”‚          (elegant, centered)                    â”‚
â”‚                                                 â”‚
â”‚       May happiness and joy...                  â”‚
â”‚          (soft secondary text)                  â”‚
â”‚                                                 â”‚
â”‚                                                 â”‚
â”‚                                                 â”‚
â”‚                 ðŸŒ¼                              â”‚
â”‚         (SMALL, delicate flower)                â”‚
â”‚          (thin stem, gentle)                    â”‚
â”‚                                                 â”‚
â”‚              [footer]                           â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

ðŸŒ¸ THE FEELING MUST BE: SWEET, LIGHT, GENTLE, SOFT ðŸŒ¸

FLOWER SIZE & PROPORTION:
â€¢ Flower should be SMALL - only 25-35% of the poster height
â€¢ NOT big and bold - DELICATE and sweet
â€¢ Single thin stem
â€¢ Lots of EMPTY SPACE around the flower
â€¢ The flower should feel LIGHT, not heavy

BACKGROUND:
â€¢ SOFT, MUTED color that matches the flower
â€¢ Yellow flower â†’ Soft golden/cream yellow (not bright!)
â€¢ Pink flower â†’ Soft blush pink
â€¢ The color should be GENTLE, not saturated

TYPOGRAPHY:
â€¢ Elegant, SOFT typography
â€¢ Not too bold - refined and gentle
â€¢ White or cream colored text
â€¢ Should feel SWEET and WARM

THE OVERALL FEELING:
â€¢ Like a gentle whisper, not a shout
â€¢ Sweet, warm, personal
â€¢ Light and airy, not heavy
â€¢ Delicate and refined
â€¢ Makes you feel warm inside

âš ï¸ DO NOT make the flower too big or dominant!
âš ï¸ The feeling must be SWEET and GENTLE!`
  },
  {
    name: "âœ¨ Elegant",
    prompt: `ðŸ”§ COMPLETE REDESIGN: âœ¨ ELEGANT - DARK BG, TEXT TOP, FLOWER BOTTOM

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
âš ï¸ THIS IS A LAYOUT REDESIGN, NOT JUST AN EFFECT!
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

ðŸš« DO NOT COPY THE ORIGINAL LAYOUT!
ðŸš« Original has: flower LEFT, text RIGHT â†’ DO NOT DO THIS!
ðŸš« CREATE A COMPLETELY NEW COMPOSITION!

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸ“ NEW LAYOUT: DARK BACKGROUND, TEXT TOP, REAL FLOWER BOTTOM CENTER
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â”‚
â”‚â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â”‚
â”‚â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“ Thank You â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â”‚
â”‚â–“â–“â–“â–“â–“â–“â–“â–“â–“ (GOLD text, TOP) â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â”‚
â”‚â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â”‚
â”‚â–“â–“â–“â–“â–“â–“â–“ May happiness and joy... â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â”‚
â”‚â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â”‚
â”‚â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â”‚
â”‚â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“ ðŸŒ» â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â”‚
â”‚â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“ REAL FLOWER â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â”‚
â”‚â–“â–“â–“â–“â–“â–“â–“â–“ (bottom, centered) â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â”‚
â”‚â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â”‚
â”‚â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“ [brand footer] â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â–“â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

LAYOUT REQUIREMENTS:
â€¢ DARK background (dark navy blue or black)
â€¢ Text at TOP in GOLD/CREAM color
â€¢ Real flower photo at BOTTOM CENTER
â€¢ Single flower with stem
â€¢ Luxury, dramatic, elegant feeling

VISUAL STYLE:
â€¢ REAL flower photograph (not illustration!)
â€¢ Single flower with stem, dramatic lighting
â€¢ Dark navy/black solid background
â€¢ GOLD or CREAM colored text (not white!)
â€¢ Elegant serif or script typography
â€¢ High contrast, luxury magazine quality

THIS LOOKS LIKE A LUXURY BRAND AD OR VOGUE MAGAZINE!`
  }
];

interface GeneratedImage {
  index: number;
  imageData: string;
  prompt: string;
  provider: string;
  variationId?: string;
  logoVerified?: boolean;
  logoValidationAttempts?: number;
}

// HuggingFace Inference API endpoint for FLUX.1-dev (high quality, open-weight)
const HF_INFERENCE_URL = "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-dev";

// Get dimensions from aspect ratio
function getDimensions(aspectRatio: AspectRatio): { width: number; height: number } {
  const dimensions: Record<AspectRatio, { width: number; height: number }> = {
    "9:16": { width: 768, height: 1344 },   // Portrait poster
    "16:9": { width: 1344, height: 768 },   // Landscape
    "1:1": { width: 1024, height: 1024 },   // Square
    "4:5": { width: 896, height: 1120 },    // Instagram portrait
    "3:4": { width: 768, height: 1024 },    // Standard portrait
  };
  return dimensions[aspectRatio] || dimensions["9:16"];
}

function closestAspectRatioForSize(width: number, height: number): AspectRatio {
  const sourceRatio = width / height;
  const candidates: AspectRatio[] = ["9:16", "16:9", "1:1", "4:5", "3:4"];
  let best: AspectRatio = "9:16";
  let bestDiff = Number.POSITIVE_INFINITY;

  for (const ratio of candidates) {
    const d = getDimensions(ratio);
    const targetRatio = d.width / d.height;
    const diff = Math.abs(sourceRatio - targetRatio);
    if (diff < bestDiff) {
      best = ratio;
      bestDiff = diff;
    }
  }

  return best;
}

async function detectAspectRatioFromSourceImage(imageData?: string | null): Promise<AspectRatio | null> {
  if (!imageData) return null;
  const match = imageData.match(/^data:(.+);base64,(.+)$/);
  if (!match) return null;
  try {
    const buffer = Buffer.from(match[2], "base64");
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || !metadata.height) return null;
    return closestAspectRatioForSize(metadata.width, metadata.height);
  } catch {
    return null;
  }
}

async function normalizeAspectRatio(imageData: string, aspectRatio: AspectRatio): Promise<string> {
  const match = imageData.match(/^data:(.+);base64,(.+)$/);
  if (!match) return imageData;

  const mimeType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  const metadata = await sharp(buffer).metadata();
  if (!metadata.width || !metadata.height) return imageData;

  const target = getDimensions(aspectRatio);
  const currentRatio = metadata.width / metadata.height;
  const targetRatio = target.width / target.height;
  const ratioDiff = Math.abs(currentRatio - targetRatio) / targetRatio;

  // If the ratio is close enough, keep the original.
  if (ratioDiff < 0.02) return imageData;

  let outWidth = metadata.width;
  let outHeight = metadata.height;
  if (currentRatio > targetRatio) {
    // Too wide: add height.
    outHeight = Math.round(metadata.width / targetRatio);
  } else {
    // Too tall: add width.
    outWidth = Math.round(metadata.height * targetRatio);
  }

  const avg = await sharp(buffer).resize(1, 1).removeAlpha().raw().toBuffer();
  const [r, g, b] = avg;

  const normalized = await sharp(buffer)
    .resize(outWidth, outHeight, {
      fit: "contain",
      background: { r, g, b, alpha: 1 },
      withoutEnlargement: true,
    })
    .toBuffer();

  return `data:${mimeType};base64,${normalized.toString("base64")}`;
}

async function normalizeToSourceAspect(imageData: string, sourceImageData: string): Promise<string> {
  const generatedMatch = imageData.match(/^data:(.+);base64,(.+)$/);
  const sourceMatch = sourceImageData.match(/^data:(.+);base64,(.+)$/);
  if (!generatedMatch || !sourceMatch) return imageData;

  const mimeType = generatedMatch[1];
  const generatedBuffer = Buffer.from(generatedMatch[2], "base64");
  const sourceBuffer = Buffer.from(sourceMatch[2], "base64");

  const generatedMetadata = await sharp(generatedBuffer).metadata();
  const sourceMetadata = await sharp(sourceBuffer).metadata();
  if (
    !generatedMetadata.width ||
    !generatedMetadata.height ||
    !sourceMetadata.width ||
    !sourceMetadata.height
  ) {
    return imageData;
  }

  const currentRatio = generatedMetadata.width / generatedMetadata.height;
  const targetRatio = sourceMetadata.width / sourceMetadata.height;
  const ratioDiff = Math.abs(currentRatio - targetRatio) / targetRatio;

  // Already close enough to source ratio.
  if (ratioDiff < 0.01) return imageData;

  let outWidth = generatedMetadata.width;
  let outHeight = generatedMetadata.height;
  if (currentRatio > targetRatio) {
    // Too wide: add height.
    outHeight = Math.round(generatedMetadata.width / targetRatio);
  } else {
    // Too tall: add width.
    outWidth = Math.round(generatedMetadata.height * targetRatio);
  }

  const avg = await sharp(generatedBuffer).resize(1, 1).removeAlpha().raw().toBuffer();
  const [r, g, b] = avg;

  const normalized = await sharp(generatedBuffer)
    .resize(outWidth, outHeight, {
      fit: "contain",
      background: { r, g, b, alpha: 1 },
      withoutEnlargement: true,
    })
    .toBuffer();

  return `data:${mimeType};base64,${normalized.toString("base64")}`;
}

// Remove background using Replicate's BiRefNet model
async function removeBackground(imageBase64: string): Promise<Buffer> {
  if (!REPLICATE_API_TOKEN) {
    throw new Error("Replicate API token not configured");
  }

  console.log("ðŸ”„ Calling BiRefNet via Replicate API...");

  // BiRefNet model on Replicate - men1scus/birefnet
  // API accepts data URI directly
  const response = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${REPLICATE_API_TOKEN}`,
      "Content-Type": "application/json",
      "Prefer": "wait", // Use sync mode for faster response
    },
    body: JSON.stringify({
      version: "f74986db0355b58403ed20963af156525e2891ea3c2d499bfbfb2a28cd87c5d7",
      input: {
        image: imageBase64, // BiRefNet accepts data URI
        resolution: "1024x1024",
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Replicate API error: ${JSON.stringify(error)}`);
  }

  let result = await response.json();

  // Poll for completion if not using sync mode
  while (result.status === "starting" || result.status === "processing") {
    console.log(`BiRefNet status: ${result.status}...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    const pollResponse = await fetch(result.urls.get, {
      headers: { "Authorization": `Bearer ${REPLICATE_API_TOKEN}` },
    });
    result = await pollResponse.json();
  }

  if (result.status === "failed") {
    throw new Error(`BiRefNet failed: ${result.error}`);
  }

  console.log("âœ… BiRefNet completed!");

  // result.output is a URL to the PNG with transparent background
  const imageUrl = result.output;
  const imageResponse = await fetch(imageUrl);
  const arrayBuffer = await imageResponse.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Generate ONLY background image (no person, no text - just background)
async function generateBackgroundOnly(prompt: string, width: number, height: number): Promise<string | null> {
  if (!GOOGLE_AI_API_KEY) {
    throw new Error("Google AI API key is not configured");
  }

  const backgroundPrompt = `Generate ONLY a background image. No people, no text, no objects in the foreground.

STYLE: ${prompt}

REQUIREMENTS:
- This is a BACKGROUND ONLY - it will have elements placed on top of it
- Make it visually interesting but not distracting
- Good for a poster/thumbnail background
- Aspect ratio: ${width}x${height}
- The background should complement the style described above

Generate a clean, professional background now.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${GOOGLE_AI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: backgroundPrompt }] }],
        generationConfig: { responseModalities: ["image", "text"] },
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error("Gemini Background API error:", JSON.stringify(errorData));
    throw new Error(`Gemini API: ${errorData?.error?.message || response.status}`);
  }

  const data = await response.json();
  const parts = data.candidates?.[0]?.content?.parts || [];

  for (const part of parts) {
    if (part.inlineData) {
      const mimeType = part.inlineData.mimeType || "image/png";
      return `data:${mimeType};base64,${part.inlineData.data}`;
    }
  }
  return null;
}

// Composite foreground onto new background
async function compositeOntoBackground(
  foregroundPng: Buffer,
  backgroundBase64: string,
  originalWidth: number,
  originalHeight: number
): Promise<string> {
  // Extract background base64
  const bgMatch = backgroundBase64.match(/^data:(.+);base64,(.+)$/);
  if (!bgMatch) throw new Error("Invalid background format");
  const bgBuffer = Buffer.from(bgMatch[2], "base64");

  // Resize background to match original dimensions
  const resizedBackground = await sharp(bgBuffer)
    .resize(originalWidth, originalHeight, { fit: "cover" })
    .toBuffer();

  // Ensure foreground has same dimensions
  const resizedForeground = await sharp(foregroundPng)
    .resize(originalWidth, originalHeight, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  // Composite foreground onto background
  const result = await sharp(resizedBackground)
    .composite([{ input: resizedForeground, blend: "over" }])
    .png()
    .toBuffer();

  return `data:image/png;base64,${result.toString("base64")}`;
}

// Gemini 3 Pro Image (Nano Banana PRO) generation with image-to-image support
// When originalImage is provided, Gemini will SEE the original and IMPROVE it
async function generateWithGemini(
  prompt: string,
  originalImage?: string,
  aspectRatio?: AspectRatio,
  seed?: number
): Promise<string | null> {
  if (!GOOGLE_AI_API_KEY) {
    throw new Error("Google AI API key is not configured");
  }

  // Build the parts array - with or without original image
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
  const aspectHint = aspectRatio
    ? (() => {
        const target = getDimensions(aspectRatio);
        return `OUTPUT CANVAS: ${target.width}x${target.height}. Keep the exact aspect ratio. If the input aspect ratio differs, extend the background to fit. Do not stretch or crop key content.`;
      })()
    : "";

  // If we have the original image, include it so Gemini can SEE and IMPROVE it
  if (originalImage) {
    // Extract base64 data from data URL
    const base64Match = originalImage.match(/^data:(.+);base64,(.+)$/);
    if (base64Match) {
      const mimeType = base64Match[1];
      const base64Data = base64Match[2];
      parts.push({
        inlineData: {
          mimeType,
          data: base64Data,
        },
      });
      if (aspectHint) {
        parts.push({ text: aspectHint });
      }

      // Check what type of redesign this is
      const isSketchToDesign = prompt.includes("SKETCH-TO-DESIGN");
      const isProductToPoster = prompt.includes("PRODUCT-TO-POSTER");
      const isUnderstandingBased = prompt.includes("UNDERSTANDING-BASED REDESIGN");
      const isChristmasElevation = prompt.includes("CHRISTMAS POSTER ELEVATION");
      const isKidsElevation = prompt.includes("KIDS POSTER ELEVATION");
      const isRedesign = prompt.includes("ðŸ”§ REDESIGN") || prompt.includes("REDESIGN") || prompt.includes("EVENT POSTER REDESIGN") || isUnderstandingBased;
      const isEventPoster = prompt.includes("EVENT POSTER REDESIGN") || prompt.includes("THIS IS AN EVENT ANNOUNCEMENT POSTER");

      // SKETCH-TO-DESIGN: No special wrappers, just use the prompt directly
      if (isSketchToDesign) {
        console.log("âœï¸ Sketch-to-Design mode - using prompt directly");
        parts.push({ text: prompt });
      }
      // PRODUCT-TO-POSTER: No special wrappers, just use the prompt directly
      else if (isProductToPoster) {
        console.log("ðŸ“¦ Product-to-Poster mode - using prompt directly");
        parts.push({ text: prompt });
      }
      // ðŸ§’ KIDS ELEVATION MODE - Keep 3D cartoon style, DON'T flatten!
      else if (isKidsElevation) {
        parts.push({
          text: `KIDS POSTER ELEVATION - KEEP THE FUN!

CRITICAL: Kids posters must stay 3D cartoon style. NO flat design.

KEEP:
- 3D cartoon text (bright, shiny)
- Colorful elements (rockets, backpacks, planets, coins, etc.)
- Playful mood
- Gradient background (not flat)
- Shadows and glow
- Vivid kid-friendly colors

AVOID:
- Flat design
- Muted colors
- Turning 3D elements into 2D
- Black/white minimalism
- Adult/serious design

IMPROVE:
- Clearer layout hierarchy
- More dynamic placement
- Stronger, brighter color contrast

YOUR SPECIFIC DESIGN INSTRUCTIONS:
${prompt}
`,
        });
      }
      // ðŸŽ„ CHRISTMAS ELEVATION MODE - Keep core element, REMOVE clutter!
      else if (isChristmasElevation) {
        parts.push({
          text: `CHRISTMAS POSTER ELEVATION

RULE: Clean first, then improve. Keep ONE hero element (gift/stocking/tree).

STEP 1: Identify the single hero element and preserve it.
STEP 2: Remove clutter (cards, bubbles, excess icons, extra decorations).
STEP 3: Keep only: hero element, main message, small logo, 1-2 supporting lines.
STEP 4: Improve hierarchy, spacing, and contrast.

YOUR SPECIFIC DESIGN INSTRUCTIONS:
${prompt}
`,
        });
      } else if (isRedesign && !isKidsElevation) {
        // Skip Understanding-Based wrapper for KIDS - they have their own wrapper
        if (isUnderstandingBased) {
          // UNDERSTANDING-BASED REDESIGN - Poster-Ð¸Ð¹Ð½ Ð³Ð¾Ð» ÑÐ°Ð½Ð°Ð°Ð³ Ð¾Ð¹Ð»Ð³Ð¾Ð¾Ð´ Ñ…Ò¯Ñ‡Ð¸Ñ€Ñ…ÑÐ³Ð¶Ò¯Ò¯Ð»ÑÑ…
          parts.push({
            text: `UNDERSTANDING-BASED REDESIGN - Strengthen the core message

CRITICAL RULES:
1) Understand the message: what is it saying, what feeling, what matters most?
2) Amplify the core: make the key idea 10x clearer, remove the rest, add breathing room.
3) Speak in a new visual language: do not copy the original layout.

VISUAL PRINCIPLES:
- 60-80% negative space
- One hero element
- Clear hierarchy (1 -> 2 -> 3 reading order)

YOUR SPECIFIC DESIGN INSTRUCTIONS:
${prompt}

THINK LIKE THIS:
Design as if you deeply understood the message. Show that message in the strongest, simplest way.
`,
          });
        } else if (isEventPoster) {
          // EVENT POSTER REDESIGN MODE - Preserve person, redesign layout
          parts.push({
            text: `â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸŽª EVENT POSTER REDESIGN - PRESERVE PERSON, NEW DESIGN!
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

âš ï¸âš ï¸âš ï¸ CRITICAL RULES FOR EVENT POSTERS âš ï¸âš ï¸âš ï¸

1. THE PERSON'S FACE MUST BE 100% IDENTICAL!
   - Same facial features, same expression
   - Same skin tone, same hair
   - The person must be RECOGNIZABLE
   - This is NON-NEGOTIABLE!

2. THE EVENT INFO MUST BE PRESERVED!
   - Event title/name
   - Date and time
   - Location
   - Brand/organization name

3. CREATE A COMPLETELY NEW VISUAL DESIGN!
   - New background
   - New layout
   - New typography styling
   - New color scheme

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
You are looking at this poster to extract:
- Who is the PERSON? (preserve their face exactly!)
- What is the EVENT? (title, date, location)
- What is the BRAND? (logo, organization name)

Then CREATE a fresh professional design!
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

YOUR DESIGN INSTRUCTIONS:
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
${prompt}

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
THINK OF IT THIS WAY:
A client showed you their event poster with a speaker photo.
They said "Keep the speaker's face EXACTLY the same, but create
a completely NEW professional event poster design."
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•`,
          });
        } else {
          // GREETING/FLOWER POSTER REDESIGN MODE - Premium Botanical Elevation
          parts.push({
            text: `â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸŒ¸ PREMIUM BOTANICAL REDESIGN - CREATE FRESH ARTWORK!
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

ðŸš«ðŸš«ðŸš« ABSOLUTE RULES - MUST FOLLOW! ðŸš«ðŸš«ðŸš«

1. THE ORIGINAL PHOTO MUST NOT APPEAR IN YOUR DESIGN!
2. THE ORIGINAL TEXT STYLING MUST NOT APPEAR IN YOUR DESIGN!
3. CREATE EVERYTHING FRESH AND NEW!

You are looking at this poster ONLY to extract:
- What TYPE of flower? (sunflower, daisy, rose, etc.)
- What is the MESSAGE? (thank you, happy birthday, etc.)
- What is the brand name? (for small footer credit)

Then FORGET everything visual about the original!

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
âŒ DO NOT DO THESE THINGS!
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

âŒ NO original photo anywhere (not left, not right, not background)
âŒ NO original text styling (the white text on yellow - don't copy it!)
âŒ NO split layouts with the original image
âŒ NO ghosting or watermarks of original content
âŒ The original design should be 0% visible

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
âœ… CREATE THIS INSTEAD:
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

âœ… A NEW realistic botanical illustration of the flower
   - Draw it fresh, don't copy the photo
   - Realistic style, like botanical encyclopedia art
   - Beautiful, detailed, professional

âœ… NEW typography styling
   - Elegant serif or script fonts
   - NEW font colors (dark charcoal, brown, forest green)
   - NOT white text - use DARK text on light background

âœ… FRESH clean layout
   - Light background (cream, white, or soft tint)
   - Centered composition
   - Premium greeting card feel

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
YOUR DESIGN INSTRUCTIONS:
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
${prompt}

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
THINK OF IT THIS WAY:
A client showed you their poster and said "I love the flower and message,
but please create a completely NEW premium design from scratch."
You use their poster as BRIEF only, then create original artwork.
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•`,
          });
        }
      } else {
        // ARTISTIC STYLE MODE - For good posters that just need style variations
        parts.push({
          text: `You are an elite poster stylist. Apply STYLE-ONLY enhancement to this poster.

STYLE DIRECTION:
${prompt}

MANDATORY RULES (STYLE MODE):
1) KEEP LAYOUT EXACTLY
- Preserve the existing poster layout geometry and structure exactly.
- Keep all text blocks, visual zones, and relative positions unchanged.
- Do not move, resize, rotate, crop, mirror, stretch, reorder, or recompose.
- Preserve the source canvas aspect ratio exactly.

2) ALLOWED CHANGES
- You may change background (texture, color grading, atmosphere).
- You may change text font styling (typeface, weight, tracking, rendering style), except logo/wordmark.
- You may add effects (lighting, shadow, glow, grain, texture) to non-logo elements.
- You may add only subtle supporting visual accents that do NOT create new structural blocks, panels, badges, or layout regions.

3) LOGO SHAPE + WORDMARK LOCK (IDENTITY MUST STAY)
- Keep logo icon shape and logo wordmark text characters exactly unchanged.
- Keep logo position, size, orientation, and spacing exactly as source.
- You may apply subtle non-destructive logo effects only (soft glow, light blend, gentle shadow, fine grain).
- Never redraw, replace, retype, duplicate, relocate, or distort any logo/brand mark.

4) TEXT CONTENT LOCK
- Keep original text content the same unless user explicitly requested text edits.

OUTPUT GOAL:
Produce the same poster layout with upgraded style only.

OUTPUT SELF-CHECK (must pass before final image):
- Same canvas ratio as source.
- Same layout geometry and block positions.
- Same logo pixels and logo placement.
- No new structural containers.`,
        });
      }
    } else {
      // Fallback if image format is wrong
      parts.push({ text: `Generate an image: ${prompt}` });
    }
  } else {
    // No original image - just generate from text
    if (aspectHint) {
      parts.push({ text: aspectHint });
    }
    parts.push({ text: `Generate an image: ${prompt}` });
  }

  const candidateModels = [GEMINI_IMAGE_MODEL, ...GEMINI_IMAGE_FALLBACK_MODELS];
  type GeminiResponse = { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> } }> };
  let data: GeminiResponse | null = null;
  let lastError: (Error & { retryAfterMs?: number; statusCode?: number }) | null = null;

  for (const modelName of candidateModels) {
    let response: Response;
    try {
      response = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GOOGLE_AI_API_KEY}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts,
              },
            ],
            generationConfig: {
              responseModalities: ["image", "text"],
              ...(typeof seed === "number" ? { seed } : {}),
            },
          }),
        },
        GEMINI_REQUEST_TIMEOUT_MS
      );
    } catch (fetchErr) {
      const message = fetchErr instanceof Error ? fetchErr.message : "Gemini request failed";
      const error = new Error(`Gemini 3 API (${modelName}): ${message}`) as Error & {
        retryAfterMs?: number;
        statusCode?: number;
      };
      if (/timeout/i.test(message)) {
        error.statusCode = 504;
      }
      const hasNextModel = modelName !== candidateModels[candidateModels.length - 1];
      const transient = isTransientGeminiError(message, error.statusCode);
      lastError = error;
      if (hasNextModel && transient) {
        continue;
      }
      throw error;
    }

    if (!response.ok) {
      const errorData = await readResponseJsonWithTimeout<Record<string, unknown>>(
        response,
        GEMINI_REQUEST_TIMEOUT_MS,
        `Gemini ${modelName} error`
      ).catch(() => ({} as Record<string, unknown>));
      console.error(`Gemini Image API error (${modelName}):`, JSON.stringify(errorData));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errorMessage = (errorData as any)?.error?.message || `Status ${response.status}`;
      const error = new Error(`Gemini 3 API (${modelName}): ${errorMessage}`) as Error & {
        retryAfterMs?: number;
        statusCode?: number;
      };
      error.statusCode = response.status;
      const retryAfterMs = extractRetryDelayMs(errorMessage);
      if (retryAfterMs) {
        error.retryAfterMs = retryAfterMs;
      }

      const modelUnavailable = /(unknown model|not found|unsupported model|permission denied|not enabled)/i.test(errorMessage);
      const transient = isTransientGeminiError(errorMessage, response.status) || Boolean(retryAfterMs);
      const hasNextModel = modelName !== candidateModels[candidateModels.length - 1];

      lastError = error;

      if (hasNextModel && (modelUnavailable || transient)) {
        continue;
      }

      throw error;
    }

    data = await readResponseJsonWithTimeout<GeminiResponse>(
      response,
      GEMINI_REQUEST_TIMEOUT_MS,
      `Gemini ${modelName} success`
    );
    break;
  }

  if (!data) {
    throw lastError || new Error("Gemini 3 API: No response data");
  }
  const responseParts = data.candidates?.[0]?.content?.parts || [];

  for (const part of responseParts) {
    if (part.inlineData) {
      const mimeType = part.inlineData.mimeType || "image/png";
      return `data:${mimeType};base64,${part.inlineData.data}`;
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const clientId = getClientId(request);
    const limitResult = rateLimit(`generate:${clientId}`, RATE_LIMIT_PER_MINUTE, 60_000);
    if (!limitResult.ok) {
      const retryAfter = Math.max(1, Math.ceil((limitResult.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again soon." },
        { status: 429, headers: { "Retry-After": retryAfter.toString() } }
      );
    }

    // Authenticate user via Supabase
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check generation quota (count by unique requests, not individual images)
    const userProfile = await prisma.profile.findUnique({
      where: { id: user.id },
    });
    if (userProfile) {
      const now = new Date();
      let currentTier = userProfile.tier;

      // Auto-downgrade: premium expired → free
      if (
        currentTier === "premium" &&
        userProfile.premiumExpiresAt &&
        now > userProfile.premiumExpiresAt
      ) {
        await prisma.profile.update({
          where: { id: user.id },
          data: { tier: "free", premiumExpiresAt: null },
        });
        currentTier = "free";
      }

      const settings = await prisma.siteSettings.findUnique({
        where: { id: "default" },
      });
      const generationLimit = currentTier === "premium"
        ? (settings?.paidGenerationLimit ?? 50)
        : (settings?.freeGenerationLimit ?? 5);

      // Auto-refresh quota cycle: free = 7 days, premium = 30 days
      const cycleDays = currentTier === "premium" ? 30 : 7;
      const cycleMs = cycleDays * 24 * 60 * 60 * 1000;
      let quotaResetAt = userProfile.quotaResetAt;

      if (now.getTime() - quotaResetAt.getTime() >= cycleMs) {
        quotaResetAt = now;
        await prisma.profile.update({
          where: { id: user.id },
          data: { quotaResetAt: now },
        });
      }

      const usedRequests = await prisma.generatedImage.groupBy({
        by: ["requestId"],
        where: {
          userId: user.id,
          createdAt: { gte: quotaResetAt },
        },
      });

      // Quota exhausted → try token fallback
      if (usedRequests.length >= generationLimit) {
        if (userProfile.tokenBalance > 0) {
          const updated = await prisma.profile.update({
            where: { id: user.id },
            data: { tokenBalance: { decrement: 1 } },
          });
          await prisma.tokenLog.create({
            data: {
              userId: user.id,
              amount: -1,
              reason: "generation_use",
              balance: updated.tokenBalance,
            },
          });
        } else {
          return NextResponse.json(
            { error: "Таны зураг үүсгэх эрх дууссан байна. Token худалдаж аваад үргэлжлүүлнэ үү." },
            { status: 403 }
          );
        }
      }
    }

    const body = (await request.json()) as GenerateRequest;
    let {
      prompts: inputPrompts,
      mode,
      provider = "nano",
      aspectRatio = "9:16",
      parallel = true,
      originalImage,
      analysisResult,
      analysisId,
      sourceImageName,
      sketchInputs,
      sketchStyle,
      sketchCategory,
      sketchLayout,
      productInputs,
      productCampaign,
      productStyle,
      productInfo,
      redesignPreset,
      artisticIntensity,
      artisticTextSafety,
      artisticColorFidelity,
      artisticExtra,
      artisticStyles,
      inspirationNotes,
      gradientPreset,
    } = body;
    const requestId = crypto.randomUUID();
    const activeAnalysisId =
      analysisId ||
      (typeof analysisResult === "object" && analysisResult !== null && "analysis_id" in analysisResult
        ? String((analysisResult as { analysis_id?: string }).analysis_id)
        : undefined);
    const brandHint = resolveBrandHint(analysisResult, sourceImageName);
    const exactBrandWordmark =
      brandHint && !/^Detected from /i.test(brandHint) ? brandHint.trim() : null;
    const effectiveArtisticTextSafety: "strict" | "creative" = brandHint
      ? "strict"
      : (artisticTextSafety || "strict");

    if (provider === "gemini3") {
      provider = "nano";
    }

    let originalForGen = originalImage;
    if (originalForGen) {
      const detectedSourceAspect = await detectAspectRatioFromSourceImage(originalForGen);
      if (detectedSourceAspect) {
        aspectRatio = detectedSourceAspect;
      }
    }

    // Determine which prompts to use based on mode or direct prompts
    let prompts: string[] = [];
    let variationNames: string[] = [];
    let promptSeeds: Array<number | undefined> = [];
    const seedBase = Math.floor(Math.random() * 900000) + 100000;

    const referenceMatches =
      analysisResult && typeof analysisResult === "object"
        ? (analysisResult as { reference_matches?: ReturnType<typeof findReferenceMatches> }).reference_matches ??
          findReferenceMatches(analysisResult as Parameters<typeof findReferenceMatches>[0])
        : [];
    const referenceBlock = buildReferenceCueBlock(referenceMatches || []);
    const inspirationBlock = inspirationNotes && inspirationNotes.trim().length > 0
      ? `INSPIRATION NOTES (use only for mood, palette, typography cues; do NOT copy layout or assets):\n${inspirationNotes.trim()}`
      : "";
    const gradientBlock = buildGradientPresetBlock(gradientPreset);
    const moodboardBlock = buildMoodboardCueBlock(analysisResult, {
      disableGradientCue: Boolean(gradientBlock),
    });

    if (mode === "artistic") {
      // ARTISTIC STYLE MODE - Watercolor, Pencil, Professional, Bold
      console.log("ðŸŽ¨ ARTISTIC STYLE MODE selected");
      console.log("   Preserving the poster's soul, enhancing its mood...");
      // Force Style Generate to use only DNA 3 preset.
      const allPrompts = resolveArtisticStyles(["dnaGradient"], false);
      const styleVariantCount = 4;
      const optionsBlock = buildArtisticOptionsBlock({
        intensity: artisticIntensity,
        textSafety: effectiveArtisticTextSafety,
        colorFidelity: artisticColorFidelity,
      });

      if (artisticStyles && artisticStyles.length > 0) {
        console.log(`Selected styles: ${artisticStyles.join(", ")}`);
      } else if (artisticExtra) {
        console.log("Extra artistic styles enabled");
      }
      console.log(`Style controls => intensity: ${artisticIntensity || "balanced"}, text: ${effectiveArtisticTextSafety || "strict"}, color: ${artisticColorFidelity || "preserve"}`);

      const baseStyle = allPrompts[0];
      if (!baseStyle) {
        return NextResponse.json(
          { error: "Style preset is not available" },
          { status: 500 }
        );
      }

      const stylePresetMap: Record<string, { label: string; prompt: string }> = {
        clean_corporate: {
          label: "Clean Corporate",
          prompt: "DNA-C1: Bright clean corporate look, white-to-blue gradients, restrained geometry, crisp spacing, clear hierarchy.",
        },
        premium_dark: {
          label: "Premium Dark",
          prompt: "DNA-D1: Deep charcoal/black foundation, premium bronze/gold accents, cinematic contrast, glossy depth.",
        },
        bold_typography: {
          label: "Bold Typography",
          prompt: "DNA-T1: Headline-first typographic impact, high contrast rhythm, minimal visual distraction.",
        },
        gradient_atmosphere: {
          label: "Gradient Atmosphere",
          prompt: "DNA-G1: Smooth multi-stop gradients, soft glow transitions, atmospheric depth, modern digital mood.",
        },
        photo_duotone: {
          label: "Photo + Duotone",
          prompt: "DNA-P1: Contextual photo treatment with controlled duotone overlay and premium campaign readability.",
        },
        geometric_abstract: {
          label: "Geometric Abstract",
          prompt: "DNA-A1: Abstract geometric forms (rings, arcs, strips, cubes) with clean perspective and balanced energy.",
        },
        editorial_minimal: {
          label: "Editorial Minimal",
          prompt: "DNA-E1: Minimal palette, elegant spacing, premium editorial clarity, restrained visual language.",
        },
        vibrant_promo: {
          label: "Vibrant Promo",
          prompt: "DNA-V1: Vivid contrast colors, energetic gradient accents, campaign urgency with clear readability.",
        },
        soft_elegant: {
          label: "Soft Elegant",
          prompt: "DNA-S1: Soft pastel gradients, delicate light bloom, refined premium tone.",
        },
        event_spotlight: {
          label: "Event Spotlight",
          prompt: "DNA-ES1: Spotlight key info blocks and CTA path with directional accents and clarity.",
        },
      };

      const normalizeStyleKey = (value: string) => value.toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
      const styleAliases: Record<string, string> = {
        clean_corporate: "clean_corporate",
        premium_dark: "premium_dark",
        dark_fintech: "premium_dark",
        bold_typography: "bold_typography",
        gradient_atmosphere: "gradient_atmosphere",
        dna_gradient: "gradient_atmosphere",
        photo_duotone: "photo_duotone",
        geometric_abstract: "geometric_abstract",
        editorial_minimal: "editorial_minimal",
        vibrant_promo: "vibrant_promo",
        soft_elegant: "soft_elegant",
        event_spotlight: "event_spotlight",
      };

      const rankedStyleKeys = [
        "premium_dark",
        "gradient_atmosphere",
        "bold_typography",
        "clean_corporate",
        "photo_duotone",
        "geometric_abstract",
        "vibrant_promo",
        "editorial_minimal",
        "soft_elegant",
        "event_spotlight",
      ];

      const selectedStyleKeysRaw = Array.isArray(artisticStyles) && artisticStyles.length > 0
        ? artisticStyles
        : rankedStyleKeys.slice(0, styleVariantCount);

      const normalizedSelectedStyleKeys = selectedStyleKeysRaw
        .map((raw) => {
          const normalized = normalizeStyleKey(String(raw));
          return styleAliases[normalized] || normalized;
        })
        .filter((key) => Boolean(stylePresetMap[key as keyof typeof stylePresetMap]));

      let styleKeysForGeneration: string[] = [];
      if (normalizedSelectedStyleKeys.length === 0) {
        styleKeysForGeneration = rankedStyleKeys.slice(0, styleVariantCount);
      } else if (normalizedSelectedStyleKeys.length === 1) {
        styleKeysForGeneration = Array.from({ length: styleVariantCount }, () => normalizedSelectedStyleKeys[0]);
      } else {
        styleKeysForGeneration = Array.from(
          { length: styleVariantCount },
          (_, i) => normalizedSelectedStyleKeys[i % normalizedSelectedStyleKeys.length]
        );
      }

      const promptPack = styleKeysForGeneration.map((key, idx) => {
        const preset = stylePresetMap[key as keyof typeof stylePresetMap] || stylePresetMap.gradient_atmosphere;
        const styleAddonBlock = `BOARD STYLE DNA (${preset.label}):\n${preset.prompt}`;
        const stylePrompt = `${baseStyle.prompt}\n\n${styleAddonBlock}\n\n${optionsBlock}${gradientBlock ? `\n\n${gradientBlock}` : ""}${moodboardBlock ? `\n\n${moodboardBlock}` : ""}${referenceBlock ? `\n\n${referenceBlock}` : ""}${inspirationBlock ? `\n\n${inspirationBlock}` : ""}`;
        return {
          prompt: stylePrompt,
          name: `${preset.label} ${idx + 1}`,
        };
      });

      prompts = promptPack.map((item) => item.prompt);
      variationNames = promptPack.map((item) => item.name);
      promptSeeds = Array.from({ length: styleVariantCount }, (_, i) => seedBase + i);
    } else if (mode === "redesign") {
      // REDESIGN MODE - UNDERSTANDING-BASED: Poster-Ð¸Ð¹Ð½ Ð³Ð¾Ð» ÑÐ°Ð½Ð°Ð°Ð³ Ð¾Ð¹Ð»Ð³Ð¾Ð¾Ð´ Ñ…Ò¯Ñ‡Ð¸Ñ€Ñ…ÑÐ³Ð¶Ò¯Ò¯Ð»ÑÑ…
      console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
      console.log("ðŸ§  UNDERSTANDING-BASED REDESIGN MODE");
      console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
      console.log("?? Strengthening the poster's core message...");

      // Generate prompts based on understanding the poster's core message
      const understandingPrompts = generateUnderstandingPrompts(analysisResult);
      const presetRules = redesignPreset ? REDESIGN_PRESET_RULES[redesignPreset] : "";

      if (redesignPreset && presetRules) {
        console.log(`ðŸŽ›ï¸ Redesign preset: ${redesignPreset}`);
      }

      console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
      console.log("ðŸŽ¯ Creating 4 understanding-based variations:");
      understandingPrompts.forEach((p, i) => console.log(`   ${i + 1}. ${p.name}`));
      console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");

      // Log what we understood from the analysis
      const analysisDebug = analysisResult as {
        their_vision?: unknown;
        steal_from?: {
          feeling_detected?: unknown;
        };
      };

      const theirVision = typeof analysisDebug?.their_vision === "string" ? analysisDebug.their_vision : null;
      const coreFeeling = typeof analysisDebug?.steal_from?.feeling_detected === "string"
        ? analysisDebug.steal_from.feeling_detected
        : null;

      if (theirVision) {
        console.log(`?? Their Vision: ${theirVision.slice(0, 100)}...`);
      }
      if (coreFeeling) {
        console.log(`?? Core Feeling: ${coreFeeling}`);
      }
      console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");

      prompts = understandingPrompts.map(p => {
        const basePrompt = presetRules ? `${p.prompt}\n\n${presetRules}` : p.prompt;
        return `${basePrompt}${gradientBlock ? `\n\n${gradientBlock}` : ""}${moodboardBlock ? `\n\n${moodboardBlock}` : ""}${referenceBlock ? `\n\n${referenceBlock}` : ""}${inspirationBlock ? `\n\n${inspirationBlock}` : ""}`;
      });
      variationNames = understandingPrompts.map(p => p.name);
    } else if (mode === "sketch-to-design") {
      // SKETCH-TO-DESIGN MODE - Generate professional design from hand-drawn sketch
      console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
      console.log("âœï¸ SKETCH-TO-DESIGN MODE");
      console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");

      console.log(`ðŸ“ Headline: ${sketchInputs?.headline || 'N/A'}`);
      console.log(`ðŸŽ¨ Style: ${sketchStyle || 'minimal'}`);
      console.log(`ðŸ·ï¸ Category: ${sketchCategory || 'product'}`);

      // Generate sketch-to-design prompts
      const sketchPrompts = generateSketchToDesignPrompts(sketchInputs, sketchStyle, sketchCategory, sketchLayout);

      prompts = sketchPrompts.map(p => p.prompt);
      variationNames = sketchPrompts.map(p => p.name);

      console.log("ðŸŽ¯ Creating 4 design variations from sketch:");
      variationNames.forEach((name, i) => console.log(`   ${i + 1}. ${name}`));
      console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
    } else if (mode === "product-to-poster") {
      // PRODUCT-TO-POSTER MODE - Generate marketing poster from product photo
      console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
      console.log("ðŸ“¦ PRODUCT-TO-POSTER MODE");
      console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");

      console.log(`ðŸ“ Headline: ${productInputs?.headline || 'N/A'}`);
      console.log(`ðŸŽ¯ Campaign: ${productCampaign || 'awareness'}`);
      console.log(`ðŸŽ¨ Style: ${productStyle || 'premium'}`);
      if (productInfo) {
        console.log(`ðŸ“¦ Product: ${productInfo.product_type}`);
        console.log(`ðŸ‘¤ Target: ${productInfo.target_demographic.age_range} / ${productInfo.target_demographic.gender}`);
        console.log(`ðŸ’Ž Tier: ${productInfo.price_positioning}`);
      }

      // Generate product-to-poster prompts
      const productPrompts = generateProductToPosterPrompts(productInputs, productCampaign, productStyle, productInfo);

      prompts = productPrompts.map(p => p.prompt);
      variationNames = productPrompts.map(p => p.name);

      console.log("ðŸŽ¯ Creating 4 poster variations from product:");
      variationNames.forEach((name, i) => console.log(`   ${i + 1}. ${name}`));
      console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
    } else if (inputPrompts && inputPrompts.length > 0) {
      // Direct prompts (backwards compatibility)
      prompts = inputPrompts;
      variationNames = inputPrompts.map((_, i) => `Variation ${i + 1}`);
    } else {
      return NextResponse.json(
        { error: "Mode or prompt not provided" },
        { status: 400 }
      );
    }

    if (promptSeeds.length !== prompts.length) {
      promptSeeds = prompts.map(() => undefined);
    }

    const coreRulesFile = pickCoreRulesPrompt(DEFAULT_CORE_RULES);
    const coreRules = loadPromptFile(coreRulesFile);
    const coreRulesText = coreRules.content;
    const styleModePromptBlock = `\n\nSTYLE MODE CONSTRAINTS (HIGHEST PRIORITY):\n- Use the source poster as strict composition reference.\n- Preserve the existing poster layout geometry and structure exactly.\n- Keep all text blocks, visual zones, and relative positions unchanged.\n- Do NOT move, resize, rotate, crop, mirror, stretch, or reorder blocks/sections.\n- Preserve source canvas aspect ratio exactly.\n- Full-bleed output only: no outer padding, no inset frame, no visible border.\n- Background must reach all four canvas edges.\n- Keep text content unchanged unless explicitly requested.\n- Allowed edits only: background styling, typography styling, and relevant visual elements/effects.\n- Do NOT add structural containers/panels/badges/geometric overlays.\n- Keep the source logo icon shape and exact logo wordmark text unchanged (no redraw, no rewrite, no replacement, no missing/extra letters).\n- Subtle logo effects are allowed (glow/shadow/blend/texture), but icon geometry and wordmark characters must remain identical and readable.\n- Do NOT replace, duplicate, or relocate the brand mark.\n- Keep logo size, orientation, and position unchanged.`;
    const redesignModePromptBlock = `\n\nREDESIGN MODE CONSTRAINTS (HIGHEST PRIORITY):\n- You may redesign composition and layout (new arrangement is allowed).\n- Preserve core message and key content hierarchy from the prompt.\n- Preserve brand identity: keep logo icon + wordmark text exact (no rewrite/redraw/replacement).\n- Do NOT duplicate or relocate brand marks inconsistently.\n- Aspect ratio must remain as requested/source policy.\n- Full-bleed output only: no outer padding, no inset frame, no visible border.\n- Background must reach all four canvas edges.\n- Avoid contradictory instructions: if a redesign instruction conflicts with style-lock rules, redesign instruction wins in this mode.`;
    const modePromptBlock =
      mode === "artistic"
        ? styleModePromptBlock
        : mode === "redesign"
          ? redesignModePromptBlock
          : "";

    // Prepend core rules + mode-specific rules so they have maximum weight.
    prompts = prompts.map(prompt => `${coreRulesText}${modePromptBlock}\n\n${prompt}`);

    logEvent({
      id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      type: "generate",
      sessionId: requestId,
      userId: clientId,
      payload: {
        analysis_id: activeAnalysisId,
        mode: mode || "custom",
        provider,
        aspect_ratio: aspectRatio,
        parallel,
        prompt_hash: coreRules.hash,
        prompt_file: coreRulesFile,
        prompt_count: prompts.length,
        variation_names: variationNames,
        source_image_name: sourceImageName,
      },
    });

    console.log(`Generating ${prompts.length} variations: ${variationNames.join(", ")}`);

    // Check API keys based on provider
    if (provider === "flux" && !HF_TOKEN) {
      return NextResponse.json(
        { error: "HuggingFace token is not configured" },
        { status: 500 }
      );
    }
    if (provider === "nano" && !GOOGLE_AI_API_KEY) {
      return NextResponse.json(
        { error: "Google AI API key is not configured" },
        { status: 500 }
      );
    }

    const dimensions = getDimensions(aspectRatio);

    /*
    // BACKGROUND-ONLY MODE: Extract foreground once, generate backgrounds, composite
    // This guarantees 100% preservation of person, text, and icons
    if (originalImage && preserveMode === "background-only" && provider === "nano") {
      console.log(`ðŸŽ¨ BACKGROUND-ONLY MODE: Preserving ALL foreground elements (person, text, icons)`);
      console.log(`ðŸ“¸ Extracting foreground from original image...`);

      // Get original image dimensions
      const base64Match = originalImage.match(/^data:(.+);base64,(.+)$/);
      if (!base64Match) {
        return NextResponse.json({ error: "Invalid image format" }, { status: 400 });
      }
      const originalBuffer = Buffer.from(base64Match[2], "base64");
      const originalMetadata = await sharp(originalBuffer).metadata();
      const origWidth = originalMetadata.width || 1280;
      const origHeight = originalMetadata.height || 720;
      console.log(`ðŸ“ Original dimensions: ${origWidth}x${origHeight}`);

      // Extract foreground (person + text + icons) - only do this ONCE
      let foregroundPng: Buffer;
      try {
        foregroundPng = await removeBackground(originalImage);
        console.log(`âœ… Foreground extracted successfully!`);
      } catch (err) {
        console.error(`âŒ Background removal failed:`, err);
        // Fallback to image-to-image mode
        console.log(`âš ï¸ Falling back to image-to-image mode...`);
        // Continue below with regular mode
        foregroundPng = null as unknown as Buffer;
      }

      if (foregroundPng) {
        // Generate backgrounds and composite
        const generateWithComposite = async (prompt: string, index: number): Promise<GeneratedImage | null> => {
          try {
            console.log(`ðŸ–¼ï¸ Generating background ${index}...`);
            const backgroundImage = await generateBackgroundOnly(prompt, origWidth, origHeight);
            if (!backgroundImage) {
              console.error(`âŒ Background generation failed for ${index}`);
              return null;
            }
            console.log(`âœ… Background ${index} generated!`);

            console.log(`ðŸ”§ Compositing foreground onto background ${index}...`);
            let finalImage = await compositeOntoBackground(foregroundPng, backgroundImage, origWidth, origHeight);
            finalImage = await normalizeAspectRatio(finalImage, aspectRatio);
            console.log(`âœ… Image ${index} complete! 100% original elements preserved.`);

            return { index, imageData: finalImage, prompt, provider: "gemini-composite" };
          } catch (err) {
            console.error(`âŒ Error in composite generation ${index}:`, err);
            return null;
          }
        };

        let generatedImages: GeneratedImage[] = [];

        if (parallel && prompts.length > 1) {
          console.log("Starting parallel background generation...");
          const results = await Promise.allSettled(
            prompts.map((prompt, index) => generateWithComposite(prompt, index))
          );

          generatedImages = results
            .filter((r): r is PromiseFulfilledResult<GeneratedImage | null> => r.status === "fulfilled" && r.value !== null)
            .map(r => r.value as GeneratedImage)
            .sort((a, b) => a.index - b.index);
        } else {
          for (let i = 0; i < prompts.length; i++) {
            const result = await generateWithComposite(prompts[i], i);
            if (result) generatedImages.push(result);
          }
        }

        if (generatedImages.length === 0) {
          return NextResponse.json(
            { error: "Image generation failed", details: "Background generation failed" },
            { status: 500 }
          );
        }

        // Auto-save generated images to disk with proper variation names
        const savedPaths = saveGeneratedImages(generatedImages, variationNames);

        // Save image records to database
        const imagesForDb = generatedImages.map(img => ({
          index: img.index,
          name: variationNames[img.index] || `Variation ${img.index + 1}`,
        }));
        await saveGeneratedImageRecords(user.id, savedPaths, imagesForDb, requestId, aspectRatio, "studio");

        // Add variation names to the response
        const imagesWithNames = generatedImages.map(img => ({
          ...img,
          variationId: `${requestId}:${img.index}`,
          name: variationNames[img.index] || `Variation ${img.index + 1}`
        }));

        return NextResponse.json({
          success: true,
          images: imagesWithNames,
          variationNames,
          provider: "gemini-composite",          requested          aspectRatio,
          totalRequested: prompts.length,
          totalGenerated: generatedImages.length,
          mode: mode || "background-only",
          requestId,
          analysisId: activeAnalysisId,
          savedPaths,
        });
      }
    }

    */
    // Regular mode (image-to-image or text-to-image)
    const generationType = originalImage ? "IMAGE-TO-IMAGE (seeing original)" : "TEXT-TO-IMAGE";
    const preserveSourceAspect = Boolean(originalForGen);
    const enforceFinalAspect = async (imageData: string) =>
      preserveSourceAspect && originalForGen
        ? normalizeToSourceAspect(imageData, originalForGen)
        : normalizeAspectRatio(imageData, aspectRatio);
    const generationDeadline = Date.now() + GENERATE_TOTAL_TIMEOUT_MS;
    console.log(
      `Generating ${prompts.length} images with ${provider}, type: ${generationType}, mode: ${
        mode || "custom"
      }, aspect ratio: ${preserveSourceAspect ? "source-image" : aspectRatio}, parallel: ${parallel}`
    );

    // Helper function to generate a single image
    const generateSingleImage = async (prompt: string, index: number): Promise<GeneratedImage | null> => {
      try {
        if (provider === "nano") {
          // Always send original image for IMAGE-TO-IMAGE elevation
          // We want Gemini to SEE the original and IMPROVE it, not create from scratch
          console.log(`Generating image ${index} with Gemini 3 Pro Image / Nano Banana PRO (${generationType})...`);
          const effectiveAspectForPrompt = preserveSourceAspect ? undefined : aspectRatio;
          let imageData = await generateWithGemini(
            prompt,
            originalForGen,
            effectiveAspectForPrompt,
            promptSeeds[index]
          );
          if (!imageData) {
            throw new Error(`Gemini returned no image payload for image ${index}.`);
          }
          imageData = await enforceFinalAspect(imageData);
          console.log(`Successfully generated image ${index} with Gemini 3 Pro Image`);
          return {
            index,
            imageData,
            prompt,
            provider: "gemini-3-pro",
            logoVerified: true,
            logoValidationAttempts: 1,
          };
        } else {
          console.log(`Generating image ${index} with FLUX.1-dev...`);
          const response = await fetch(HF_INFERENCE_URL, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${HF_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              inputs: prompt,
              parameters: {
                width: dimensions.width,
                height: dimensions.height,
                guidance_scale: 4.0,
                num_inference_steps: 50,
                seed: Math.floor(Math.random() * 1000000),
              },
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error(`HF Inference API error for prompt ${index}:`, errorData);
            if (response.status === 503) {
              throw new Error("Model is loading, please try again");
            }
            throw new Error(errorData?.error || `Status ${response.status}`);
          }

          const imageBuffer = await response.arrayBuffer();
          const base64 = Buffer.from(imageBuffer).toString("base64");
          const contentType = response.headers.get("content-type") || "image/png";
          let imageData = `data:${contentType};base64,${base64}`;
          imageData = await enforceFinalAspect(imageData);
          console.log(`Successfully generated image ${index} with FLUX`);
          return { index, imageData, prompt, provider: "flux", logoVerified: true, logoValidationAttempts: 0 };
        }
        return null;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        console.error(`Error generating image ${index}:`, errorMessage);
        throw err;
      }
    };

    let generatedImages: GeneratedImage[] = [];
    const generationErrors: string[] = [];
    const useParallelGeneration = parallel && prompts.length > 1;

    if (useParallelGeneration) {
      // Parallel generation using Promise.allSettled
      console.log("Starting parallel generation...");
      const results = await Promise.allSettled(
        prompts.map((prompt, index) =>
          withTimeout(
            generateSingleImage(prompt, index),
            GENERATE_SINGLE_IMAGE_TIMEOUT_MS,
            `Image ${index} generation timed out after ${GENERATE_SINGLE_IMAGE_TIMEOUT_MS}ms`
          )
        )
      );

      generatedImages = results
        .filter((result): result is PromiseFulfilledResult<GeneratedImage | null> =>
          result.status === "fulfilled" && result.value !== null
        )
        .map(result => result.value as GeneratedImage)
        .sort((a, b) => a.index - b.index);

      // Log any failures
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          console.error(`Image ${index} failed:`, result.reason);
          const reason =
            result.reason instanceof Error
              ? result.reason.message
              : typeof result.reason === "string"
                ? result.reason
                : "Unknown parallel generation error";
          generationErrors.push(`Image ${index + 1}: ${reason}`);
        } else if (result.value === null) {
          generationErrors.push(`Image ${index + 1}: generator returned null image`);
        }
      });
    } else {
      // Sequential generation (for single image or when parallel=false)
      for (let i = 0; i < prompts.length; i++) {
        const remainingTotalMs = generationDeadline - Date.now();
        if (remainingTotalMs <= 0) {
          console.error(`Generation exceeded total timeout (${GENERATE_TOTAL_TIMEOUT_MS}ms). Returning partial results.`);
          break;
        }
        const perImageTimeoutMs = Math.max(
          5_000,
          Math.min(GENERATE_SINGLE_IMAGE_TIMEOUT_MS, remainingTotalMs)
        );
        try {
          const result = await withTimeout(
            generateSingleImage(prompts[i], i),
            perImageTimeoutMs,
            `Image ${i} generation timed out after ${perImageTimeoutMs}ms`
          );
          if (result) {
            generatedImages.push(result);
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : "Unknown error";
          generationErrors.push(`Image ${i + 1}: ${errorMessage}`);
          if (prompts.length === 1) {
            return NextResponse.json(
              { error: "Image generation failed", details: errorMessage },
              { status: 500 }
            );
          }
          // Continue for multiple images
        }
        if (provider === "nano" && i < prompts.length - 1) {
          await sleep(1200);
        }
      }
    }

    if (generatedImages.length === 0) {
      const details =
        generationErrors.length > 0
          ? `No images were generated. ${generationErrors.slice(0, 4).join(" | ")}`
          : "No images were generated";
      return NextResponse.json(
        { error: "Image generation failed", details },
        { status: 500 }
      );
    }

    // Auto-save generated images to disk with proper variation names
    const savedPaths = saveGeneratedImages(generatedImages, variationNames);

    // Save image records to database
    const imagesForDb = generatedImages.map(img => ({
      index: img.index,
      name: variationNames[img.index] || `Variation ${img.index + 1}`,
    }));
    await saveGeneratedImageRecords(user.id, savedPaths, imagesForDb, requestId, aspectRatio, "studio");

    // Add variation names to the response
    const imagesWithNames = generatedImages.map(img => ({
      ...img,
      variationId: `${requestId}:${img.index}`,
      name: variationNames[img.index] || `Variation ${img.index + 1}`
    }));

    return NextResponse.json({
      success: true,
      images: imagesWithNames,
      variationNames,
      mode: mode || "custom",
      provider,
      aspectRatio,
      totalRequested: prompts.length,
      totalGenerated: generatedImages.length,
      requestId,
      analysisId: activeAnalysisId,
      savedPaths,
    });
  } catch (error) {
    console.error("Server error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Server error", details: errorMessage },
      { status: 500 }
    );
  }
}












