import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { rateLimit } from "@/lib/rate-limit";
import { logEvent } from "@/lib/telemetry";

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

const TEXT_TO_IMAGE_RATE_LIMIT = 10; // per minute per IP
const REQUEST_TIMEOUT_MS = 45_000;

type AspectRatio = "9:16" | "16:9" | "1:1" | "4:5" | "3:4";
const VALID_ASPECT_RATIOS: AspectRatio[] = ["9:16", "16:9", "1:1", "4:5", "3:4"];
const VALID_COUNTS = [4, 8] as const;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": process.env.TEXT_TO_IMAGE_ALLOWED_ORIGIN || "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getClientId(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") || "unknown";
}

function validateApiKey(request: NextRequest): boolean {
  const expectedKey = process.env.TEXT_TO_IMAGE_API_KEY;
  if (!expectedKey) return false; // fail closed

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
// Gemini text-to-image generation
// ---------------------------------------------------------------------------

async function generateImage(
  prompt: string,
  aspectRatio: AspectRatio,
): Promise<string | null> {
  if (!GOOGLE_AI_API_KEY) {
    throw new Error("Google AI API key is not configured");
  }

  const target = getDimensions(aspectRatio);
  const parts: Array<{ text: string }> = [
    {
      text: `OUTPUT CANVAS: ${target.width}x${target.height}. Keep the exact aspect ratio.`,
    },
    { text: `Generate an image: ${prompt}` },
  ];

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
// POST /api/text-to-image
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
      `text-to-image:${clientId}`,
      TEXT_TO_IMAGE_RATE_LIMIT,
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
    const {
      prompt,
      count = 4,
      aspectRatio = "1:1" as AspectRatio,
    } = body as {
      prompt?: string;
      count?: number;
      aspectRatio?: AspectRatio;
    };

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return NextResponse.json(
        { error: "Missing required field: prompt" },
        { status: 400, headers: CORS_HEADERS },
      );
    }
    if (!VALID_COUNTS.includes(count as (typeof VALID_COUNTS)[number])) {
      return NextResponse.json(
        { error: "Invalid count. Must be 4 or 8." },
        { status: 400, headers: CORS_HEADERS },
      );
    }
    if (!VALID_ASPECT_RATIOS.includes(aspectRatio)) {
      return NextResponse.json(
        { error: `Invalid aspectRatio. Must be one of: ${VALID_ASPECT_RATIOS.join(", ")}` },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const requestId = crypto.randomUUID();
    const trimmedPrompt = prompt.trim();

    // 4. Telemetry
    logEvent({
      id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      type: "text-to-image",
      sessionId: requestId,
      userId: clientId,
      payload: {
        request_id: requestId,
        prompt_length: trimmedPrompt.length,
        count,
        aspect_ratio: aspectRatio,
      },
    });

    // 5. Generate images in parallel
    console.log(
      `🎨 text-to-image: generating ${count} images, aspect=${aspectRatio}, prompt="${trimmedPrompt.slice(0, 80)}..."`,
    );

    const results = await Promise.allSettled(
      Array.from({ length: count }, (_, index) =>
        generateImage(trimmedPrompt, aspectRatio).then((img) => ({
          index,
          img,
        })),
      ),
    );

    const images = results
      .filter(
        (r): r is PromiseFulfilledResult<{ index: number; img: string | null }> =>
          r.status === "fulfilled" && r.value.img !== null,
      )
      .map((r) => ({ url: r.value.img!, index: r.value.index }));

    // 6. Check results
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
      `✅ text-to-image: ${images.length}/${count} images generated successfully`,
    );

    // 7. Return
    return NextResponse.json(
      {
        images,
        count: images.length,
        prompt: trimmedPrompt,
        aspectRatio,
        requestId,
      },
      { status: 200, headers: CORS_HEADERS },
    );
  } catch (err) {
    console.error("text-to-image error:", err);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
