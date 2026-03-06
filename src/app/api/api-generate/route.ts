import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import sharp from "sharp";
import { rateLimit } from "@/lib/rate-limit";
import { logEvent } from "@/lib/telemetry";
import { extractFirstCodeBlock, loadPromptFile } from "@/lib/prompt-loader";
import { pickCoreRulesPrompt } from "@/lib/prompt-policy";
import { getStylePromptGuidance } from "@/lib/design-system";
import { matchDesignerToProject, enhancePromptWithDesignerStyle } from "@/lib/designer-masters";
import { prisma } from "@/lib/prisma";
import { logGeneration } from "@/lib/generation-log";
import { deriveIntentProfile, mergeIntentProfile } from "@/lib/intent-detector";
import { findReferenceMatches } from "@/lib/reference-matcher";

export const maxDuration = 120;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;
const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-1.5-pro-latest";
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image-preview";
const GEMINI_IMAGE_FALLBACK_MODELS = (process.env.GEMINI_IMAGE_FALLBACK_MODELS || "")
  .split(",")
  .map((m) => m.trim())
  .filter((m) => Boolean(m) && m !== GEMINI_IMAGE_MODEL);

const API_GENERATE_RATE_LIMIT = 10;
const REQUEST_TIMEOUT_MS = 45_000;
const ANALYSIS_TIMEOUT_MS = 45_000;
const MAX_IMAGE_SIZE = 4 * 1024 * 1024; // 4MB
const DEFAULT_CORE_RULES = "00-core-rules.md";

type AspectRatio = "9:16" | "16:9" | "1:1" | "4:5" | "3:4";
const ASPECT_RATIO_VALUES: Array<{ value: AspectRatio; ratio: number }> = [
  { value: "9:16", ratio: 9 / 16 },
  { value: "16:9", ratio: 16 / 9 },
  { value: "1:1", ratio: 1 },
  { value: "4:5", ratio: 4 / 5 },
  { value: "3:4", ratio: 3 / 4 },
];
const DEFAULT_COUNT = 4;
const VALID_STYLES = ["premium", "minimal", "bold", "playful", "elegant"] as const;
type StyleOption = (typeof VALID_STYLES)[number];

const VALID_MODES = ["wireframer", "workshop", "ai-translate", "ai-plugins"] as const;
type ApiMode = (typeof VALID_MODES)[number];
type GenerationMode = "artistic" | "redesign";

const VALID_INTENSITIES = ["subtle", "balanced", "extreme"] as const;
const VALID_TEXT_SAFETY = ["strict", "creative"] as const;
const VALID_COLOR_FIDELITY = ["preserve", "explore"] as const;
const VALID_REDESIGN_PRESETS = ["clean", "bold", "swiss", "pop", "luxury", "retro"] as const;
type RedesignPreset = (typeof VALID_REDESIGN_PRESETS)[number];

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": process.env.API_GENERATE_ALLOWED_ORIGIN || "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BusinessContext {
  businessName: string;
  businessType: string;
  products?: string;
  targetAudience?: string;
  style?: StyleOption;
  tone?: string;
  additionalInfo?: string;
}

interface DesignVariation {
  name: string;
  what_it_fixes: string;
  stolen_from: string;
  the_feeling: string;
  prompt: string;
}

// Simplified AnalysisResult — enough for prompt building
interface AnalysisResult {
  analysis_id?: string;
  score: number;
  their_vision: string;
  how_close: string;
  first_impression: string;
  the_gap: string;
  steal_from?: {
    feeling_detected: string;
    mix_of_influences: string[];
    the_2026_truth: string;
    techniques_to_steal: string[];
    why_this_mix: string;
  };
  intent_profile?: {
    goal: string;
    primary_message: string;
    what_they_want_to_show: string;
    what_they_want_viewer_to_feel: string;
    desired_emotion: string;
    target_audience: string;
    cta: string;
    brand_tone: string;
    constraints: string[];
    confidence: number;
  };
  category_scores: {
    typography: { score: number; feedback: string };
    space: { score: number; feedback: string };
    simplicity: { score: number; feedback: string };
    emotion: { score: number; feeling_evoked: string; feeling_intended: string; feedback: string };
    craft: { score: number; feedback: string };
  };
  style_detection: {
    primary_style: string;
    style_confidence: number;
    what_its_trying_to_be: string;
    what_it_actually_is: string;
  };
  emotional_analysis: {
    intended_emotion: string;
    actual_emotion: string;
    target_audience: string;
    soul_elements: string[];
  };
  what_must_go: string[];
  what_must_stay: string[];
  what_must_change: string[];
  color_analysis: {
    current_palette: string[];
    palette_works: boolean;
    suggested_palette: string[];
    reasoning: string;
  };
  feedback: {
    the_good: string[];
    the_bad: string[];
    the_fix: string;
    overall: string;
  };
  elements: {
    headline: string;
    subheadline: string | null;
    body_text: string[];
    visual_elements: string[];
    brand: string | null;
    purpose: string;
  };
  variation_mode: "artistic_style" | "redesign";
  variations: DesignVariation[];
  reference_matches?: Array<{
    id: string;
    title: string;
    score: number;
    reasons: string[];
  }>;
  is_product?: boolean;
  is_sketch?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getClientId(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") || "unknown";
}

function validateApiKey(request: NextRequest): boolean {
  const expectedKey = process.env.API_GENERATE_KEY;
  if (!expectedKey) return false;

  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;

  const providedKey = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  if (providedKey.length !== expectedKey.length) return false;

  return crypto.timingSafeEqual(
    Buffer.from(providedKey, "utf-8"),
    Buffer.from(expectedKey, "utf-8"),
  );
}

function getDimensions(aspectRatio: AspectRatio): { width: number; height: number } {
  const dimensions: Record<AspectRatio, { width: number; height: number }> = {
    "9:16": { width: 768, height: 1344 },
    "16:9": { width: 1344, height: 768 },
    "1:1": { width: 1024, height: 1024 },
    "4:5": { width: 896, height: 1120 },
    "3:4": { width: 768, height: 1024 },
  };
  return dimensions[aspectRatio] || dimensions["1:1"];
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
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

function isTransientError(message: string, statusCode?: number): boolean {
  if (typeof statusCode === "number" && [429, 500, 502, 503, 504].includes(statusCode)) {
    return true;
  }
  return /(high demand|try again later|temporar(?:y|ily)|unavailable|overloaded|rate limit|too many requests|deadline exceeded|timeout)/i.test(
    message,
  );
}

function extractRetryDelayMs(message: string): number | null {
  if (!message) return null;
  const secondsMatch = message.match(/Please retry in\s*([\d.]+)s/i);
  if (secondsMatch) {
    const seconds = Number.parseFloat(secondsMatch[1]);
    if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds * 1000);
  }
  const msMatch = message.match(/Please retry in\s*([\d.]+)ms/i);
  if (msMatch) {
    const ms = Number.parseFloat(msMatch[1]);
    if (Number.isFinite(ms) && ms > 0) return Math.ceil(ms);
  }
  return null;
}

function pickClosestAspectRatio(width: number, height: number): AspectRatio {
  const currentRatio = width / height;
  let best: AspectRatio = "9:16";
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const candidate of ASPECT_RATIO_VALUES) {
    const diff = Math.abs(currentRatio - candidate.ratio);
    if (diff < bestDiff) {
      best = candidate.value;
      bestDiff = diff;
    }
  }
  return best;
}

async function detectAspectRatioFromImage(imageDataUrl: string): Promise<AspectRatio> {
  try {
    const matches = imageDataUrl.match(/^data:[^;]+;base64,(.+)$/);
    if (!matches) return "9:16";
    const buffer = Buffer.from(matches[1], "base64");
    const metadata = await sharp(buffer).metadata();
    if (metadata.width && metadata.height) {
      return pickClosestAspectRatio(metadata.width, metadata.height);
    }
  } catch {
    // fallback
  }
  return "9:16";
}

function extractJsonBlock(content: string): string | null {
  const start = content.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < content.length; i += 1) {
    const ch = content[i];
    if (inString) {
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === "\"") { inString = false; }
      continue;
    }
    if (ch === "\"") { inString = true; continue; }
    if (ch === "{") { depth += 1; continue; }
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return content.slice(start, i + 1);
    }
  }
  return null;
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter(v => typeof v === "string");
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

// ---------------------------------------------------------------------------
// Style → Designer mapping (legacy flow)
// ---------------------------------------------------------------------------

const STYLE_TO_DESIGN_SYSTEM: Record<StyleOption, string> = {
  premium: "classic",
  minimal: "minimal",
  bold: "bold",
  playful: "modern",
  elegant: "japanese",
};

const STYLE_TO_DESIGNER_HINT: Record<StyleOption, { projectType: string; mood: string }> = {
  premium: { projectType: "luxury", mood: "elegant" },
  minimal: { projectType: "minimal", mood: "calm" },
  bold: { projectType: "bold event", mood: "dramatic powerful" },
  playful: { projectType: "playful brand youth", mood: "fresh contemporary" },
  elegant: { projectType: "iconic", mood: "serene elegant" },
};

// ---------------------------------------------------------------------------
// DNA Style Presets (legacy flow)
// ---------------------------------------------------------------------------

const DNA_STYLE_PRESETS: Record<string, { label: string; prompt: string }> = {
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
};

const STYLE_TO_DNA_PRESETS: Record<StyleOption, string[]> = {
  premium: ["premium_dark", "gradient_atmosphere", "clean_corporate", "bold_typography"],
  minimal: ["clean_corporate", "gradient_atmosphere", "bold_typography", "premium_dark"],
  bold: ["bold_typography", "premium_dark", "gradient_atmosphere", "clean_corporate"],
  playful: ["gradient_atmosphere", "clean_corporate", "bold_typography", "premium_dark"],
  elegant: ["premium_dark", "clean_corporate", "gradient_atmosphere", "bold_typography"],
};

// ---------------------------------------------------------------------------
// Redesign preset rules
// ---------------------------------------------------------------------------

const REDESIGN_PRESET_RULES: Record<RedesignPreset, string> = {
  clean: "REDESIGN PRESET [Clean]: Simplify to essentials. White/light background, generous whitespace (60-70%), single accent color, clear hierarchy. Remove all decorative elements. Typography-driven with max 2 font weights.",
  bold: "REDESIGN PRESET [Bold]: High contrast, dramatic scale shifts. Dark background with vibrant accent. Oversized headline, minimal body text. Strong geometric shapes. Impactful visual weight.",
  swiss: "REDESIGN PRESET [Swiss]: Strict grid system. Asymmetric balance. Sans-serif typography. Mathematical spacing. Limited color (2-3 max). Functional beauty. No decoration.",
  pop: "REDESIGN PRESET [Pop]: Vibrant saturated colors, playful composition. Bold outlines, graphic shapes. Fun typography with personality. Energetic and eye-catching. Target: younger audience.",
  luxury: "REDESIGN PRESET [Luxury]: Refined restraint. Dark palette with metallic accents. Serif or elegant sans-serif. Generous negative space. Premium feel. Subtle textures. Understated sophistication.",
  retro: "REDESIGN PRESET [Retro]: Vintage-inspired color palette (warm tones, muted). Classic typography. Nostalgic textures. Period-appropriate design elements. Timeless quality.",
};

// ---------------------------------------------------------------------------
// Image Analysis (Gemini Vision)
// ---------------------------------------------------------------------------

async function analyzeImage(imageDataUrl: string): Promise<AnalysisResult> {
  if (!GOOGLE_AI_API_KEY) {
    throw new Error("Google AI API key is not configured");
  }

  // Extract base64 data and media type
  const matches = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) throw new Error("Invalid image format for analysis");

  let mediaType = matches[1];
  let base64Data = matches[2];

  // Compress if too large
  const imageBuffer = Buffer.from(base64Data, "base64");
  if (imageBuffer.length > MAX_IMAGE_SIZE) {
    console.log(`📐 Analysis: compressing image (${(imageBuffer.length / 1024 / 1024).toFixed(2)}MB)...`);
    const compressedBuffer = await sharp(imageBuffer)
      .resize(1920, 1920, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    base64Data = compressedBuffer.toString("base64");
    mediaType = "image/jpeg";
  }

  // Load analysis prompt
  const promptFile = loadPromptFile("01-analyze-steve-jobs.md");
  const prompt = extractFirstCodeBlock(promptFile.content);

  // Call Gemini Vision
  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent?key=${GOOGLE_AI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: mediaType, data: base64Data } },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
        },
      }),
    },
    ANALYSIS_TIMEOUT_MS,
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = (errorData as { error?: { message?: string } })?.error?.message || `Status ${response.status}`;
    throw new Error(`Analysis Gemini API error: ${errorMessage}`);
  }

  const data = await response.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const content = parts
    .map((part: { text?: string }) => part.text)
    .filter(Boolean)
    .join("\n");

  if (!content) throw new Error("Empty analysis response from model");

  // Parse JSON
  const jsonText = extractJsonBlock(content) || content.match(/\{[\s\S]*\}/)?.[0];
  if (!jsonText) throw new Error("Analysis JSON not found in response");

  const parsed = JSON.parse(jsonText);
  const analysisResult: AnalysisResult = {
    ...parsed,
    feedback: {
      ...parsed?.feedback,
      the_good: normalizeStringArray(parsed?.feedback?.the_good),
      the_bad: normalizeStringArray(parsed?.feedback?.the_bad),
    },
    elements: {
      ...parsed?.elements,
      headline: parsed?.elements?.headline ?? "",
    },
  };

  // Generate analysis ID
  analysisResult.analysis_id = crypto.randomUUID();

  // Enrich with intent detection
  const derivedIntent = deriveIntentProfile(analysisResult as Parameters<typeof deriveIntentProfile>[0], content);
  analysisResult.intent_profile = mergeIntentProfile(
    analysisResult.intent_profile as Parameters<typeof mergeIntentProfile>[0],
    derivedIntent,
  );

  // Match references
  const referenceMatches = findReferenceMatches(analysisResult as Parameters<typeof findReferenceMatches>[0]);
  if (referenceMatches.length > 0) {
    analysisResult.reference_matches = referenceMatches;
  }

  // Validate
  if (typeof analysisResult.score !== "number" || !Array.isArray(analysisResult.variations)) {
    throw new Error("Invalid analysis response format");
  }

  console.log(`📊 Analysis complete: score=${analysisResult.score}/100, variations=${analysisResult.variations.length}, mode=${analysisResult.variation_mode}`);

  return analysisResult;
}

// ---------------------------------------------------------------------------
// Mode Resolution (same as studio page getOneClickMode)
// ---------------------------------------------------------------------------

function resolveGenerationMode(
  apiMode: ApiMode | undefined,
  analysisScore: number,
): GenerationMode {
  switch (apiMode) {
    case "ai-translate":
      return "artistic";
    case "ai-plugins":
      return "redesign";
    case "workshop":
    case "wireframer":
    default:
      // Auto: score >= 60 = artistic (style refresh), < 60 = redesign (full makeover)
      return analysisScore >= 60 ? "artistic" : "redesign";
  }
}

// ---------------------------------------------------------------------------
// Analysis-based prompt building (replaces businessContext prompts)
// ---------------------------------------------------------------------------

function buildAnalysisContextBlock(analysis: AnalysisResult): string {
  const lines: string[] = [
    `ANALYSIS CONTEXT:`,
    `- Overall score: ${analysis.score}/100`,
    `- Vision: ${analysis.their_vision}`,
    `- Gap: ${analysis.the_gap}`,
    `- Style detected: ${analysis.style_detection?.primary_style || "unknown"}`,
    `- Intended emotion: ${analysis.emotional_analysis?.intended_emotion || "unknown"}`,
    `- Actual emotion: ${analysis.emotional_analysis?.actual_emotion || "unknown"}`,
  ];

  if (analysis.elements?.headline) {
    lines.push(`- Headline: "${analysis.elements.headline}"`);
  }
  if (analysis.elements?.brand) {
    lines.push(`- Brand: ${analysis.elements.brand}`);
  }
  if (analysis.intent_profile) {
    lines.push(`- Goal: ${analysis.intent_profile.goal}`);
    lines.push(`- Target audience: ${analysis.intent_profile.target_audience}`);
    if (analysis.intent_profile.cta) {
      lines.push(`- CTA: ${analysis.intent_profile.cta}`);
    }
  }
  if (analysis.color_analysis?.current_palette?.length > 0) {
    lines.push(`- Current palette: ${analysis.color_analysis.current_palette.join(", ")}`);
  }
  if (analysis.feedback?.the_fix) {
    lines.push(`- Key fix: ${analysis.feedback.the_fix}`);
  }

  // Reference cues
  if (analysis.reference_matches && analysis.reference_matches.length > 0) {
    lines.push(`\nREFERENCE INSPIRATION:`);
    for (const ref of analysis.reference_matches.slice(0, 3)) {
      lines.push(`- ${ref.title} (match: ${ref.score}) — ${ref.reasons.join(", ")}`);
    }
  }

  // Steal-from cues
  if (analysis.steal_from) {
    lines.push(`\nDESIGN INFLUENCE:`);
    lines.push(`- Feeling: ${analysis.steal_from.feeling_detected}`);
    lines.push(`- Influences: ${analysis.steal_from.mix_of_influences.join(", ")}`);
    lines.push(`- Techniques: ${analysis.steal_from.techniques_to_steal.join(", ")}`);
  }

  return lines.join("\n");
}

function buildAnalysisBasedPrompts(
  analysis: AnalysisResult,
  resolvedMode: GenerationMode,
  count: number,
  options: {
    inspirationNotes?: string;
    artisticIntensity?: string;
    artisticTextSafety?: string;
    artisticColorFidelity?: string;
    redesignPreset?: RedesignPreset;
  },
): Array<{ prompt: string; name: string }> {
  // 1. Core rules (A/B tested)
  const coreRulesFile = pickCoreRulesPrompt(DEFAULT_CORE_RULES);
  const coreRules = loadPromptFile(coreRulesFile);

  // 2. Mode-specific constraints
  const modeConstraints = resolvedMode === "artistic"
    ? `
GENERATION MODE: STYLE REFRESH (Artistic)
- Use the source poster as strict composition reference.
- Preserve the existing poster layout geometry and structure exactly.
- Keep all text blocks, visual zones, and relative positions unchanged.
- Do NOT move, resize, rotate, crop, mirror, stretch, or reorder blocks/sections.
- Preserve source canvas aspect ratio exactly.
- Full-bleed output only: no outer padding, no inset frame, no visible border.
- Background must reach all four canvas edges.
- Keep text content unchanged unless explicitly requested.
- Allowed edits only: background styling, typography styling, and relevant visual elements/effects.
- Do NOT add structural containers/panels/badges/geometric overlays.
- Keep the source logo icon shape and exact logo wordmark text unchanged.
- Subtle logo effects are allowed (glow/shadow/blend/texture), but icon geometry and wordmark characters must remain identical and readable.
- Do NOT replace, duplicate, or relocate the brand mark.
- Keep logo size, orientation, and position unchanged.`
    : `
GENERATION MODE: FULL MAKEOVER (Redesign)
- Fundamentally rethink the layout, hierarchy, and visual approach.
- SIMPLIFY — Remove ALL decorative noise.
- ONE MESSAGE — Find the core, cut everything else.
- ONE VISUAL — Maximum one main visual element.
- GRID SYSTEM — Rebuild with structure.
- COLOR DISCIPLINE — Max 2-3 colors.
- BREATHING ROOM — 50-70% empty space.
- HIERARCHY — Clear reading order.
- MEANINGFUL VISUALS — No decoration for decoration's sake.
- Keep text content and brand elements recognizable.
- Full-bleed output: background reaches all four canvas edges.`;

  // 3. Artistic control settings
  const intensity = options.artisticIntensity || "balanced";
  const textSafety = options.artisticTextSafety || "strict";
  const colorFidelity = options.artisticColorFidelity || "preserve";

  const artisticControls = resolvedMode === "artistic"
    ? `
ARTISTIC CONTROL SETTINGS:
- Intensity: ${intensity} — ${intensity === "subtle" ? "minimal changes, mostly enhancement" : intensity === "extreme" ? "dramatic transformation while keeping layout" : "clear stylization but faithful to original structure"}.
- Text safety: ${textSafety} — ${textSafety === "strict" ? "preserve all original text content exactly; no reflow, no repositioning" : "allow creative text reinterpretation"}.
- Color fidelity: ${colorFidelity} — ${colorFidelity === "preserve" ? "preserve the original palette (only refine tones and contrast)" : "explore new color directions that match the mood"}.
- Layout freedom: low (keep layout).
- Always keep text content EXACT and 100% readable.`
    : "";

  // 4. Redesign preset if applicable
  const presetBlock = (resolvedMode === "redesign" && options.redesignPreset)
    ? `\n${REDESIGN_PRESET_RULES[options.redesignPreset]}`
    : "";

  // 5. Analysis context
  const analysisBlock = buildAnalysisContextBlock(analysis);

  // 6. Inspiration notes
  const inspirationBlock = options.inspirationNotes
    ? `\nUSER DIRECTION: ${options.inspirationNotes}`
    : "";

  // 7. Build per-variation prompts using analysis variations
  const variations = analysis.variations || [];
  const results: Array<{ prompt: string; name: string }> = [];

  // Detect style from analysis for design system guidance
  const detectedStyle = analysis.style_detection?.primary_style?.toLowerCase() || "";
  let designSystemKey = "classic";
  if (detectedStyle.includes("minimal")) designSystemKey = "minimal";
  else if (detectedStyle.includes("bold")) designSystemKey = "bold";
  else if (detectedStyle.includes("modern") || detectedStyle.includes("playful")) designSystemKey = "modern";
  else if (detectedStyle.includes("elegant") || detectedStyle.includes("japanese")) designSystemKey = "japanese";

  const styleGuidance = getStylePromptGuidance(designSystemKey);

  // Match designer from analysis mood
  const mood = analysis.emotional_analysis?.intended_emotion || "elegant";
  const designers = matchDesignerToProject(
    analysis.intent_profile?.goal || "awareness",
    mood,
  );
  const designerKey = designers[0];

  for (let i = 0; i < count; i++) {
    // Use AI-generated variation prompts from analysis if available
    const variation = variations[i % variations.length];
    const variationName = variation?.name || `Variation ${i + 1}`;
    const variationPrompt = variation?.prompt || "";

    let prompt = `${coreRules.content}${modeConstraints}
${artisticControls}
${presetBlock}

${analysisBlock}
${inspirationBlock}

VARIATION: ${variationName}
${variation?.what_it_fixes ? `Fixes: ${variation.what_it_fixes}` : ""}
${variation?.the_feeling ? `Feeling: ${variation.the_feeling}` : ""}

${variationPrompt}

${styleGuidance}

GENERATION RULES:
- Create a professional, print-ready poster design.
- Preserve existing text content exactly unless redesign mode changes are needed.
- Typography: style/enhance existing text, do not add unrelated new text.
- Color palette: 2-3 colors maximum, 1 accent.
- Full-bleed design: background must reach all four canvas edges.
- Make the design feel intentional and premium.`;

    if (designerKey) {
      prompt = enhancePromptWithDesignerStyle(prompt, designerKey);
    }

    results.push({ prompt, name: variationName });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Legacy prompt building (backward compat)
// ---------------------------------------------------------------------------

function buildBusinessContextBlock(ctx: BusinessContext): string {
  const parts: string[] = [
    `Business: ${ctx.businessName}`,
    `Type: ${ctx.businessType}`,
  ];
  if (ctx.products) parts.push(`Products/Services: ${ctx.products}`);
  if (ctx.targetAudience) parts.push(`Target audience: ${ctx.targetAudience}`);
  if (ctx.tone) parts.push(`Brand tone: ${ctx.tone}`);
  if (ctx.additionalInfo) parts.push(`Additional context: ${ctx.additionalInfo}`);
  return `BUSINESS CONTEXT (for aesthetic direction only — DO NOT render any of this as text on the image):\n${parts.join("\n")}`;
}

function buildEnrichedPrompts(ctx: BusinessContext, count: number): Array<{ prompt: string; name: string }> {
  const coreRulesFile = pickCoreRulesPrompt(DEFAULT_CORE_RULES);
  const coreRules = loadPromptFile(coreRulesFile);

  const styleModeConstraints = `
STYLE MODE CONSTRAINTS (HIGHEST PRIORITY):
- Use the source poster as strict composition reference.
- Preserve the existing poster layout geometry and structure exactly.
- Keep all text blocks, visual zones, and relative positions unchanged.
- Do NOT move, resize, rotate, crop, mirror, stretch, or reorder blocks/sections.
- Preserve source canvas aspect ratio exactly.
- Full-bleed output only: no outer padding, no inset frame, no visible border.
- Background must reach all four canvas edges.
- Keep text content unchanged unless explicitly requested.
- Allowed edits only: background styling, typography styling, and relevant visual elements/effects.
- Do NOT add structural containers/panels/badges/geometric overlays.
- Keep the source logo icon shape and exact logo wordmark text unchanged (no redraw, no rewrite, no replacement, no missing/extra letters).
- Subtle logo effects are allowed (glow/shadow/blend/texture), but icon geometry and wordmark characters must remain identical and readable.
- Do NOT replace, duplicate, or relocate the brand mark.
- Keep logo size, orientation, and position unchanged.`;

  const businessBlock = buildBusinessContextBlock(ctx);

  const artisticControls = `
ARTISTIC CONTROL SETTINGS:
- Balanced: artistic stylization is clear but still faithful to the original structure.
- Text safety: preserve all original text content exactly; no reflow, no repositioning, no font substitution for logo or wordmark.
- Color fidelity: preserve the original palette (only refine tones and contrast).
- Layout freedom: low (keep layout)
- Always keep text content EXACT and 100% readable.`;

  const style = ctx.style || "premium";
  const designSystemStyle = STYLE_TO_DESIGN_SYSTEM[style];
  const styleGuidance = getStylePromptGuidance(designSystemStyle);

  const designerHint = STYLE_TO_DESIGNER_HINT[style];
  const designers = matchDesignerToProject(designerHint.projectType, designerHint.mood);
  const designerKey = designers[0];

  const dnaKeys = STYLE_TO_DNA_PRESETS[style];
  const results: Array<{ prompt: string; name: string }> = [];

  for (let i = 0; i < count; i++) {
    const dnaKey = dnaKeys[i % dnaKeys.length];
    const dnaPreset = DNA_STYLE_PRESETS[dnaKey];

    let prompt = `${coreRules.content}${styleModeConstraints}

POSTER GENERATION TASK:
Improve and transform the provided poster into a polished, high-quality design.

${businessBlock}

BOARD STYLE DNA (${dnaPreset.label}):
${dnaPreset.prompt}

${artisticControls}

${styleGuidance}

GENERATION RULES:
- Create a professional, print-ready poster design
- Use the business context ONLY to guide visual style, mood, color palette, and aesthetic direction
- CRITICAL: Do NOT add, render, write, or overlay ANY new text on the image — no business names, product names, taglines, labels, captions, watermarks, or any other textual content from the prompt
- The ONLY text allowed on the image is text that already exists in the source image — preserve that exactly
- Typography: only style/enhance existing text from the source image, do not add new text
- Color palette: 2-3 colors maximum, 1 accent
- Layout: clean grid, 50-70% negative space
- Full-bleed design: background must reach all four canvas edges
- Make the design feel intentional and premium
- If the source image contains text, preserve it exactly
- If the source image contains a logo, preserve its shape and position`;

    if (designerKey) {
      prompt = enhancePromptWithDesignerStyle(prompt, designerKey);
    }

    results.push({ prompt, name: `${dnaPreset.label} ${i + 1}` });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Best Pick Algorithm (same as studio page)
// ---------------------------------------------------------------------------

function pickBestVariationIndex(
  images: Array<{ name: string; prompt?: string }>,
): number {
  if (!images || images.length === 0) return 0;

  const keywords: Array<{ key: string; weight: number }> = [
    { key: "elevated", weight: 3 },
    { key: "premium", weight: 3 },
    { key: "clean", weight: 2 },
    { key: "minimal", weight: 2 },
    { key: "luxury", weight: 2 },
    { key: "swiss", weight: 2 },
    { key: "grid", weight: 1 },
    { key: "bold", weight: 1 },
    { key: "tactile", weight: 1 },
    { key: "precise", weight: 1 },
  ];

  let bestIndex = 0;
  let bestScore = -1;

  images.forEach((img, idx) => {
    const haystack = `${img.name ?? ""} ${img.prompt ?? ""}`.toLowerCase();
    const score = keywords.reduce(
      (acc, { key, weight }) => (haystack.includes(key) ? acc + weight : acc),
      0,
    );
    if (score > bestScore) {
      bestScore = score;
      bestIndex = idx;
    }
  });

  return bestIndex;
}

// ---------------------------------------------------------------------------
// Gemini image generation (with source image)
// ---------------------------------------------------------------------------

async function generateImage(
  enrichedPrompt: string,
  imageDataUrl: string,
  aspectRatio: AspectRatio,
): Promise<string | null> {
  if (!GOOGLE_AI_API_KEY) {
    throw new Error("Google AI API key is not configured");
  }

  const target = getDimensions(aspectRatio);
  const aspectHint = `OUTPUT CANVAS: ${target.width}x${target.height}. Keep the exact aspect ratio. If the input aspect ratio differs, extend the background to fit. Do not stretch or crop key content.`;

  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

  const base64Match = imageDataUrl.match(/^data:(.+);base64,(.+)$/);
  if (base64Match) {
    parts.push({
      inlineData: {
        mimeType: base64Match[1],
        data: base64Match[2],
      },
    });
  }

  parts.push({ text: aspectHint });
  parts.push({ text: enrichedPrompt });

  const candidateModels = [GEMINI_IMAGE_MODEL, ...GEMINI_IMAGE_FALLBACK_MODELS];
  let lastError: Error | null = null;

  for (const modelName of candidateModels) {
    let response: Response;
    try {
      response = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GOOGLE_AI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { responseModalities: ["image", "text"] },
          }),
        },
        REQUEST_TIMEOUT_MS,
      );
    } catch (fetchErr) {
      const message = fetchErr instanceof Error ? fetchErr.message : "Gemini request failed";
      lastError = new Error(`Gemini (${modelName}): ${message}`);
      const hasNextModel = modelName !== candidateModels[candidateModels.length - 1];
      if (hasNextModel && isTransientError(message)) continue;
      throw lastError;
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage =
        (errorData as { error?: { message?: string } })?.error?.message ||
        `Status ${response.status}`;
      lastError = new Error(`Gemini (${modelName}): ${errorMessage}`);
      const hasNextModel = modelName !== candidateModels[candidateModels.length - 1];
      const modelUnavailable =
        /(unknown model|not found|unsupported model|permission denied|not enabled)/i.test(
          errorMessage,
        );
      const transient =
        isTransientError(errorMessage, response.status) ||
        Boolean(extractRetryDelayMs(errorMessage));
      if (hasNextModel && (modelUnavailable || transient)) continue;
      throw lastError;
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }>;
        };
      }>;
    };

    const responseParts = data.candidates?.[0]?.content?.parts || [];
    for (const part of responseParts) {
      if (part.inlineData) {
        const mimeType = part.inlineData.mimeType || "image/png";
        return `data:${mimeType};base64,${part.inlineData.data}`;
      }
    }

    return null;
  }

  throw lastError || new Error("Gemini: No response data");
}

// ---------------------------------------------------------------------------
// CORS preflight
// ---------------------------------------------------------------------------

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// ---------------------------------------------------------------------------
// POST /api/api-generate
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    // 1. Auth
    if (!validateApiKey(request)) {
      return NextResponse.json(
        { error: "Unauthorized. Invalid or missing API key." },
        { status: 401, headers: CORS_HEADERS },
      );
    }

    // 2. Rate limit
    const clientId = getClientId(request);
    const limitResult = rateLimit(
      `api-generate:${clientId}`,
      API_GENERATE_RATE_LIMIT,
      60_000,
    );
    if (!limitResult.ok) {
      const retryAfter = Math.max(
        1,
        Math.ceil((limitResult.resetAt - Date.now()) / 1000),
      );
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again soon." },
        {
          status: 429,
          headers: { ...CORS_HEADERS, "Retry-After": retryAfter.toString() },
        },
      );
    }

    // 3. Parse body
    const body = await request.json();
    const {
      image,
      email,
      // New studio workflow fields
      mode: apiMode,
      inspirationNotes,
      artisticIntensity,
      artisticTextSafety,
      artisticColorFidelity,
      redesignPreset,
      // Legacy field
      businessContext,
    } = body as {
      image?: string;
      email?: string;
      mode?: ApiMode;
      inspirationNotes?: string;
      artisticIntensity?: string;
      artisticTextSafety?: string;
      artisticColorFidelity?: string;
      redesignPreset?: RedesignPreset;
      businessContext?: BusinessContext;
    };

    // 4. Validate common required fields
    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Missing required field: email" },
        { status: 400, headers: CORS_HEADERS },
      );
    }
    const profile = await prisma.profile.findFirst({ where: { email } });
    if (!profile) {
      return NextResponse.json(
        { error: "User not found with this email" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    // 5. Check generation quota
    {
      const now = new Date();
      let currentTier = profile.tier;

      if (
        currentTier === "premium" &&
        profile.premiumExpiresAt &&
        now > profile.premiumExpiresAt
      ) {
        await prisma.profile.update({
          where: { id: profile.id },
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

      const cycleDays = currentTier === "premium" ? 30 : 7;
      const cycleMs = cycleDays * 24 * 60 * 60 * 1000;
      let quotaResetAt = profile.quotaResetAt;

      if (now.getTime() - quotaResetAt.getTime() >= cycleMs) {
        quotaResetAt = now;
        await prisma.profile.update({
          where: { id: profile.id },
          data: { quotaResetAt: now },
        });
      }

      const usedRequests = await prisma.generationLog.count({
        where: {
          userId: profile.id,
          createdAt: { gte: quotaResetAt },
        },
      });

      if (usedRequests >= generationLimit) {
        if (profile.tokenBalance > 0) {
          const updated = await prisma.profile.update({
            where: { id: profile.id },
            data: { tokenBalance: { decrement: 1 } },
          });
          await prisma.tokenLog.create({
            data: {
              userId: profile.id,
              amount: -1,
              reason: "generation_use",
              balance: updated.tokenBalance,
            },
          });
        } else {
          return NextResponse.json(
            { error: "Таны зураг үүсгэх эрх дууссан байна. Token худалдаж аваад үргэлжлүүлнэ үү." },
            { status: 403, headers: CORS_HEADERS },
          );
        }
      }
    }

    // 6. Validate image
    if (!image || typeof image !== "string" || !image.startsWith("data:")) {
      return NextResponse.json(
        { error: "Missing or invalid required field: image (must be a base64 data URL)" },
        { status: 400, headers: CORS_HEADERS },
      );
    }
    // Fixed count=4, aspectRatio auto-detected from image
    const finalCount = DEFAULT_COUNT;
    const finalAspectRatio = await detectAspectRatioFromImage(image);
    console.log(`📐 api-generate: auto-detected aspectRatio=${finalAspectRatio}`);

    // 7. Validate mode-specific fields
    if (apiMode && !VALID_MODES.includes(apiMode)) {
      return NextResponse.json(
        { error: `Invalid mode (must be one of: ${VALID_MODES.join(", ")})` },
        { status: 400, headers: CORS_HEADERS },
      );
    }
    if (artisticIntensity && !VALID_INTENSITIES.includes(artisticIntensity as (typeof VALID_INTENSITIES)[number])) {
      return NextResponse.json(
        { error: `Invalid artisticIntensity (must be one of: ${VALID_INTENSITIES.join(", ")})` },
        { status: 400, headers: CORS_HEADERS },
      );
    }
    if (artisticTextSafety && !VALID_TEXT_SAFETY.includes(artisticTextSafety as (typeof VALID_TEXT_SAFETY)[number])) {
      return NextResponse.json(
        { error: `Invalid artisticTextSafety (must be one of: ${VALID_TEXT_SAFETY.join(", ")})` },
        { status: 400, headers: CORS_HEADERS },
      );
    }
    if (artisticColorFidelity && !VALID_COLOR_FIDELITY.includes(artisticColorFidelity as (typeof VALID_COLOR_FIDELITY)[number])) {
      return NextResponse.json(
        { error: `Invalid artisticColorFidelity (must be one of: ${VALID_COLOR_FIDELITY.join(", ")})` },
        { status: 400, headers: CORS_HEADERS },
      );
    }
    if (redesignPreset && !VALID_REDESIGN_PRESETS.includes(redesignPreset)) {
      return NextResponse.json(
        { error: `Invalid redesignPreset (must be one of: ${VALID_REDESIGN_PRESETS.join(", ")})` },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const requestId = crypto.randomUUID();

    // 8. Determine flow: new studio workflow vs legacy businessContext
    const useStudioWorkflow = !!apiMode || !businessContext;

    let promptPack: Array<{ prompt: string; name: string }>;
    let analysisScore: number | undefined;
    let analysisId: string | undefined;
    let resolvedMode: GenerationMode | undefined;

    if (useStudioWorkflow && !businessContext) {
      // --- NEW STUDIO WORKFLOW ---

      // 8a. Analyze the image
      console.log(`🔍 api-generate: analyzing image...`);
      let analysis: AnalysisResult;
      try {
        analysis = await analyzeImage(image);
      } catch (analysisErr) {
        console.error("Analysis failed:", analysisErr);
        return NextResponse.json(
          {
            error: "Image analysis failed",
            details: analysisErr instanceof Error ? analysisErr.message : "Unknown analysis error",
          },
          { status: 500, headers: CORS_HEADERS },
        );
      }

      analysisScore = analysis.score;
      analysisId = analysis.analysis_id;

      // 8b. Resolve generation mode
      resolvedMode = resolveGenerationMode(apiMode || "wireframer", analysis.score);
      console.log(`🎯 api-generate: mode=${apiMode || "wireframer"} → resolved=${resolvedMode} (score=${analysis.score})`);

      // 8c. Build prompts from analysis
      promptPack = buildAnalysisBasedPrompts(analysis, resolvedMode, finalCount, {
        inspirationNotes,
        artisticIntensity,
        artisticTextSafety,
        artisticColorFidelity,
        redesignPreset,
      });
    } else if (businessContext) {
      // --- LEGACY FLOW (backward compat) ---
      if (!businessContext.businessName || typeof businessContext.businessName !== "string") {
        return NextResponse.json(
          { error: "Missing required field: businessContext.businessName" },
          { status: 400, headers: CORS_HEADERS },
        );
      }
      if (!businessContext.businessType || typeof businessContext.businessType !== "string") {
        return NextResponse.json(
          { error: "Missing required field: businessContext.businessType" },
          { status: 400, headers: CORS_HEADERS },
        );
      }
      if (businessContext.style && !VALID_STYLES.includes(businessContext.style)) {
        return NextResponse.json(
          { error: `Invalid businessContext.style (must be one of: ${VALID_STYLES.join(", ")})` },
          { status: 400, headers: CORS_HEADERS },
        );
      }
      promptPack = buildEnrichedPrompts(businessContext, finalCount);
    } else {
      return NextResponse.json(
        { error: "Either 'mode' or 'businessContext' must be provided" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    // 9. Telemetry
    logEvent({
      id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      type: "api-generate",
      sessionId: requestId,
      userId: clientId,
      payload: {
        request_id: requestId,
        mode: resolvedMode || "legacy",
        api_mode: apiMode || "legacy",
        analysis_score: analysisScore,
        analysis_id: analysisId,
        inspiration_notes: inspirationNotes,
        count: finalCount,
        aspect_ratio: finalAspectRatio,
        variation_names: promptPack.map((p) => p.name),
        ...(businessContext ? {
          business_name: businessContext.businessName,
          business_type: businessContext.businessType,
          style: businessContext.style || "premium",
        } : {}),
      },
    });

    // 10. Generate images in parallel
    console.log(
      `🎨 api-generate: generating ${finalCount} images, mode=${resolvedMode || "legacy"}, aspect=${finalAspectRatio}`,
    );
    promptPack.forEach((p, i) => console.log(`   ${i + 1}. ${p.name}`));

    const results = await Promise.allSettled(
      promptPack.map((pack, index) =>
        generateImage(pack.prompt, image, finalAspectRatio).then((img) => ({
          index,
          img,
          name: pack.name,
          prompt: pack.prompt,
        })),
      ),
    );

    const images = results
      .filter(
        (r): r is PromiseFulfilledResult<{ index: number; img: string | null; name: string; prompt: string }> =>
          r.status === "fulfilled" && r.value.img !== null,
      )
      .map((r) => ({
        url: r.value.img!,
        index: r.value.index,
        name: r.value.name,
        prompt: r.value.prompt,
      }));

    // 11. Check results
    if (images.length === 0) {
      const firstRejected = results.find(
        (r) => r.status === "rejected",
      ) as PromiseRejectedResult | undefined;
      return NextResponse.json(
        {
          error: "Image generation failed",
          details: firstRejected?.reason?.message || "All generation attempts failed",
        },
        { status: 500, headers: CORS_HEADERS },
      );
    }

    console.log(
      `✅ api-generate: ${images.length}/${finalCount} images generated successfully`,
    );

    // 12. Log generation for quota tracking
    await logGeneration(profile.id, requestId, "api", images.length);

    // 13. Pick best variation
    const bestPickIndex = pickBestVariationIndex(images);

    // 14. Return with bestPick info
    return NextResponse.json(
      {
        images: images.map((img, i) => ({
          url: img.url,
          index: img.index,
          name: img.name,
          isBestPick: i === bestPickIndex,
        })),
        count: images.length,
        bestPickIndex,
        ...(resolvedMode ? { mode: resolvedMode } : {}),
        ...(analysisScore != null ? { analysisScore } : {}),
        ...(analysisId ? { analysisId } : {}),
        aspectRatio: finalAspectRatio,
        requestId,
      },
      { status: 200, headers: CORS_HEADERS },
    );
  } catch (err) {
    console.error("api-generate error:", err);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
