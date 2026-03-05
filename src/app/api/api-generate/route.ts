import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { rateLimit } from "@/lib/rate-limit";
import { logEvent } from "@/lib/telemetry";
import { loadPromptFile } from "@/lib/prompt-loader";
import { pickCoreRulesPrompt } from "@/lib/prompt-policy";
import { getStylePromptGuidance } from "@/lib/design-system";
import { matchDesignerToProject, enhancePromptWithDesignerStyle } from "@/lib/designer-masters";
import { saveGeneratedImages, saveGeneratedImageRecords } from "@/lib/save-image";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image-preview";
const GEMINI_IMAGE_FALLBACK_MODELS = (process.env.GEMINI_IMAGE_FALLBACK_MODELS || "")
  .split(",")
  .map((m) => m.trim())
  .filter((m) => Boolean(m) && m !== GEMINI_IMAGE_MODEL);

const API_GENERATE_RATE_LIMIT = 10;
const REQUEST_TIMEOUT_MS = 45_000;
const DEFAULT_CORE_RULES = "00-core-rules.md";

type AspectRatio = "9:16" | "16:9" | "1:1" | "4:5" | "3:4";
const VALID_ASPECT_RATIOS: AspectRatio[] = ["9:16", "16:9", "1:1", "4:5", "3:4"];
const VALID_COUNTS = [4, 8] as const;
const VALID_STYLES = ["premium", "minimal", "bold", "playful", "elegant"] as const;
type StyleOption = (typeof VALID_STYLES)[number];

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

// ---------------------------------------------------------------------------
// Style → Designer mapping
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
// DNA Style Presets (same as studio generate route)
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
// Prompt building
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
  // 1. Core rules (A/B tested) — same as studio generate route
  const coreRulesFile = pickCoreRulesPrompt(DEFAULT_CORE_RULES);
  const coreRules = loadPromptFile(coreRulesFile);

  // 2. Style mode constraints — same as studio generate route
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

  // 3. Business context block
  const businessBlock = buildBusinessContextBlock(ctx);

  // 4. Artistic control settings — same as studio generate route
  const artisticControls = `
ARTISTIC CONTROL SETTINGS:
- Balanced: artistic stylization is clear but still faithful to the original structure.
- Text safety: preserve all original text content exactly; no reflow, no repositioning, no font substitution for logo or wordmark.
- Color fidelity: preserve the original palette (only refine tones and contrast).
- Layout freedom: low (keep layout)
- Always keep text content EXACT and 100% readable.`;

  // 5. Design system style guidance
  const style = ctx.style || "premium";
  const designSystemStyle = STYLE_TO_DESIGN_SYSTEM[style];
  const styleGuidance = getStylePromptGuidance(designSystemStyle);

  // 6. Designer style enhancement
  const designerHint = STYLE_TO_DESIGNER_HINT[style];
  const designers = matchDesignerToProject(designerHint.projectType, designerHint.mood);
  const designerKey = designers[0];

  // 7. Build per-variation prompts with different DNA presets (like studio)
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

  // Build parts array: image + aspect hint + prompt
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

    // 3. Parse & validate
    const body = await request.json();
    const { image, businessContext, count, aspectRatio, email } = body as {
      image?: string;
      businessContext?: BusinessContext;
      count?: number;
      aspectRatio?: AspectRatio;
      email?: string;
    };

    // Email is required — look up user by email
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

    // Check generation quota (count by unique requests, not individual images)
    {
      const now = new Date();
      let currentTier = profile.tier;

      // Auto-downgrade: premium expired → free
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

      // Auto-refresh quota cycle: free = 7 days, premium = 30 days
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

      const usedRequests = await prisma.generatedImage.groupBy({
        by: ["requestId"],
        where: {
          userId: profile.id,
          createdAt: { gte: quotaResetAt },
        },
      });

      // Quota exhausted → try token fallback
      if (usedRequests.length >= generationLimit) {
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

    // All fields are required
    if (!image || typeof image !== "string" || !image.startsWith("data:")) {
      return NextResponse.json(
        { error: "Missing or invalid required field: image (must be a base64 data URL)" },
        { status: 400, headers: CORS_HEADERS },
      );
    }
    if (!businessContext || typeof businessContext !== "object") {
      return NextResponse.json(
        { error: "Missing required field: businessContext" },
        { status: 400, headers: CORS_HEADERS },
      );
    }
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
    if (count == null || !VALID_COUNTS.includes(count as (typeof VALID_COUNTS)[number])) {
      return NextResponse.json(
        { error: "Missing or invalid required field: count (must be 4 or 8)" },
        { status: 400, headers: CORS_HEADERS },
      );
    }
    if (!aspectRatio || !VALID_ASPECT_RATIOS.includes(aspectRatio)) {
      return NextResponse.json(
        { error: `Missing or invalid required field: aspectRatio (must be one of: ${VALID_ASPECT_RATIOS.join(", ")})` },
        { status: 400, headers: CORS_HEADERS },
      );
    }
    if (businessContext.style && !VALID_STYLES.includes(businessContext.style)) {
      return NextResponse.json(
        { error: `Invalid businessContext.style (must be one of: ${VALID_STYLES.join(", ")})` },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const requestId = crypto.randomUUID();

    // 4. Build enriched prompts from business context + REKO design knowledge
    const promptPack = buildEnrichedPrompts(businessContext, count);

    // 5. Telemetry
    logEvent({
      id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      type: "api-generate",
      sessionId: requestId,
      userId: clientId,
      payload: {
        request_id: requestId,
        business_name: businessContext.businessName,
        business_type: businessContext.businessType,
        style: businessContext.style || "premium",
        count,
        aspect_ratio: aspectRatio,
        variation_names: promptPack.map((p) => p.name),
      },
    });

    // 6. Generate images in parallel (each with its own DNA style preset)
    console.log(
      `🎨 api-generate: generating ${count} images for "${businessContext.businessName}" (${businessContext.businessType}), style=${businessContext.style || "premium"}, aspect=${aspectRatio}`,
    );
    promptPack.forEach((p, i) => console.log(`   ${i + 1}. ${p.name}`));

    const results = await Promise.allSettled(
      promptPack.map((pack, index) =>
        generateImage(pack.prompt, image, aspectRatio).then((img) => ({
          index,
          img,
          name: pack.name,
        })),
      ),
    );

    const images = results
      .filter(
        (r): r is PromiseFulfilledResult<{ index: number; img: string | null; name: string }> =>
          r.status === "fulfilled" && r.value.img !== null,
      )
      .map((r) => ({ url: r.value.img!, index: r.value.index, name: r.value.name }));

    // 7. Check results
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
      `✅ api-generate: ${images.length}/${count} images generated successfully`,
    );

    // 8. Save generated images to disk
    const savedPaths = saveGeneratedImages(
      images.map((img) => ({ imageData: img.url, index: img.index, name: img.name })),
    );

    // 9. Save image records to database
    await saveGeneratedImageRecords(
      profile.id,
      savedPaths,
      images.map((img) => ({ index: img.index, name: img.name })),
      requestId,
      aspectRatio,
      "api",
    );

    // 10. Return
    return NextResponse.json(
      {
        images,
        count: images.length,
        aspectRatio,
        requestId,
        savedPaths,
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
