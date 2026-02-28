import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { rateLimit } from "@/lib/rate-limit";
import { logEvent } from "@/lib/telemetry";
import { extractCodeBlocks, loadPromptFile } from "@/lib/prompt-loader";
import { pickCoreRulesPrompt } from "@/lib/prompt-policy";
import { buildReferenceCueBlock, findReferenceMatches } from "@/lib/reference-matcher";

// Folder to save generated images
const SAVE_FOLDER = path.join(process.cwd(), "generated-images");
const SAVE_GENERATED_IMAGES = process.env.SAVE_GENERATED_IMAGES === "true";

// Save image to disk and return the file path
function saveImageToDisk(imageData: string, variationName: string, index: number): string {
  if (!SAVE_GENERATED_IMAGES) return "";
  if (!fs.existsSync(SAVE_FOLDER)) {
    fs.mkdirSync(SAVE_FOLDER, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const safeName = variationName.replace(/[^a-zA-Z0-9-_ ]/g, "").slice(0, 30);
  const filename = `${timestamp}_${index}_${safeName}.png`;
  const filePath = path.join(SAVE_FOLDER, filename);

  // Extract base64 data and save
  const base64Match = imageData.match(/^data:(.+);base64,(.+)$/);
  if (base64Match) {
    const buffer = Buffer.from(base64Match[2], "base64");
    fs.writeFileSync(filePath, buffer);
    console.log(`💾 Saved: ${filename}`);
    return filePath;
  }
  return "";
}

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
{"match": true|false, "icon_match": true|false, "confidence": number, "reason": string, "wordmark_source": string, "wordmark_generated": string}
Rules:
- "match" must be false if any wordmark letters differ (including missing/extra/reordered letters), if casing changes, if icon shape is redrawn, if logo is duplicated, if logo orientation changes, or if logo position/size changes.
- "icon_match" must be false if icon silhouette/inner geometry differs in any way.
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
    const data = await response.json().catch(() => ({}));
    const parts = data?.candidates?.[0]?.content?.parts || [];
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
    };

    const matchValue =
      typeof parsed.match === "boolean"
        ? parsed.match
        : typeof parsed.logo_match === "boolean"
          ? parsed.logo_match
          : false;
    const iconMatchValue = typeof parsed.icon_match === "boolean" ? parsed.icon_match : false;
    const confidenceValue = typeof parsed.confidence === "number" ? parsed.confidence : 0;
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
  const selected = (selectedKeys || []).filter((key): key is ArtisticStyleKey => key in ARTISTIC_STYLE_LIBRARY);
  if (selected.length > 0) {
    return selected
      .map((key) => ({ key, ...ARTISTIC_STYLE_LIBRARY[key] }))
      .filter((style) => style.prompt);
  }
  const base = ARTISTIC_STYLE_BASE_KEYS.map((key) => ({ key, ...ARTISTIC_STYLE_LIBRARY[key] }));
  const extra = useExtra ? ARTISTIC_STYLE_EXTRA_KEYS.map((key) => ({ key, ...ARTISTIC_STYLE_LIBRARY[key] })) : [];
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

// ═══════════════════════════════════════════════════════════════════════════
// ✏️ SKETCH-TO-DESIGN - Гар зургаас мэргэжлийн дизайн үүсгэх
// ═══════════════════════════════════════════════════════════════════════════

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
• Clean white or light gray background
• Maximum 2 colors (black + 1 accent)
• Sans-serif fonts (Helvetica, Inter, Montserrat)
• Lots of white space (60%+)
• Simple geometric shapes
• No gradients, no shadows
• Typography as the hero element`,
    bold: `
BOLD STYLE:
• High contrast colors (black/yellow, red/white)
• Extra bold, impactful fonts
• Large text that commands attention
• Strong geometric shapes
• Accent color used sparingly but powerfully
• Energetic, urgent feeling
• Some texture or grain allowed`,
    playful: `
PLAYFUL STYLE:
• Bright, fun colors (pink, orange, teal, yellow)
• Rounded fonts, friendly typography
• Organic shapes, curves
• Illustrations or icons
• Gradient backgrounds allowed
• Fun, energetic composition
• Can include subtle patterns`,
    premium: `
PREMIUM STYLE:
• Dark background (black, navy, deep gray)
• Gold, silver, or copper accents
• Elegant serif or thin sans-serif fonts
• Subtle luxury textures
• Refined spacing and alignment
• High-end product photography feel
• Minimalist but expensive feeling`,
    dark: `
DARK STYLE:
• Deep black or dark gray background
• Neon accents (cyan, magenta, lime)
• Modern, tech-inspired fonts
• Glowing effects on text
• Sharp, angular shapes
• Cyberpunk or gaming aesthetic
• High contrast elements`
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
• Header: ${sketchLayout.header_area}
• Main: ${sketchLayout.main_area}
• Footer: ${sketchLayout.footer_area}
• Elements: ${sketchLayout.elements.join(", ")}
• Hierarchy: ${sketchLayout.hierarchy}

RESPECT THIS LAYOUT STRUCTURE!
` : "";

  const textContent = `
TEXT TO INCLUDE:
• Headline: "${headline}"
${subheadline ? `• Subheadline: "${subheadline}"` : ""}
${price ? `• Price/Discount: "${price}"` : ""}
${cta ? `• CTA Button: "${cta}"` : ""}
${brand ? `• Brand: "${brand}"` : ""}
${additionalText ? `• Additional: "${additionalText}"` : ""}
`;

  const basePrompt = `
✏️ SKETCH-TO-DESIGN: Create a professional poster design

YOU ARE LOOKING AT A HAND-DRAWN SKETCH.
Your job is to transform this sketch into a PROFESSIONAL, POLISHED design.

${layoutDescription}

${textContent}

═══════════════════════════════════════════════════════════════════
STYLE REQUIREMENTS:
═══════════════════════════════════════════════════════════════════
${styleGuides[style]}

═══════════════════════════════════════════════════════════════════
CATEGORY: ${category.toUpperCase()}
${categoryGuides[category]}
═══════════════════════════════════════════════════════════════════

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
      name: "🎯 Layout Faithful",
      prompt: `${basePrompt}

VARIATION: LAYOUT FAITHFUL
Strictly follow the sketch layout while applying professional styling.
The positioning of elements should match the sketch exactly.
Focus on clean execution of the sketched composition.`
    },
    {
      name: "✨ Enhanced",
      prompt: `${basePrompt}

VARIATION: ENHANCED
Follow the sketch layout but IMPROVE the composition.
Add subtle enhancements: better spacing, refined alignment.
Make it look even more professional than the sketch suggested.`
    },
    {
      name: "🔥 Bold Statement",
      prompt: `${basePrompt}

VARIATION: BOLD STATEMENT
Follow the sketch layout but make the headline MORE IMPACTFUL.
Increase the visual weight of the main message.
The headline should grab attention immediately.`
    },
    {
      name: "🎨 Creative Twist",
      prompt: `${basePrompt}

VARIATION: CREATIVE TWIST
Use the sketch as inspiration but add a creative element.
Keep the core layout but add one unexpected visual element.
Make it memorable while staying true to the sketch's intent.`
    }
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// 📦 PRODUCT-TO-POSTER - Product зургаас маркетингийн poster үүсгэх
// ═══════════════════════════════════════════════════════════════════════════

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
• Age: ${productInfo.target_demographic.age_range}
  ${productInfo.target_demographic.age_range === 'kids' ? '→ COLORFUL, FUN, 3D CARTOON style!' : ''}
  ${productInfo.target_demographic.age_range === 'teens' ? '→ TRENDY, BOLD, SOCIAL MEDIA style!' : ''}
  ${productInfo.target_demographic.age_range === 'young_adults' ? '→ MODERN, ASPIRATIONAL style!' : ''}
  ${productInfo.target_demographic.age_range === 'adults' ? '→ SOPHISTICATED, PREMIUM style!' : ''}
• Gender: ${productInfo.target_demographic.gender}
• Lifestyle: ${productInfo.target_demographic.lifestyle}
• Product type: ${productInfo.product_type}
• Price tier: ${productInfo.price_positioning}
` : "";

  const productInsights = productInfo ? `
PRODUCT INSIGHTS (use for emphasis only; do NOT invent):
${productInfo.primary_claim ? `• Primary claim: ${productInfo.primary_claim}` : ""}
${productInfo.key_features?.length ? `• Key features: ${productInfo.key_features.join(", ")}` : ""}
${productInfo.benefits?.length ? `• Benefits: ${productInfo.benefits.join(", ")}` : ""}
${productInfo.differentiators?.length ? `• Differentiators: ${productInfo.differentiators.join(", ")}` : ""}
${productInfo.reasons_to_believe?.length ? `• Reasons to believe: ${productInfo.reasons_to_believe.join(", ")}` : ""}
` : "";

  const textContent = `
TEXT TO INCLUDE (exact text, no new copy):
• Headline: "${headline}"
${subheadline ? `• Subheadline: "${subheadline}"` : ""}
${price ? `• Price/Discount: "${price}"` : ""}
${cta ? `• CTA: "${cta}"` : ""}
${brand ? `• Brand: "${brand}"` : ""}`;

  // ═══════════════════════════════════════════════════════════════════
  // 🚫 ANTI-CANVA DIRECTIVE - What makes posters look CHEAP
  // ═══════════════════════════════════════════════════════════════════
  const antiCanvaRules = `
ANTI-CANVA RULES (FAIL IF BROKEN):
- ONE product only
- No generic gradients, clipart, or random shapes
- No "floating product" stock-template look
- 2 font families max, 3 colors max
- 60%+ empty space
- Asymmetric, editorial composition
- Must feel curated, not templated`;

  // ═══════════════════════════════════════════════════════════════════
  // ✨ PREMIUM REFERENCE - What makes posters look EXPENSIVE
  // ═══════════════════════════════════════════════════════════════════
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
- Use a 12-column grid, 8-12% margins
- Choose ONE:
  A) Product left (cols 1-6), text right (cols 8-12)
  B) Product right (cols 7-12), text left (cols 1-5)
  C) Product centered, text bottom-left
- 50-70% negative space
`;

  return [
    {
      name: "🎯 Hero Product Spotlight",
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
      name: "🧼 Minimal Tech Clean",
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
      name: "📅 Event Hype Poster",
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
      name: "✨ Luxury Matte",
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

// ═══════════════════════════════════════════════════════════════════════════
// 🧠 UNDERSTANDING-BASED REDESIGN - Poster-ийн ГОЛ САНААГ ойлгоод хүчирхэгжүүлэх
// ═══════════════════════════════════════════════════════════════════════════

function generateUnderstandingPrompts(analysisResult: any): Array<{name: string, prompt: string}> {
  // ═══════════════════════════════════════════════════════════════════════════
  // 🧠 INTELLIGENT POSTER UNDERSTANDING SYSTEM
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // Step 1: UNDERSTAND what type of poster this is
  // Step 2: UNDERSTAND what message it wants to communicate
  // Step 3: Generate TAILORED prompts for that specific type
  //
  // RHYTHM + FLAT DESIGN applies to ALL types
  // But the VISUAL APPROACH changes based on poster type
  // ═══════════════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔍 DETECT POSTER TYPE - What is this poster trying to do?
  // ═══════════════════════════════════════════════════════════════════════════

  type PosterCategory = "christmas" | "greeting" | "educational" | "gaming" | "event" | "product" | "kids" | "general";

  function detectPosterCategory(): PosterCategory {
    // ═══════════════════════════════════════════════════════════════════════════
    // 🎄 CHRISTMAS - Check FIRST! Christmas is NOT generic greeting!
    // ═══════════════════════════════════════════════════════════════════════════
    const christmasKeywords = ["christmas", "xmas", "зул сар", "зул сарын", "santa", "snowflake",
      "цас", "snow", "reindeer", "december", "12-р сар", "12 сар", "holiday season", "new year",
      "шинэ жил", "stocking", "candy cane", "ornament", "pine", "гацуур", "winter", "өвөл",
      "jingle", "bells", "mistletoe", "gift", "бэлэг", "festive", "хонх", "merry", "carol",
      "wreath", "ёлка", "нарс", "red and green", "гэрэл чимэглэл", "december 12", "12-р сарын"];

    let christmasScore = 0;
    christmasKeywords.forEach(kw => { if (analysisText.includes(kw)) christmasScore++; });

    // If ANY Christmas keyword found - it's CHRISTMAS, not generic greeting!
    if (christmasScore >= 1) {
      console.log(`🎄 CHRISTMAS DETECTED! Score: ${christmasScore}`);
      return "christmas";
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 🧒 KIDS/CHILDREN - Check SECOND! Colorful, playful, 3D cartoon style
    // ═══════════════════════════════════════════════════════════════════════════
    const kidsKeywords = ["back to school", "school", "сургууль", "children", "хүүхэд", "kids",
      "cartoon", "3d", "colorful", "playful", "fun", "adventure", "rocket", "пуужин",
      "backpack", "цүнх", "pencil", "харандаа", "toy", "тоглоом", "piggy bank", "saving",
      "learning", "dream", "мөрөөдөл", "cloud", "үүл", "bright", "тод өнгө", "хөгжилтэй"];

    let kidsScore = 0;
    kidsKeywords.forEach(kw => { if (analysisText.includes(kw)) kidsScore++; });

    // Check for visual style indicators (3D, colorful, cartoon)
    if (analysisText.includes("3d") || analysisText.includes("cartoon") ||
        analysisText.includes("colorful") || analysisText.includes("playful") ||
        (analysisText.includes("school") && analysisText.includes("backpack"))) {
      kidsScore += 3; // Boost score for visual style
    }

    if (kidsScore >= 2) {
      console.log(`🧒 KIDS/CHILDREN DETECTED! Score: ${kidsScore}`);
      return "kids";
    }

    // GREETING: flowers, thank you, birthday, Valentine's, Mother's day, etc (NOT Christmas!)
    const greetingKeywords = ["thank", "баярлалаа", "flower", "цэцэг", "birthday", "төрсөн өдөр",
      "баяр", "мэнд хүргэ", "greeting", "congratulat", "love", "хайр", "mother", "father",
      "valentine", "happy", "wish", "blessing", "anniversary", "ой"];

    // EDUCATIONAL: design thinking, process, learn, how to, steps, методолог
    const educationalKeywords = ["design thinking", "process", "learn", "how to", "steps",
      "method", "tutorial", "guide", "principle", "concept", "understand", "empathy", "empathize",
      "define", "ideate", "prototype", "test", "skill", "technique", "сургалт", "арга"];

    // GAMING: game, counter-strike, play, gaming, level, score, battle, тоглоом
    const gamingKeywords = ["game", "gaming", "counter-strike", "counter strike", "play",
      "level", "score", "battle", "тоглоом", "тоглогч", "winner", "champion", "esport",
      "fps", "shooter", "战", "遊戲", "gamer"];

    // EVENT: date, location, speaker, seminar, workshop, conference, арга хэмжээ
    const eventKeywords = ["event", "огноо", "location", "байршил", "speaker",
      "seminar", "workshop", "conference", "арга хэмжээ", "зарлал", "announcement", "register"];

    // PRODUCT: sale, price, discount, product, buy, shop, худалдаа, үнэ
    const productKeywords = ["sale", "price", "үнэ", "discount", "хямдрал", "%", "product",
      "бүтээгдэхүүн", "buy", "худалдаа", "shop", "offer", "deal"];

    let greetingScore = 0, educationalScore = 0, gamingScore = 0, eventScore = 0, productScore = 0;

    greetingKeywords.forEach(kw => { if (analysisText.includes(kw)) greetingScore++; });
    educationalKeywords.forEach(kw => { if (analysisText.includes(kw)) educationalScore++; });
    gamingKeywords.forEach(kw => { if (analysisText.includes(kw)) gamingScore++; });
    eventKeywords.forEach(kw => { if (analysisText.includes(kw)) eventScore++; });
    productKeywords.forEach(kw => { if (analysisText.includes(kw)) productScore++; });

    console.log(`📊 Poster category scores: Greeting=${greetingScore}, Educational=${educationalScore}, Gaming=${gamingScore}, Event=${eventScore}, Product=${productScore}`);

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
  console.log(`🎯 DETECTED POSTER CATEGORY: ${posterCategory.toUpperCase()}`);
  console.log(`💭 Poster Vision: ${theirVision.slice(0, 100)}...`);

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

  // ═══════════════════════════════════════════════════════════════════════════
  // 🎨 CATEGORY-SPECIFIC PROMPTS - Tailored to poster's PURPOSE
  // ═══════════════════════════════════════════════════════════════════════════

  // Common style rules for ALL categories
  const RHYTHM_FLAT_RULES = `
🎵 RHYTHM RULES (ALL POSTERS):
• Typography: tiny intro → MASSIVE KEYWORD (3x bigger!) → small support
• Visual: simple shapes, ONE element pops with accent color
• Maximum 4-5 elements total - less is more

🎨 FLAT DESIGN RULES (ALL POSTERS):
• NO realistic/complex illustrations - only GEOMETRIC shapes
• Simple icons, lines, circles, arrows
• ONE accent color only (orange, red, or themed color)
• Solid clean background (white, cream, or themed)
• Clean, minimal, breathable

LAYOUT SYSTEM (ALL POSTERS):
- Use 8-12% outer margins (safe area)
- Use a grid; align edges and baselines
- Type scale: Hero 100%, Subhead 45-60%, Support 20-30%
- 2 font families max, 2 weights max
- 2-3 colors max, 1 accent max
- 50-70% negative space`;


  // ═══════════════════════════════════════════════════════════════════════════
  // 🎮 GAMING CATEGORY - Dynamic, bold, exciting
  // ═══════════════════════════════════════════════════════════════════════════
  if (posterCategory === "gaming") {
    console.log("🎮 Generating GAMING-specific prompts...");
    return [
      {
        name: "🎮 Gaming Bold",
        prompt: `🎨 GAMING POSTER REDESIGN: 🎮 BOLD GAMING STYLE

═══════════════════════════════════════════════════════════════════
🎮 THIS IS A GAMING POSTER - Make it EXCITING and BOLD!
═══════════════════════════════════════════════════════════════════

POSTER MESSAGE:
${theirVision}

FEELING:
${coreFeeling}

${RHYTHM_FLAT_RULES}

═══════════════════════════════════════════════════════════════════
🎮 GAMING STYLE - Bold, Dynamic, Exciting
═══════════════════════════════════════════════════════════════════

GAMING VISUAL ELEMENTS (FLAT STYLE):
• Crosshairs/targets 🎯 (simple circles with cross)
• Controllers (simple flat icon)
• Helmets (simple geometric)
• Bullets/ammo (simple shapes)
• Stars, badges (flat geometric)

COLOR SCHEME:
• Dark background (black, dark green, military)
• Accent: orange, gold, or neon green
• High contrast for excitement

TYPOGRAPHY:
• MASSIVE game/title name
• Bold, impactful fonts
• Military or tech style

VISUAL APPROACH:
┌─────────────────────────────────────────────────┐
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓▓▓  small intro                            ▓▓▓│
│▓▓▓  ████████████████████████████████       ▓▓▓│
│▓▓▓  ██  GAME TITLE (MASSIVE)  ██           ▓▓▓│
│▓▓▓  ████████████████████████████████       ▓▓▓│
│▓▓▓  small tagline                          ▓▓▓│
│▓▓▓                                         ▓▓▓│
│▓▓▓     🎯  🎮  ⭐  (flat gaming icons)      ▓▓▓│
│▓▓▓                                         ▓▓▓│
│▓▓▓  GREETING/MESSAGE (if any)              ▓▓▓│
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
└─────────────────────────────────────────────────┘

🎯 GOAL: Exciting, bold, gaming aesthetic with RHYTHM!`
      },
      {
        name: "🎯 Target Stand Out",
        prompt: `🎨 GAMING POSTER REDESIGN: 🎯 TARGET STAND OUT

═══════════════════════════════════════════════════════════════════
🎮 THIS IS A GAMING POSTER - Use TARGET/CROSSHAIR visual!
═══════════════════════════════════════════════════════════════════

POSTER MESSAGE:
${theirVision}

${RHYTHM_FLAT_RULES}

═══════════════════════════════════════════════════════════════════
🎯 TARGET STAND OUT - Crosshairs with ONE highlighted
═══════════════════════════════════════════════════════════════════

CONCEPT: Row of crosshair/target icons, ONE stands out.
Like the matchstick poster but with gaming targets!

VISUAL:
🎯🎯🎯🎯🎯🎯🎯 ← all gray/dark
              🟠 ← ONE is accent color!

STYLE:
• Light or dark background
• Simple flat crosshair icons in a row
• All same color EXCEPT ONE
• MASSIVE title above
• Message below

VISUAL APPROACH:
┌─────────────────────────────────────────────────┐
│                                                 │
│  small intro                                    │
│  ████████████████████████████████               │
│  ██    GAME TITLE (MASSIVE)    ██               │
│  ████████████████████████████████               │
│  tagline text                                   │
│                                                 │
│     🎯 🎯 🎯 🎯 🎯 🎯 🎯  ← ONE orange!           │
│                                                 │
│  GREETING MESSAGE                               │
│                                                 │
└─────────────────────────────────────────────────┘

🎯 GOAL: Gaming targets with ONE standing out!`
      },
      {
        name: "🏆 Victory Flow",
        prompt: `🎨 GAMING POSTER REDESIGN: 🏆 VICTORY FLOW

═══════════════════════════════════════════════════════════════════
🎮 THIS IS A GAMING POSTER - Show the path to VICTORY!
═══════════════════════════════════════════════════════════════════

POSTER MESSAGE:
${theirVision}

${RHYTHM_FLAT_RULES}

═══════════════════════════════════════════════════════════════════
🏆 VICTORY FLOW - Journey to winning
═══════════════════════════════════════════════════════════════════

CONCEPT: Visual flow showing gaming journey.
Start → Play → Win progression.

GAMING FLOW IDEAS:
• Controller → Target → Trophy
• Helmet → Weapon → Victory
• Practice → Battle → Champion
• ○○○○● progress circles

VISUAL APPROACH:
┌─────────────────────────────────────────────────┐
│                                                 │
│  ████████████████████████████████               │
│  ██    GAME TITLE (MASSIVE)    ██               │
│  ████████████████████████████████               │
│                                                 │
│     🎮 ──→ 🎯 ──→ 🏆                            │
│    (start)  (play)  (win)                       │
│                                                 │
│  ★ GREETING MESSAGE ★                           │
│                                                 │
└─────────────────────────────────────────────────┘

🎯 GOAL: Gaming journey flow to victory!`
      },
      {
        name: "⭐ Military Honor",
        prompt: `🎨 GAMING POSTER REDESIGN: ⭐ MILITARY HONOR

═══════════════════════════════════════════════════════════════════
🎮 THIS IS A GAMING/MILITARY POSTER - Honor and respect style!
═══════════════════════════════════════════════════════════════════

POSTER MESSAGE:
${theirVision}

${RHYTHM_FLAT_RULES}

═══════════════════════════════════════════════════════════════════
⭐ MILITARY HONOR - Respectful, strong, proud
═══════════════════════════════════════════════════════════════════

CONCEPT: Military honor aesthetic with stars and badges.
Strong, proud, respectful design.

MILITARY ELEMENTS (FLAT):
• Stars ⭐ (simple 5-point)
• Badges (simple geometric shapes)
• Stripes, bars
• Laurel wreaths (simple lines)

COLOR SCHEME:
• Green (military) or dark background
• Gold/orange accents for honor
• White text for contrast

VISUAL APPROACH:
┌─────────────────────────────────────────────────┐
│                                                 │
│           ⭐⭐⭐                                 │
│                                                 │
│  ████████████████████████████████               │
│  ██    TITLE (MASSIVE)    ██                    │
│  ████████████████████████████████               │
│                                                 │
│        ═══════════════════                      │
│        ★ HONOR MESSAGE ★                        │
│        ═══════════════════                      │
│                                                 │
└─────────────────────────────────────────────────┘

🎯 GOAL: Military honor with stars and respect!`
      }
    ];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 🎄 CHRISTMAS - ELEVATE the original! Keep core element, improve everything!
  // ═══════════════════════════════════════════════════════════════════════════
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
    if (searchText.includes("зул сар") || searchText.includes("christmas") || searchText.includes("xmas")) {
      return "MERRY CHRISTMAS";
    }
    if (searchText.includes("шинэ жил") || searchText.includes("new year")) {
      return "HAPPY NEW YEAR";
    }
    if (searchText.includes("баярлалаа") || searchText.includes("thank")) {
      return "THANK YOU";
    }
    if (searchText.includes("12-р сар") || searchText.includes("december") || searchText.includes("12 сар")) {
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

  // ═══════════════════════════════════════════════════════════════════════════
  // 🌸 GREETING CATEGORY - Beautiful, emotional, elegant (Valentine, Birthday, etc - NOT Christmas!)
  // ═══════════════════════════════════════════════════════════════════════════
  if (posterCategory === "greeting") {
    console.log("🌸 Generating GREETING-specific prompts...");
    return [
      {
        name: "🌸 Elegant Bloom",
        prompt: `🎨 GREETING POSTER REDESIGN: 🌸 ELEGANT BLOOM

═══════════════════════════════════════════════════════════════════
🌸 THIS IS A GREETING POSTER - Make it BEAUTIFUL and EMOTIONAL!
═══════════════════════════════════════════════════════════════════

POSTER MESSAGE:
${theirVision}

FEELING:
${coreFeeling}

${RHYTHM_FLAT_RULES}

═══════════════════════════════════════════════════════════════════
🌸 ELEGANT BLOOM - Beautiful, soft, emotional
═══════════════════════════════════════════════════════════════════

GREETING VISUAL ELEMENTS (FLAT STYLE):
• Simple flower silhouettes (not realistic!)
• Leaves, stems (simple lines)
• Hearts (geometric)
• Soft shapes, curves

COLOR SCHEME:
• Soft background (cream, blush, light)
• Accent: soft pink, coral, or gold
• Elegant, warm feeling

TYPOGRAPHY:
• MASSIVE greeting word (THANK YOU, HAPPY, etc.)
• Elegant serif or script style
• Warm, inviting

VISUAL APPROACH:
┌─────────────────────────────────────────────────┐
│                                                 │
│  small "with love" or intro                     │
│  ████████████████████████████████               │
│  ██  THANK YOU (MASSIVE)  ██                    │
│  ████████████████████████████████               │
│  for being amazing                              │
│                                                 │
│        🌸 (simple flat flower)                  │
│                                                 │
│  from [name]                                    │
│                                                 │
└─────────────────────────────────────────────────┘

🎯 GOAL: Beautiful, emotional, elegant greeting!`
      },
      {
        name: "💝 Heart Stand Out",
        prompt: `🎨 GREETING POSTER REDESIGN: 💝 HEART STAND OUT

═══════════════════════════════════════════════════════════════════
🌸 THIS IS A GREETING POSTER - Hearts with ONE standing out!
═══════════════════════════════════════════════════════════════════

POSTER MESSAGE:
${theirVision}

${RHYTHM_FLAT_RULES}

═══════════════════════════════════════════════════════════════════
💝 HEART STAND OUT - Row of hearts, ONE pops
═══════════════════════════════════════════════════════════════════

CONCEPT: Simple hearts in a row, ONE is accent color.
Like matchstick poster but with hearts!

VISUAL:
♡♡♡♡♡♡♡ ← all gray/light
        ♥ ← ONE is colored!

VISUAL APPROACH:
┌─────────────────────────────────────────────────┐
│                                                 │
│  small intro                                    │
│  ████████████████████████████████               │
│  ██  GREETING WORD (MASSIVE)  ██                │
│  ████████████████████████████████               │
│  subtitle                                       │
│                                                 │
│     ♡ ♡ ♡ ♡ ♡ ♡ ♥  ← ONE colored!               │
│                                                 │
│  message or signature                           │
│                                                 │
└─────────────────────────────────────────────────┘

🎯 GOAL: Hearts with ONE standing out - emotional rhythm!`
      },
      {
        name: "✨ Minimal Precious",
        prompt: `🎨 GREETING POSTER REDESIGN: ✨ MINIMAL PRECIOUS

═══════════════════════════════════════════════════════════════════
🌸 THIS IS A GREETING POSTER - Minimal but precious!
═══════════════════════════════════════════════════════════════════

POSTER MESSAGE:
${theirVision}

${RHYTHM_FLAT_RULES}

═══════════════════════════════════════════════════════════════════
✨ MINIMAL PRECIOUS - Simple, elegant, meaningful
═══════════════════════════════════════════════════════════════════

CONCEPT: Maximum white space, ONE precious element.
Like a museum piece - refined and elegant.

VISUAL:
• 80% white/cream space
• ONE simple flower or heart
• Typography as art

VISUAL APPROACH:
┌─────────────────────────────────────────────────┐
│                                                 │
│                                                 │
│                                                 │
│           🌸 (one simple element)               │
│                                                 │
│        GREETING WORD                            │
│        small subtitle                           │
│                                                 │
│                                                 │
│                                                 │
└─────────────────────────────────────────────────┘

🎯 GOAL: Minimal, precious, museum-quality greeting!`
      },
      {
        name: "🎀 Soft Gradient",
        prompt: `🎨 GREETING POSTER REDESIGN: 🎀 SOFT GRADIENT

═══════════════════════════════════════════════════════════════════
🌸 THIS IS A GREETING POSTER - Soft, warm, inviting!
═══════════════════════════════════════════════════════════════════

POSTER MESSAGE:
${theirVision}

${RHYTHM_FLAT_RULES}

═══════════════════════════════════════════════════════════════════
🎀 SOFT GRADIENT - Warm colors flowing
═══════════════════════════════════════════════════════════════════

CONCEPT: Soft color gradient background with clean typography.
Warm, inviting, gentle feeling.

COLORS:
• Soft gradient: cream to blush, or peach to coral
• White or dark text for contrast
• Gentle, warm feeling

VISUAL APPROACH:
┌─────────────────────────────────────────────────┐
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│░░░  (soft gradient background)             ░░░│
│░░░                                         ░░░│
│░░░  ████████████████████████████████       ░░░│
│░░░  ██  GREETING (MASSIVE)  ██             ░░░│
│░░░  ████████████████████████████████       ░░░│
│░░░                                         ░░░│
│░░░        simple element                   ░░░│
│░░░                                         ░░░│
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
└─────────────────────────────────────────────────┘

🎯 GOAL: Soft, warm gradient with clean greeting!`
      }
    ];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 📚 EDUCATIONAL CATEGORY - Clear, informative, visual metaphors
  // ═══════════════════════════════════════════════════════════════════════════
  // (Default - use existing prompts for educational/general)

  console.log("📚 Generating EDUCATIONAL/GENERAL prompts...");
  return [
    {
      name: "🔄 Transformation",
      prompt: `🎨 STEVE REDESIGN: 🔄 TRANSFORMATION (RHYTHM + FLAT)

═══════════════════════════════════════════════════════════════════
🎵 RHYTHM: Elements CHANGE to move the viewer's heart
🎨 FLAT DESIGN: Simple shapes, ONE accent color, meaningful visual
═══════════════════════════════════════════════════════════════════

POSTER CORE MESSAGE:
${theirVision}

CORE FEELING:
${coreFeeling}

═══════════════════════════════════════════════════════════════════
🔄 TRANSFORMATION - BEFORE → AFTER with RHYTHM
═══════════════════════════════════════════════════════════════════

CONCEPT: Show change/transformation with RHYTHM and FLAT DESIGN.

🎵 RHYTHM RULES (STRONG CONTRAST!):
• Typography: tiny intro → MASSIVE KEYWORD (3x bigger!) → small support
• The KEYWORD must be SO BIG it dominates the poster
• Visual: simple shapes, ONE pops with accent color
• Less is more - maximum 4-5 elements total

🎨 FLAT DESIGN RULES (ULTRA SIMPLE!):
• NO realistic illustrations - only GEOMETRIC shapes
• Simple circles, lines, arrows (no complex drawings)
• ONE accent color only (orange preferred)
• Solid white/cream background
• Clean, minimal, breathable

VISUAL STRUCTURE:
┌─────────────────────────────────────────────────┐
│                                                 │
│  small intro text                               │
│  ████████████████████████████                   │
│  ██   HUGE KEYWORD   ██                         │
│  ████████████████████████████                   │
│  medium supporting text                         │
│                                                 │
│     ○○○○○○○○●  ← one stands out                 │
│     [BEFORE] → [AFTER]                          │
│     (flat, simple illustration)                 │
│                                                 │
│  • detail  • detail  • detail                   │
│                                                 │
└─────────────────────────────────────────────────┘

TRANSFORMATION VISUALS (FLAT STYLE):
• Tangled line → Clean line (simple strokes)
• Gray circles → One ORANGE circle stands out
• Scattered dots → Connected dots
• Question mark → Exclamation mark
• Closed lock → Open lock (simple icons)

STYLE:
• Dark or light solid background
• White/black text + ONE accent (orange/red preferred)
• Simple flat icons and illustrations
• Dashed lines or arrows for FLOW/MOVEMENT
• Clean sans-serif typography with SIZE RHYTHM

🎯 GOAL: RHYTHM moves the eye, FLAT keeps it clean!`
    },
    {
      name: "📐 Editorial Grid",
      prompt: `🎨 STEVE REDESIGN: 📐 EDITORIAL GRID (RHYTHM + FLAT)

═══════════════════════════════════════════════════════════════════
🎵 RHYTHM: Typography size changes create visual music
🎨 FLAT DESIGN: Grid structure, clean shapes, one accent color
═══════════════════════════════════════════════════════════════════

POSTER CORE MESSAGE:
${theirVision}

CORE FEELING:
${coreFeeling}

═══════════════════════════════════════════════════════════════════
📐 EDITORIAL GRID - Swiss Typography with RHYTHM
═══════════════════════════════════════════════════════════════════

CONCEPT: Magazine cover style with typography RHYTHM.

🎵 TYPOGRAPHY RHYTHM (EXTREME CONTRAST!):
• Line 1: tiny text (10% size)
• Line 2: MASSIVE KEYWORD (60% of poster width!) - in ACCENT COLOR
• Line 3: small supporting text
• The keyword must DOMINATE - 3-4x bigger than other text!

🎨 FLAT DESIGN RULES (ULTRA MINIMAL!):
• Subtle grid lines (very light gray)
• Cream or white background
• Black text + ONE accent color (orange/red) for KEYWORD ONLY
• Maximum 1 simple visual element (scribble, simple icon)
• NO complex illustrations - only geometric shapes

VISUAL STRUCTURE:
┌─────────────────────────────────────────────────┐
│ ┃     ┃     ┃     ┃     ┃     ┃     ┃     ┃    │
│ ┃ We know what it takes to make your     ┃    │
│ ┃ ██████████████████████████████████     ┃    │
│ ┃ ██    KEYWORD (accent color)    ██     ┃    │
│ ┃ ██████████████████████████████████     ┃    │
│ ┃ stand out from the rest.               ┃    │
│ ┃     ┃     ┃     ┃     ┃     ┃     ┃     ┃    │
│ ┃     ┃     ┃     ┃     ○○○○●  (flat visual)   │
│ ┃     ┃     ┃     ┃     ┃     ┃     ┃     ┃    │
│ ┃─────┃─────┃─────┃─────┃─────┃─────┃─────┃    │
│ ┃ • point  • point  • point  • point     ┃    │
└─────────────────────────────────────────────────┘

FLAT VISUAL ELEMENTS:
• Simple scribble/tangle (one accent color)
• Flat icons in a row (one highlighted)
• Geometric shapes (circles, squares)
• Simple line illustration
• Dashed arrow showing direction/flow

STYLE:
• Light background with visible grid
• Black text, ONE accent color (red/orange)
• LEFT-ALIGNED text (editorial feel)
• Simple flat visual element
• Footer with bullet points

🎯 GOAL: Typography rhythm + Grid structure + Flat visual!`
    },
    {
      name: "💡 Stand Out",
      prompt: `🎨 STEVE REDESIGN: 💡 STAND OUT (RHYTHM + FLAT)

═══════════════════════════════════════════════════════════════════
🎵 RHYTHM: Repetition with ONE element standing out
🎨 FLAT DESIGN: Simple shapes, ONE accent pops
═══════════════════════════════════════════════════════════════════

POSTER CORE MESSAGE:
${theirVision}

CORE FEELING:
${coreFeeling}

═══════════════════════════════════════════════════════════════════
💡 STAND OUT - One Element Breaks the Pattern
═══════════════════════════════════════════════════════════════════

CONCEPT: Like the matchstick poster - many similar elements,
but ONE stands out with the accent color.

🎵 RHYTHM PATTERN (BOLD CONTRAST!):
• Typography: tiny → MASSIVE KEYWORD → small
• Visual: ○○○○○● - simple shapes, ONE is accent color
• Maximum 5-6 repeated elements, ONE stands out
• The accent element must be OBVIOUSLY different

🎨 FLAT DESIGN RULES (SUPER SIMPLE!):
• ONLY geometric shapes - circles, squares, lines
• NO realistic illustrations (no hearts, no complex icons)
• Solid flat colors - gray/black + ONE accent (orange)
• Clean white/cream background
• The visual must be SIMPLE but MEANINGFUL

VISUAL STRUCTURE:
┌─────────────────────────────────────────────────┐
│                                                 │
│  intro text line                                │
│  ████████████████████████████                   │
│  ██   KEYWORD   ██                              │
│  ████████████████████████████                   │
│  supporting text                                │
│                                                 │
│        ○ ○ ○ ○ ○ ○ ● ← ONE stands out!          │
│        (gray gray gray ORANGE)                  │
│                                                 │
│  OR:  ||||||||| |  ← one taller                 │
│  OR:  □□□□□□□■□ ← one different color           │
│                                                 │
│  • detail  • detail  • detail                   │
│                                                 │
└─────────────────────────────────────────────────┘

STAND OUT VISUAL IDEAS:
• Matchsticks: all gray tips, ONE orange
• Circles: all gray, ONE colored
• People icons: all gray, ONE highlighted
• Bars/lines: all same height, ONE taller
• Arrows: all pointing one way, ONE different

STYLE:
• Light or dark solid background
• Simple flat shapes (no 3D)
• Muted colors + ONE bright accent
• Clean typography with size rhythm
• The visual SHOWS the message

🎯 GOAL: Pattern pattern pattern → STAND OUT!`
    },
    {
      name: "🎯 Focus Flow",
      prompt: `🎨 STEVE REDESIGN: 🎯 FOCUS FLOW (RHYTHM + FLAT)

═══════════════════════════════════════════════════════════════════
🎵 RHYTHM: Visual flow guides the eye through the message
🎨 FLAT DESIGN: Clean arrows, simple shapes, one accent
═══════════════════════════════════════════════════════════════════

POSTER CORE MESSAGE:
${theirVision}

CORE FEELING:
${coreFeeling}

═══════════════════════════════════════════════════════════════════
🎯 FOCUS FLOW - Guide the Eye with Visual Rhythm
═══════════════════════════════════════════════════════════════════

CONCEPT: Use arrows, lines, and flow to create RHYTHM.
The eye follows a PATH through the design.

🎵 FLOW RHYTHM (SIMPLE PATH!):
• Typography: tiny → MASSIVE KEYWORD → small
• Visual: simple dashed arrow showing A → B journey
• Maximum 3-4 elements along the path
• Clear visual flow - eye knows where to go

🎨 FLAT DESIGN RULES (GEOMETRIC ONLY!):
• Simple dashed lines and arrows (no complex curves)
• Basic shapes: circles, squares, simple icons
• NO realistic illustrations (no anatomical hearts!)
• ONE accent color (orange) for focal points
• Clean white/cream background

VISUAL STRUCTURE:
┌─────────────────────────────────────────────────┐
│                                                 │
│  ████████████████████████                       │
│  ██   HEADLINE   ██                             │
│  ████████████████████████                       │
│                                                 │
│        ╭─ ─ ─ ─ ─ ─ ─ ─ ─╮                      │
│        ↓                 ↓                      │
│     [START]    →→→    [END]                     │
│     (problem)        (solution)                 │
│        ↑                                        │
│        ╰─ ─ ─ ─ ─ ─ ─ ─ ─                       │
│                                                 │
│  step 1 → step 2 → step 3 → step 4              │
│                                                 │
└─────────────────────────────────────────────────┘

FLOW ELEMENTS (FLAT):
• Dashed curved arrows (showing journey)
• Simple flat icons at key points
• Linear process: A → B → C → D
• Circular flow returning to start
• Connecting lines between elements

STYLE:
• Clean background (light or dark)
• Black/white + ONE accent color
• Flat arrows and lines (no 3D)
• Typography with size rhythm
• Visual flow guides the eye

🎯 GOAL: The eye FLOWS through the design naturally!`
    }
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔍 POSTER TYPE DETECTION (Legacy - for greeting/event specific styles)
// ═══════════════════════════════════════════════════════════════════════════
type PosterType = "greeting" | "event" | "product" | "unknown";

function detectPosterType(analysisResult: any): PosterType {
  if (!analysisResult) return "unknown";

  const analysisText = JSON.stringify(analysisResult).toLowerCase();

  // EVENT indicators: person, date, location, announcement, seminar, training
  const eventKeywords = ["person", "хүн", "event", "date", "огноо", "сар", "location",
    "announcement", "зарлал", "seminar", "сургалт", "training", "workshop", "conference",
    "chicago", "байршил", "speaker", "илтгэгч", "meeting"];

  // GREETING indicators: thank you, flower, birthday, congratulation
  const greetingKeywords = ["thank", "баярлалаа", "flower", "цэцэг", "birthday",
    "төрсөн өдөр", "congratulation", "баяр хүргэе", "greeting", "мэндчилгээ",
    "love", "хайр", "mother", "эх", "father", "аав", "wish"];

  // PRODUCT indicators: sale, price, discount, product, buy
  const productKeywords = ["sale", "хямдрал", "price", "үнэ", "discount", "%",
    "product", "бүтээгдэхүүн", "buy", "худалдаа", "shop", "дэлгүүр", "offer"];

  let eventScore = 0;
  let greetingScore = 0;
  let productScore = 0;

  eventKeywords.forEach(kw => { if (analysisText.includes(kw)) eventScore++; });
  greetingKeywords.forEach(kw => { if (analysisText.includes(kw)) greetingScore++; });
  productKeywords.forEach(kw => { if (analysisText.includes(kw)) productScore++; });

  console.log(`📊 Poster type scores: Event=${eventScore}, Greeting=${greetingScore}, Product=${productScore}`);

  if (eventScore > greetingScore && eventScore > productScore) return "event";
  if (greetingScore > eventScore && greetingScore > productScore) return "greeting";
  if (productScore > eventScore && productScore > greetingScore) return "product";

  return "unknown";
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎉 EVENT POSTER REDESIGN PROMPTS (Person + Event Announcement)
// ═══════════════════════════════════════════════════════════════════════════
const EVENT_REDESIGN_PROMPTS = [
  {
    name: "🎯 Modern Clean",
    prompt: `🔧 EVENT POSTER REDESIGN: 🎯 MODERN CLEAN STYLE

═══════════════════════════════════════════════════════════════════
⚠️ THIS IS AN EVENT ANNOUNCEMENT POSTER WITH A PERSON!
═══════════════════════════════════════════════════════════════════

MUST PRESERVE:
✅ The PERSON (face must be IDENTICAL!)
✅ The EVENT information (date, location, title)
✅ The brand/name

REDESIGN TO MODERN CLEAN STYLE:
┌─────────────────────────────────────────────────┐
│  [brand/logo]                                   │
│                                                 │
│         EVENT TITLE                             │
│      (bold, modern font)                        │
│                                                 │
│         📅 Date  📍 Location                   │
│                                                 │
│              👤                                 │
│         [PERSON PHOTO]                          │
│      (clean cutout, centered)                   │
│                                                 │
│         Speaker Name                            │
│                                                 │
└─────────────────────────────────────────────────┘

STYLE:
• Clean solid background (gradient or single color)
• Modern sans-serif typography
• Person photo with clean edges
• Clear hierarchy: Title → Date/Location → Person
• Professional, corporate quality`
  },
  {
    name: "✨ Premium Dark",
    prompt: `🔧 EVENT POSTER REDESIGN: ✨ PREMIUM DARK STYLE

═══════════════════════════════════════════════════════════════════
⚠️ THIS IS AN EVENT ANNOUNCEMENT POSTER WITH A PERSON!
═══════════════════════════════════════════════════════════════════

MUST PRESERVE:
✅ The PERSON (face must be IDENTICAL!)
✅ The EVENT information (date, location, title)
✅ The brand/name

REDESIGN TO PREMIUM DARK STYLE:
┌─────────────────────────────────────────────────┐
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓▓▓▓▓▓▓▓▓▓▓ [brand] ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓▓▓▓▓▓▓▓▓▓▓ EVENT TITLE ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓▓▓▓▓▓▓▓▓▓▓ (gold/white) ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 👤 ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓▓▓▓▓▓▓▓▓▓ [PERSON] ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓▓▓▓▓▓▓▓ 📅 Date  📍 Location ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
└─────────────────────────────────────────────────┘

STYLE:
• Dark background (black, navy, dark purple)
• Gold or white elegant text
• Person dramatically lit
• Luxury, premium feeling
• High contrast, professional`
  },
  {
    name: "🌈 Vibrant Gradient",
    prompt: `🔧 EVENT POSTER REDESIGN: 🌈 VIBRANT GRADIENT STYLE

═══════════════════════════════════════════════════════════════════
⚠️ THIS IS AN EVENT ANNOUNCEMENT POSTER WITH A PERSON!
═══════════════════════════════════════════════════════════════════

MUST PRESERVE:
✅ The PERSON (face must be IDENTICAL!)
✅ The EVENT information (date, location, title)
✅ The brand/name

REDESIGN TO VIBRANT GRADIENT STYLE:
• Bold, colorful gradient background
• Modern, energetic typography
• Person with dynamic pose
• Eye-catching, social media friendly
• Contemporary, trendy design

STYLE:
• Gradient background (purple-pink, blue-teal, orange-yellow)
• Bold white or dark text
• Clean person cutout
• Modern, Instagram-worthy
• Energetic and exciting`
  },
  {
    name: "📐 Minimal Grid",
    prompt: `🔧 EVENT POSTER REDESIGN: 📐 MINIMAL GRID STYLE

═══════════════════════════════════════════════════════════════════
⚠️ THIS IS AN EVENT ANNOUNCEMENT POSTER WITH A PERSON!
═══════════════════════════════════════════════════════════════════

MUST PRESERVE:
✅ The PERSON (face must be IDENTICAL!)
✅ The EVENT information (date, location, title)
✅ The brand/name

REDESIGN TO MINIMAL GRID STYLE:
• Clean white or light background
• Strong grid-based layout
• Lots of white space
• Minimal, Swiss design inspired
• Typography-focused

STYLE:
• Maximum white space
• Black text, minimal color
• Person photo in clean frame
• Grid alignment
• Professional, editorial quality`
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// 🌸 GREETING/FLOWER POSTER REDESIGN PROMPTS
// ═══════════════════════════════════════════════════════════════════════════
const GREETING_REDESIGN_PROMPTS = [
  {
    name: "?? Watercolor",
    prompt: `🔧 COMPLETE REDESIGN: 🎨 WATERCOLOR + NEW LAYOUT

═══════════════════════════════════════════════════════════════════
⚠️ THIS IS A LAYOUT REDESIGN, NOT JUST AN EFFECT!
═══════════════════════════════════════════════════════════════════

🚫 DO NOT COPY THE ORIGINAL LAYOUT!
🚫 Original has: flower LEFT, text RIGHT → DO NOT DO THIS!
🚫 CREATE A COMPLETELY NEW COMPOSITION!

═══════════════════════════════════════════════════════════════════
📐 NEW LAYOUT: CENTERED GREETING CARD
═══════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────┐
│               [brand - small]                   │
│                                                 │
│                    🌻                           │
│              WATERCOLOR FLOWER                  │
│                (CENTERED)                       │
│                                                 │
│               Thank You                         │
│            (centered below)                     │
│                                                 │
│        secondary message here                   │
│                                                 │
│               [footer]                          │
└─────────────────────────────────────────────────┘

LAYOUT REQUIREMENTS:
• Flower in CENTER of design (not left, not right!)
• Text BELOW flower (not beside it!)
• Everything CENTERED and balanced
• 30-40% white space around edges
• Greeting card proportions

VISUAL STYLE:
• Soft watercolor illustration
• Color bleeds, visible brushstrokes
• Cream/white clean background
• Elegant script typography

CREATE A NEW DESIGN, NOT A FILTERED VERSION!`
  },
  {
    name: "?? Pencil",
    prompt: `🔧 COMPLETE REDESIGN: ✏️ PENCIL + MINIMAL LAYOUT

═══════════════════════════════════════════════════════════════════
⚠️ THIS IS A LAYOUT REDESIGN, NOT JUST AN EFFECT!
═══════════════════════════════════════════════════════════════════

🚫 DO NOT COPY THE ORIGINAL LAYOUT!
🚫 Original has: flower LEFT, text RIGHT → DO NOT DO THIS!
🚫 CREATE A COMPLETELY NEW COMPOSITION!

═══════════════════════════════════════════════════════════════════
📐 NEW LAYOUT: MINIMAL ART PRINT (70% WHITE SPACE!)
═══════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────┐
│                                                 │
│                                                 │
│                                                 │
│                   🌻                            │
│              (small flower)                     │
│                                                 │
│                                                 │
│              thank you                          │
│           (tiny elegant text)                   │
│                                                 │
│                                                 │
│                                                 │
│                                                 │
└─────────────────────────────────────────────────┘

LAYOUT REQUIREMENTS:
• 70% OF THE POSTER IS EMPTY WHITE SPACE!
• Small, delicate flower in center
• Tiny elegant text below
• Museum art print feeling
• Extreme minimalism

VISUAL STYLE:
• Black & white or sepia pencil sketch
• Fine linework, delicate shading
• Clean white/cream background
• Thin, elegant typography

CREATE A NEW DESIGN, NOT A FILTERED VERSION!`
  },
  {
    name: "📷 Real",
    prompt: `🔧 COMPLETE REDESIGN: 📷 REAL PHOTO - SWEET & DELICATE

═══════════════════════════════════════════════════════════════════
⚠️ THIS IS A LAYOUT REDESIGN, NOT JUST AN EFFECT!
═══════════════════════════════════════════════════════════════════

🚫 DO NOT COPY THE ORIGINAL LAYOUT!
🚫 Original has: flower LEFT, text RIGHT → DO NOT DO THIS!
🚫 CREATE A COMPLETELY NEW COMPOSITION!

═══════════════════════════════════════════════════════════════════
📐 NEW LAYOUT: TEXT TOP, SMALL DELICATE FLOWER BOTTOM
═══════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────┐
│                                                 │
│            [brand - small]                      │
│                                                 │
│             Thank You                           │
│          (elegant, centered)                    │
│                                                 │
│       May happiness and joy...                  │
│          (soft secondary text)                  │
│                                                 │
│                                                 │
│                                                 │
│                 🌼                              │
│         (SMALL, delicate flower)                │
│          (thin stem, gentle)                    │
│                                                 │
│              [footer]                           │
└─────────────────────────────────────────────────┘

🌸 THE FEELING MUST BE: SWEET, LIGHT, GENTLE, SOFT 🌸

FLOWER SIZE & PROPORTION:
• Flower should be SMALL - only 25-35% of the poster height
• NOT big and bold - DELICATE and sweet
• Single thin stem
• Lots of EMPTY SPACE around the flower
• The flower should feel LIGHT, not heavy

BACKGROUND:
• SOFT, MUTED color that matches the flower
• Yellow flower → Soft golden/cream yellow (not bright!)
• Pink flower → Soft blush pink
• The color should be GENTLE, not saturated

TYPOGRAPHY:
• Elegant, SOFT typography
• Not too bold - refined and gentle
• White or cream colored text
• Should feel SWEET and WARM

THE OVERALL FEELING:
• Like a gentle whisper, not a shout
• Sweet, warm, personal
• Light and airy, not heavy
• Delicate and refined
• Makes you feel warm inside

⚠️ DO NOT make the flower too big or dominant!
⚠️ The feeling must be SWEET and GENTLE!`
  },
  {
    name: "✨ Elegant",
    prompt: `🔧 COMPLETE REDESIGN: ✨ ELEGANT - DARK BG, TEXT TOP, FLOWER BOTTOM

═══════════════════════════════════════════════════════════════════
⚠️ THIS IS A LAYOUT REDESIGN, NOT JUST AN EFFECT!
═══════════════════════════════════════════════════════════════════

🚫 DO NOT COPY THE ORIGINAL LAYOUT!
🚫 Original has: flower LEFT, text RIGHT → DO NOT DO THIS!
🚫 CREATE A COMPLETELY NEW COMPOSITION!

═══════════════════════════════════════════════════════════════════
📐 NEW LAYOUT: DARK BACKGROUND, TEXT TOP, REAL FLOWER BOTTOM CENTER
═══════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────┐
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓▓▓▓▓▓▓▓▓▓▓ Thank You ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓▓▓▓▓▓▓▓▓ (GOLD text, TOP) ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓▓▓▓▓▓▓ May happiness and joy... ▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 🌻 ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓▓▓▓▓▓▓▓▓▓▓ REAL FLOWER ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓▓▓▓▓▓▓▓ (bottom, centered) ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓▓▓▓▓▓▓▓▓▓▓ [brand footer] ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
└─────────────────────────────────────────────────┘

LAYOUT REQUIREMENTS:
• DARK background (dark navy blue or black)
• Text at TOP in GOLD/CREAM color
• Real flower photo at BOTTOM CENTER
• Single flower with stem
• Luxury, dramatic, elegant feeling

VISUAL STYLE:
• REAL flower photograph (not illustration!)
• Single flower with stem, dramatic lighting
• Dark navy/black solid background
• GOLD or CREAM colored text (not white!)
• Elegant serif or script typography
• High contrast, luxury magazine quality

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

async function lockSourceLogoBlock(originalImageData: string, generatedImageData: string): Promise<string> {
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  try {
    const originalMatch = originalImageData.match(/^data:(.+);base64,(.+)$/);
    const generatedMatch = generatedImageData.match(/^data:(.+);base64,(.+)$/);
    if (!originalMatch || !generatedMatch) return generatedImageData;

    const originalBuffer = Buffer.from(originalMatch[2], "base64");
    const generatedBuffer = Buffer.from(generatedMatch[2], "base64");

    const originalMeta = await sharp(originalBuffer).metadata();
    if (!originalMeta.width || !originalMeta.height) return generatedImageData;

    const targetWidth = originalMeta.width;
    const targetHeight = originalMeta.height;
    const preparedGenerated = await sharp(generatedBuffer)
      .resize(targetWidth, targetHeight, { fit: "cover" })
      .png()
      .toBuffer();

    // Keep logo region centered/top but slightly tighter to avoid a visible rectangular patch.
    const left = Math.max(0, Math.floor(targetWidth * 0.24));
    const top = Math.max(0, Math.floor(targetHeight * 0.04));
    const width = Math.max(1, Math.min(Math.floor(targetWidth * 0.52), targetWidth - left));
    const height = Math.max(1, Math.min(Math.floor(targetHeight * 0.24), targetHeight - top));

    const logoPatch = await sharp(originalBuffer)
      .extract({ left, top, width, height })
      .png()
      .toBuffer();

    const generatedPatch = await sharp(preparedGenerated)
      .extract({ left, top, width, height })
      .png()
      .toBuffer();

    // Harmonize tone so the preserved logo patch blends into the new poster lighting.
    const srcAvg = await sharp(logoPatch).resize(1, 1).removeAlpha().raw().toBuffer();
    const dstAvg = await sharp(generatedPatch).resize(1, 1).removeAlpha().raw().toBuffer();
    const channelScale: [number, number, number] = [
      clamp(dstAvg[0] / Math.max(srcAvg[0], 1), 0.85, 1.15),
      clamp(dstAvg[1] / Math.max(srcAvg[1], 1), 0.85, 1.15),
      clamp(dstAvg[2] / Math.max(srcAvg[2], 1), 0.85, 1.15),
    ];
    const brightnessScale = clamp(
      (dstAvg[0] + dstAvg[1] + dstAvg[2]) / Math.max(srcAvg[0] + srcAvg[1] + srcAvg[2], 1),
      0.92,
      1.08
    );

    const harmonizedPatch = await sharp(logoPatch)
      .removeAlpha()
      .linear(channelScale, [0, 0, 0])
      .modulate({ brightness: brightnessScale })
      .png()
      .toBuffer();

    // Build a logo-focused matte (not a full rectangle) so the logo integrates into new background.
    const sourceRaw = await sharp(logoPatch).removeAlpha().raw().toBuffer();
    const generatedRaw = await sharp(generatedPatch).removeAlpha().raw().toBuffer();
    const sourceBlurRaw = await sharp(logoPatch).removeAlpha().blur(12).raw().toBuffer();

    // Estimate local background color from border pixels of the source logo patch.
    const bgBorder = Math.max(2, Math.round(Math.min(width, height) * 0.08));
    let bgSumR = 0;
    let bgSumG = 0;
    let bgSumB = 0;
    let bgCount = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (x < bgBorder || x >= width - bgBorder || y < bgBorder || y >= height - bgBorder) {
          const o = (y * width + x) * 3;
          bgSumR += sourceRaw[o];
          bgSumG += sourceRaw[o + 1];
          bgSumB += sourceRaw[o + 2];
          bgCount += 1;
        }
      }
    }
    const bgR = bgCount > 0 ? bgSumR / bgCount : 240;
    const bgG = bgCount > 0 ? bgSumG / bgCount : 240;
    const bgB = bgCount > 0 ? bgSumB / bgCount : 240;
    const detailMaskRaw = Buffer.alloc(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const o = idx * 3;
        const r = sourceRaw[o];
        const g = sourceRaw[o + 1];
        const b = sourceRaw[o + 2];
        const gr = generatedRaw[o];
        const gg = generatedRaw[o + 1];
        const gb = generatedRaw[o + 2];
        const br = sourceBlurRaw[o];
        const bg = sourceBlurRaw[o + 1];
        const bb = sourceBlurRaw[o + 2];

        const diff = Math.max(Math.abs(r - br), Math.abs(g - bg), Math.abs(b - bb));
        const crossDiff = Math.max(Math.abs(r - gr), Math.abs(g - gg), Math.abs(b - gb));
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const saturation = maxC === 0 ? 0 : (maxC - minC) / maxC;

        const detail = clamp((diff - 16) / 56, 0, 1);
        const chroma = clamp((saturation - 0.14) / 0.38, 0, 1);
        const strengthRaw = Math.max(detail * 1.2, chroma * 0.85);
        const diffGate = clamp((crossDiff - 18) / 70, 0, 1);
        const baseStrength = clamp((strengthRaw - 0.30) / 0.70, 0, 1);
        const isNeutralBright = maxC > 210 && saturation < 0.10;
        const strength = isNeutralBright ? 0 : baseStrength * Math.max(0.55, diffGate);
        detailMaskRaw[idx] = Math.round(strength * 255);
      }
    }

    const softenedDetailRaw = await sharp(detailMaskRaw, {
      raw: { width, height, channels: 1 },
    })
      .blur(1.6)
      .raw()
      .toBuffer();

    // Combine detail matte with edge feather to avoid visible patch boundaries.
    const featherX = Math.max(10, Math.round(width * 0.10));
    const featherY = Math.max(10, Math.round(height * 0.12));
    const maxAlpha = 245;
    const alphaRaw = Buffer.alloc(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const edgeX = Math.min(x, width - 1 - x);
        const edgeY = Math.min(y, height - 1 - y);
        const ax = clamp(edgeX / featherX, 0, 1);
        const ay = clamp(edgeY / featherY, 0, 1);
        const feather = Math.min(ax, ay);
        const detail = softenedDetailRaw[idx] / 255;
        const core = detail > 0.30 ? Math.pow((detail - 0.30) / 0.70, 1.2) : 0;
        const o = idx * 3;
        const r = sourceRaw[o];
        const g = sourceRaw[o + 1];
        const b = sourceRaw[o + 2];
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;
        const distToBg = Math.sqrt(
          (r - bgR) * (r - bgR) + (g - bgG) * (g - bgG) + (b - bgB) * (b - bgB)
        );
        const bgKey = clamp((distToBg - 18) / 80, 0, 1);
        const satKey = clamp((sat - 0.08) / 0.45, 0, 1);
        const nearBg = distToBg < 26 && sat < 0.12;
        const keep = nearBg ? 0 : Math.max(bgKey, satKey);
        alphaRaw[idx] = Math.round(maxAlpha * core * feather * keep);
      }
    }

    const alphaMask = await sharp(alphaRaw, { raw: { width, height, channels: 1 } })
      .linear(1.35, -24)
      .blur(0.7)
      .png()
      .toBuffer();

    const softenedPatch = await sharp(harmonizedPatch)
      .joinChannel(alphaMask)
      .png()
      .toBuffer();

    const composited = await sharp(preparedGenerated)
      .composite([{ input: softenedPatch, left, top, blend: "over" }])
      .png()
      .toBuffer();

    return `data:image/png;base64,${composited.toString("base64")}`;
  } catch (error) {
    console.warn("Logo block lock failed; using original generated image.", error);
    return generatedImageData;
  }
}

/*
// Remove background using Replicate's BiRefNet model
async function removeBackground(imageBase64: string): Promise<Buffer> {
  if (!REPLICATE_API_TOKEN) {
    throw new Error("Replicate API token not configured");
  }

  console.log("🔄 Calling BiRefNet via Replicate API...");

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

  console.log("✅ BiRefNet completed!");

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

*/
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
  aspectRatio?: AspectRatio
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
      const isRedesign = prompt.includes("🔧 REDESIGN") || prompt.includes("REDESIGN") || prompt.includes("EVENT POSTER REDESIGN") || isUnderstandingBased;
      const isEventPoster = prompt.includes("EVENT POSTER REDESIGN") || prompt.includes("THIS IS AN EVENT ANNOUNCEMENT POSTER");

      // SKETCH-TO-DESIGN: No special wrappers, just use the prompt directly
      if (isSketchToDesign) {
        console.log("✏️ Sketch-to-Design mode - using prompt directly");
        parts.push({ text: prompt });
      }
      // PRODUCT-TO-POSTER: No special wrappers, just use the prompt directly
      else if (isProductToPoster) {
        console.log("📦 Product-to-Poster mode - using prompt directly");
        parts.push({ text: prompt });
      }
      // 🧒 KIDS ELEVATION MODE - Keep 3D cartoon style, DON'T flatten!
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
      // 🎄 CHRISTMAS ELEVATION MODE - Keep core element, REMOVE clutter!
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
          // UNDERSTANDING-BASED REDESIGN - Poster-ийн гол санааг ойлгоод хүчирхэгжүүлэх
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
            text: `═══════════════════════════════════════════════════════════════════
🎪 EVENT POSTER REDESIGN - PRESERVE PERSON, NEW DESIGN!
═══════════════════════════════════════════════════════════════════

⚠️⚠️⚠️ CRITICAL RULES FOR EVENT POSTERS ⚠️⚠️⚠️

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

═══════════════════════════════════════════════════════════════════
You are looking at this poster to extract:
- Who is the PERSON? (preserve their face exactly!)
- What is the EVENT? (title, date, location)
- What is the BRAND? (logo, organization name)

Then CREATE a fresh professional design!
═══════════════════════════════════════════════════════════════════

YOUR DESIGN INSTRUCTIONS:
═══════════════════════════════════════════════════════════════════
${prompt}

═══════════════════════════════════════════════════════════════════
THINK OF IT THIS WAY:
A client showed you their event poster with a speaker photo.
They said "Keep the speaker's face EXACTLY the same, but create
a completely NEW professional event poster design."
═══════════════════════════════════════════════════════════════════`,
          });
        } else {
          // GREETING/FLOWER POSTER REDESIGN MODE - Premium Botanical Elevation
          parts.push({
            text: `═══════════════════════════════════════════════════════════════════
🌸 PREMIUM BOTANICAL REDESIGN - CREATE FRESH ARTWORK!
═══════════════════════════════════════════════════════════════════

🚫🚫🚫 ABSOLUTE RULES - MUST FOLLOW! 🚫🚫🚫

1. THE ORIGINAL PHOTO MUST NOT APPEAR IN YOUR DESIGN!
2. THE ORIGINAL TEXT STYLING MUST NOT APPEAR IN YOUR DESIGN!
3. CREATE EVERYTHING FRESH AND NEW!

You are looking at this poster ONLY to extract:
- What TYPE of flower? (sunflower, daisy, rose, etc.)
- What is the MESSAGE? (thank you, happy birthday, etc.)
- What is the brand name? (for small footer credit)

Then FORGET everything visual about the original!

═══════════════════════════════════════════════════════════════════
❌ DO NOT DO THESE THINGS!
═══════════════════════════════════════════════════════════════════

❌ NO original photo anywhere (not left, not right, not background)
❌ NO original text styling (the white text on yellow - don't copy it!)
❌ NO split layouts with the original image
❌ NO ghosting or watermarks of original content
❌ The original design should be 0% visible

═══════════════════════════════════════════════════════════════════
✅ CREATE THIS INSTEAD:
═══════════════════════════════════════════════════════════════════

✅ A NEW realistic botanical illustration of the flower
   - Draw it fresh, don't copy the photo
   - Realistic style, like botanical encyclopedia art
   - Beautiful, detailed, professional

✅ NEW typography styling
   - Elegant serif or script fonts
   - NEW font colors (dark charcoal, brown, forest green)
   - NOT white text - use DARK text on light background

✅ FRESH clean layout
   - Light background (cream, white, or soft tint)
   - Centered composition
   - Premium greeting card feel

═══════════════════════════════════════════════════════════════════
YOUR DESIGN INSTRUCTIONS:
═══════════════════════════════════════════════════════════════════
${prompt}

═══════════════════════════════════════════════════════════════════
THINK OF IT THIS WAY:
A client showed you their poster and said "I love the flower and message,
but please create a completely NEW premium design from scratch."
You use their poster as BRIEF only, then create original artwork.
═══════════════════════════════════════════════════════════════════`,
          });
        }
      } else {
        // ARTISTIC STYLE MODE - For good posters that just need style variations
        parts.push({
          text: `You are an elite poster designer transforming this image.

TRANSFORMATION STYLE:
${prompt}

═══════════════════════════════════════════════════
🔒 SACRED - DO NOT CHANGE:
═══════════════════════════════════════════════════

1. FACE IS SACRED
   - The person's face must be PIXEL-PERFECT IDENTICAL
   - Same facial features, same expression, same eyes looking same direction
   - Same skin tone, same glasses if any
   - If you change the face even 1% - YOU HAVE FAILED
   - This is non-negotiable. The person must be RECOGNIZABLE.

2. CORE CONCEPT IS SACRED
   - The main message/story of the poster stays the same
   - If it's about "$0 to $29" - that story remains
   - If it's about transformation - keep that narrative
   - The MEANING doesn't change, only the PRESENTATION

3. TEXT CONTENT IS SACRED
   - All text must say the SAME THING (same meaning)
   - "$0" stays "$0", "$29" stays "$29"
   - You can make text MORE BEAUTIFUL, BIGGER, BETTER STYLED
   - But the WORDS and NUMBERS stay the same

4. ICONS & VISUAL ELEMENTS - KEEP AND IMPROVE
   - If there are social media icons - KEEP THEM, make them prettier
   - If there are arrows, symbols - KEEP THEM, style them better
   - Don't remove elements, ELEVATE them

═══════════════════════════════════════════════════
✅ YOU CAN AND SHOULD CHANGE:
═══════════════════════════════════════════════════

1. CLOTHING - CHANGE IT DRAMATICALLY!
   - You MUST change the clothing to match the artistic style
   - Don't keep the original clothes - CREATE NEW OUTFIT!
   - Examples of clothing changes:
     * Watercolor style → Soft pastel sweater, flowy fabrics, artistic look
     * Pencil sketch → Simple white t-shirt, casual hoodie, minimal
     * Professional → Sharp gray suit, business casual, premium look
     * Bold/Vibrant → Bright colored jacket, bold patterns, eye-catching
   - The clothing should look like it BELONGS in the artistic style
   - Original blue suit can become: sweater, hoodie, t-shirt, different colored suit, casual shirt, etc.

2. BACKGROUND - COMPLETELY NEW
   - Create a new background that matches the artistic style
   - Can be completely different from original
   - Should enhance the poster's message

3. COLORS & LIGHTING
   - Apply the artistic style's color palette
   - Better lighting, shadows, highlights
   - Color grading that fits the mood

4. COMPOSITION & UI
   - Improve the layout if needed
   - Better spacing, alignment
   - More professional arrangement
   - Fix bad aspect ratios

5. ARTISTIC STYLE
   - Apply the specified artistic effect fully
   - Watercolor = soft, flowing, painterly, dreamy colors
   - Pencil sketch = detailed lines, hand-drawn feel, paper texture
   - Professional = clean, modern, polished, premium
   - Bold = high contrast, vibrant, neon accents, eye-catching

═══════════════════════════════════════════════════
GENERATE THE TRANSFORMED VERSION NOW.
The person's face MUST be identical. Everything else can be elevated.
═══════════════════════════════════════════════════`,
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
  let data: { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> } }> } | null = null;
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
      const errorData = await response.json().catch(() => ({}));
      console.error(`Gemini Image API error (${modelName}):`, JSON.stringify(errorData));
      const errorMessage = errorData?.error?.message || `Status ${response.status}`;
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

    data = (await response.json()) as typeof data;
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

    // Determine which prompts to use based on mode or direct prompts
    let prompts: string[] = [];
    let variationNames: string[] = [];

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
      console.log("🎨 ARTISTIC STYLE MODE selected");
      console.log("   Preserving the poster's soul, enhancing its mood...");
      const allPrompts = resolveArtisticStyles(artisticStyles, artisticExtra);
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
      console.log(`🎚️ Intensity: ${artisticIntensity || "balanced"} | Text: ${effectiveArtisticTextSafety || "strict"} | Color: ${artisticColorFidelity || "preserve"}`);

      prompts = allPrompts.map(p => `${p.prompt}\n\n${optionsBlock}${gradientBlock ? `\n\n${gradientBlock}` : ""}${moodboardBlock ? `\n\n${moodboardBlock}` : ""}${referenceBlock ? `\n\n${referenceBlock}` : ""}${inspirationBlock ? `\n\n${inspirationBlock}` : ""}`);
      variationNames = allPrompts.map(p => p.name);
    } else if (mode === "redesign") {
      // REDESIGN MODE - UNDERSTANDING-BASED: Poster-ийн гол санааг ойлгоод хүчирхэгжүүлэх
      console.log("═══════════════════════════════════════════════════════════════════");
      console.log("🧠 UNDERSTANDING-BASED REDESIGN MODE");
      console.log("═══════════════════════════════════════════════════════════════════");
      console.log("?? Strengthening the poster's core message...");

      // Generate prompts based on understanding the poster's core message
      const understandingPrompts = generateUnderstandingPrompts(analysisResult);
      const presetRules = redesignPreset ? REDESIGN_PRESET_RULES[redesignPreset] : "";

      if (redesignPreset && presetRules) {
        console.log(`🎛️ Redesign preset: ${redesignPreset}`);
      }

      console.log("═══════════════════════════════════════════════════════════════════");
      console.log("🎯 Creating 4 understanding-based variations:");
      understandingPrompts.forEach((p, i) => console.log(`   ${i + 1}. ${p.name}`));
      console.log("═══════════════════════════════════════════════════════════════════");

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
      console.log("═══════════════════════════════════════════════════════════════════");

      prompts = understandingPrompts.map(p => {
        const basePrompt = presetRules ? `${p.prompt}\n\n${presetRules}` : p.prompt;
        return `${basePrompt}${gradientBlock ? `\n\n${gradientBlock}` : ""}${moodboardBlock ? `\n\n${moodboardBlock}` : ""}${referenceBlock ? `\n\n${referenceBlock}` : ""}${inspirationBlock ? `\n\n${inspirationBlock}` : ""}`;
      });
      variationNames = understandingPrompts.map(p => p.name);
    } else if (mode === "sketch-to-design") {
      // SKETCH-TO-DESIGN MODE - Generate professional design from hand-drawn sketch
      console.log("═══════════════════════════════════════════════════════════════════");
      console.log("✏️ SKETCH-TO-DESIGN MODE");
      console.log("═══════════════════════════════════════════════════════════════════");

      console.log(`📝 Headline: ${sketchInputs?.headline || 'N/A'}`);
      console.log(`🎨 Style: ${sketchStyle || 'minimal'}`);
      console.log(`🏷️ Category: ${sketchCategory || 'product'}`);

      // Generate sketch-to-design prompts
      const sketchPrompts = generateSketchToDesignPrompts(sketchInputs, sketchStyle, sketchCategory, sketchLayout);

      prompts = sketchPrompts.map(p => p.prompt);
      variationNames = sketchPrompts.map(p => p.name);

      console.log("🎯 Creating 4 design variations from sketch:");
      variationNames.forEach((name, i) => console.log(`   ${i + 1}. ${name}`));
      console.log("═══════════════════════════════════════════════════════════════════");
    } else if (mode === "product-to-poster") {
      // PRODUCT-TO-POSTER MODE - Generate marketing poster from product photo
      console.log("═══════════════════════════════════════════════════════════════════");
      console.log("📦 PRODUCT-TO-POSTER MODE");
      console.log("═══════════════════════════════════════════════════════════════════");

      console.log(`📝 Headline: ${productInputs?.headline || 'N/A'}`);
      console.log(`🎯 Campaign: ${productCampaign || 'awareness'}`);
      console.log(`🎨 Style: ${productStyle || 'premium'}`);
      if (productInfo) {
        console.log(`📦 Product: ${productInfo.product_type}`);
        console.log(`👤 Target: ${productInfo.target_demographic.age_range} / ${productInfo.target_demographic.gender}`);
        console.log(`💎 Tier: ${productInfo.price_positioning}`);
      }

      // Generate product-to-poster prompts
      const productPrompts = generateProductToPosterPrompts(productInputs, productCampaign, productStyle, productInfo);

      prompts = productPrompts.map(p => p.prompt);
      variationNames = productPrompts.map(p => p.name);

      console.log("🎯 Creating 4 poster variations from product:");
      variationNames.forEach((name, i) => console.log(`   ${i + 1}. ${name}`));
      console.log("═══════════════════════════════════════════════════════════════════");
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

    const coreRulesFile = pickCoreRulesPrompt(DEFAULT_CORE_RULES);
    const coreRules = loadPromptFile(coreRulesFile);
    const coreRulesText = coreRules.content;
    const layoutLockBlock = `\n\nLAYOUT LOCK (MANDATORY):\n- Preserve the existing poster layout geometry and structure exactly.\n- Keep all existing text blocks, visual zones, and relative positions unchanged.\n- Do NOT move, resize, rotate, crop, mirror, stretch, or reorder blocks/sections.\n- You may only apply non-geometric visual updates:\n  - background texture / color grading / atmosphere\n  - text typography updates (typeface, tracking, weight, weight-driven style)\n  - visual style updates to existing elements (texture, shading, lighting, surface feel)\n  - content edits are optional only when explicitly requested by the user.\n- Keep hierarchy and spacing rhythm intact.\n- Treat the poster as the same layout shell with refreshed styling.`;
    const brandPreservationBlock = brandHint
      ? `\n\nSOURCE LOGO PRESERVATION:\n- A logo appears to be present (${brandHint}). Preserve its exact icon, wordmark text, font, proportions, geometry, and vertical/horizontal orientation.\n- Keep logo position and size fixed exactly as in source (no X/Y movement).\n- Do NOT move, rotate, mirror, flip, stretch, crop, resize, redraw, replace, retype, reinterpret, or reflow the logo/wordmark.\n- Keep icon/wordmark letterforms, spacing, and wordmark text unchanged as one unit.\n- You may apply only non-geometric effects to the logo surface (lighting, texture, or color style) without changing its shape, size, or position.\n- Do NOT add any new brand marks/icons other than the original logo block.\n- Do NOT duplicate the logo/wordmark or place additional logo copies.\n- Do NOT generate a second logo in a different location.`
      : "\n\nSOURCE LOGO PRESERVATION:\n- If any logo or wordmark is present, preserve its exact icon, wordmark text, font, proportions, geometry, and vertical/horizontal orientation.\n- Keep logo position and size fixed exactly as in source (no X/Y movement).\n- Do NOT move, rotate, mirror, flip, stretch, crop, resize, redraw, replace, retype, reinterpret, or reflow the logo/wordmark.\n- Keep icon/wordmark letterforms, spacing, and wordmark text unchanged as one unit.\n- You may apply only non-geometric effects to the logo surface (lighting, texture, or color style) without changing its shape, size, or position.\n- Do NOT add any new logos/brand marks.\n- Do NOT duplicate the logo/wordmark or place additional logo copies.\n- Do NOT generate a second logo in a different location.\n- If no logo is visible, this section can be ignored;";
    const logoPixelLockBlock = `\n\nLOGO PIXEL-LOCK (HIGHEST PRIORITY):\n- Treat the source logo block (icon + wordmark) as immutable content.\n- Keep icon silhouette, inner geometry, and all letterforms exactly unchanged.\n- Preserve logo text exactly as in source; do NOT rewrite, regenerate, or reinterpret any character.\n- Preserve original logo arrangement/orientation exactly (vertical stays vertical, horizontal stays horizontal).\n- Preserve logo block location and size exactly (no movement or rescaling).\n- Keep exactly one logo block; do NOT add, duplicate, or relocate a second logo.\n- Allowed edits: only non-geometric surface effects (color tint, lighting, texture, shadow).\n- Forbidden edits: move, reshape, redraw, crop, stretch, rotate, mirror, warp, perspective, resize, retype, reflow, replacement, or icon substitution.\n- If uncertain, keep the logo area unchanged from source and style around it.`;
    const exactWordmarkLockBlock = exactBrandWordmark
      ? `\n- EXACT WORDMARK TEXT LOCK: keep "${exactBrandWordmark}" exactly unchanged (same letters, same order, same case).`
      : "";

    // Prepend core rules so they have maximum weight in the prompt.
    prompts = prompts.map(prompt => `${coreRulesText}\n\n${layoutLockBlock}${brandPreservationBlock}${logoPixelLockBlock}${exactWordmarkLockBlock}\n\n${prompt}`);

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
      console.log(`🎨 BACKGROUND-ONLY MODE: Preserving ALL foreground elements (person, text, icons)`);
      console.log(`📸 Extracting foreground from original image...`);

      // Get original image dimensions
      const base64Match = originalImage.match(/^data:(.+);base64,(.+)$/);
      if (!base64Match) {
        return NextResponse.json({ error: "Invalid image format" }, { status: 400 });
      }
      const originalBuffer = Buffer.from(base64Match[2], "base64");
      const originalMetadata = await sharp(originalBuffer).metadata();
      const origWidth = originalMetadata.width || 1280;
      const origHeight = originalMetadata.height || 720;
      console.log(`📐 Original dimensions: ${origWidth}x${origHeight}`);

      // Extract foreground (person + text + icons) - only do this ONCE
      let foregroundPng: Buffer;
      try {
        foregroundPng = await removeBackground(originalImage);
        console.log(`✅ Foreground extracted successfully!`);
      } catch (err) {
        console.error(`❌ Background removal failed:`, err);
        // Fallback to image-to-image mode
        console.log(`⚠️ Falling back to image-to-image mode...`);
        // Continue below with regular mode
        foregroundPng = null as unknown as Buffer;
      }

      if (foregroundPng) {
        // Generate backgrounds and composite
        const generateWithComposite = async (prompt: string, index: number): Promise<GeneratedImage | null> => {
          try {
            console.log(`🖼️ Generating background ${index}...`);
            const backgroundImage = await generateBackgroundOnly(prompt, origWidth, origHeight);
            if (!backgroundImage) {
              console.error(`❌ Background generation failed for ${index}`);
              return null;
            }
            console.log(`✅ Background ${index} generated!`);

            console.log(`🔧 Compositing foreground onto background ${index}...`);
            let finalImage = await compositeOntoBackground(foregroundPng, backgroundImage, origWidth, origHeight);
            finalImage = await normalizeAspectRatio(finalImage, aspectRatio);
            console.log(`✅ Image ${index} complete! 100% original elements preserved.`);

            return { index, imageData: finalImage, prompt, provider: "gemini-composite" };
          } catch (err) {
            console.error(`❌ Error in composite generation ${index}:`, err);
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
        const savedPaths: string[] = [];
        if (SAVE_GENERATED_IMAGES) {
          for (const img of generatedImages) {
            const varName = variationNames[img.index] || `Variation ${img.index + 1}`;
            const savedPath = saveImageToDisk(img.imageData, varName, img.index);
            if (savedPath) savedPaths.push(savedPath);
          }
          console.log(`💾 Auto-saved ${savedPaths.length} images to: ${SAVE_FOLDER}`);
        }

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
    const shouldValidateLogo = provider === "nano" && Boolean(originalForGen);
    const shouldLockSourceLogoBlock = provider === "nano" && Boolean(originalForGen && brandHint);
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
          const logoRetryLimit = shouldValidateLogo ? 4 : 2;
          let attemptsUsed = 0;
          let logoVerified = !shouldValidateLogo;
          for (let attempt = 1; attempt <= logoRetryLimit; attempt++) {
            attemptsUsed = attempt;
            try {
              const retryConstraint =
                attempt > 1 && brandHint
                  ? "\n\nRETRY HARD CONSTRAINT:\n- Previous attempt changed the logo/wordmark.\n- Keep the logo icon geometry and wordmark text exactly identical to the source.\n- Preserve logo arrangement/orientation exactly (vertical stays vertical, horizontal stays horizontal).\n- Keep logo position and size exactly unchanged (no movement).\n- Do not change any letters, spacing rhythm, or icon silhouette.\n- If uncertain, leave the logo area unchanged and style only the non-logo regions."
                  : "";
              const effectiveAspectForPrompt = preserveSourceAspect ? undefined : aspectRatio;
              let imageData = await generateWithGemini(`${prompt}${retryConstraint}`, originalForGen, effectiveAspectForPrompt);
              if (!imageData) continue;
              imageData = preserveSourceAspect && originalForGen
                ? await normalizeToSourceAspect(imageData, originalForGen)
                : await normalizeAspectRatio(imageData, aspectRatio);
              if (shouldLockSourceLogoBlock && originalForGen) {
                imageData = await lockSourceLogoBlock(originalForGen, imageData);
              }

              if (shouldValidateLogo && originalForGen) {
                const logoOk = await verifyLogoIdentityWithGemini(originalForGen, imageData, brandHint);
                logoVerified = logoOk;
                if (!logoOk) {
                  console.warn(
                    `Logo identity check failed for image ${index}, attempt ${attempt}/${logoRetryLimit}.`
                  );
                  if (attempt < logoRetryLimit) {
                    const waitMs = computeRetryDelayMs(attempt);
                    console.warn(
                      `Logo mismatch detected. Waiting ${waitMs}ms before retrying image ${index}...`
                    );
                    await sleep(waitMs);
                    continue;
                  }
                  throw new Error(
                    `Logo identity validation failed after ${logoRetryLimit} attempts for image ${index}.`
                  );
                }
              }

              console.log(`Successfully generated image ${index} with Gemini 3 Pro Image`);
              return {
                index,
                imageData,
                prompt,
                provider: "gemini-3-pro",
                logoVerified,
                logoValidationAttempts: attemptsUsed,
              };
            } catch (attemptErr) {
              const attemptMessage = attemptErr instanceof Error ? attemptErr.message : "Unknown attempt error";
              const retryAfterMs =
                typeof attemptErr === "object" &&
                attemptErr !== null &&
                "retryAfterMs" in attemptErr &&
                typeof (attemptErr as { retryAfterMs?: unknown }).retryAfterMs === "number"
                  ? (attemptErr as { retryAfterMs: number }).retryAfterMs
                  : extractRetryDelayMs(attemptMessage);
              const statusCode =
                typeof attemptErr === "object" &&
                attemptErr !== null &&
                "statusCode" in attemptErr &&
                typeof (attemptErr as { statusCode?: unknown }).statusCode === "number"
                  ? (attemptErr as { statusCode: number }).statusCode
                  : undefined;
              const hardQuota = isHardQuotaError(attemptMessage);
              const transientError = isTransientGeminiError(attemptMessage, statusCode) || Boolean(retryAfterMs);
              console.warn(`Gemini attempt ${attempt}/${logoRetryLimit} failed for image ${index}: ${attemptMessage}`);
              if (hardQuota) {
                throw attemptErr;
              }
              if (transientError && attempt < logoRetryLimit) {
                const waitMs = computeRetryDelayMs(attempt, retryAfterMs);
                console.warn(`Gemini rate limit hit. Waiting ${waitMs}ms before retrying image ${index}...`);
                await sleep(waitMs);
                continue;
              }
              if (attempt < logoRetryLimit && transientError) continue;
              throw attemptErr;
            }
          }
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
          imageData = await normalizeAspectRatio(imageData, aspectRatio);
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
    const useParallelGeneration = parallel && prompts.length > 1 && provider !== "nano";
    const generationDeadline = Date.now() + GENERATE_TOTAL_TIMEOUT_MS;

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
      return NextResponse.json(
        { error: "Image generation failed", details: "No images were generated" },
        { status: 500 }
      );
    }

    // Auto-save generated images to disk with proper variation names
    const savedPaths: string[] = [];
    if (SAVE_GENERATED_IMAGES) {
      for (const img of generatedImages) {
        const varName = variationNames[img.index] || `Variation ${img.index + 1}`;
        const savedPath = saveImageToDisk(img.imageData, varName, img.index);
        if (savedPath) savedPaths.push(savedPath);
      }
      console.log(`💾 Auto-saved ${savedPaths.length} images to: ${SAVE_FOLDER}`);
    }

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






