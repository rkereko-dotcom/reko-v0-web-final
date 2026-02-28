import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import sharp from "sharp";
import { rateLimit } from "@/lib/rate-limit";
import { logEvent } from "@/lib/telemetry";
import { extractFirstCodeBlock, loadPromptFile } from "@/lib/prompt-loader";
import { deriveIntentProfile, mergeIntentProfile, type IntentProfile } from "@/lib/intent-detector";
import { findReferenceMatches, type ReferenceMatch } from "@/lib/reference-matcher";

// Increase timeout for image analysis
export const maxDuration = 60;

const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;
const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-1.5-pro-latest";
const MAX_IMAGE_SIZE = 4 * 1024 * 1024; // 4MB (request size guard)
const RATE_LIMIT_PER_MINUTE = 8;
const USE_MOCK_ANALYZE = false;

function getClientId(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip") || "unknown";
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
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === "\"") {
        inString = false;
      }
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "{") {
      depth += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return content.slice(start, i + 1);
      }
    }
  }
  return null;
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter(v => typeof v === "string");
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}

// Steve Jobs Style Category Scores
interface CategoryScores {
  typography: {
    score: number;
    hierarchy_clear: boolean;
    fonts_detected: string[];
    feedback: string;
  };
  space: {
    score: number;
    white_space_percentage: string;
    feels_intentional: boolean;
    feedback: string;
  };
  simplicity: {
    score: number;
    elements_that_should_go: string[];
    essence_preserved: boolean;
    feedback: string;
  };
  emotion: {
    score: number;
    feeling_evoked: string;
    feeling_intended: string;
    has_soul: boolean;
    feedback: string;
  };
  craft: {
    score: number;
    details_considered: boolean;
    jony_would_approve: boolean;
    feedback: string;
  };
}

// Style detection - Steve's perspective
interface StyleDetection {
  primary_style: string;
  style_confidence: number;
  what_its_trying_to_be: string;
  what_it_actually_is: string;
  apple_compatibility: number;
}

// Emotional analysis - Steve's perspective
interface EmotionalAnalysis {
  intended_emotion: string;
  actual_emotion: string;
  target_audience: string;
  makes_you_feel_something: boolean;
  soul_elements: string[];
}

// Color analysis
interface ColorAnalysis {
  current_palette: string[];
  palette_works: boolean;
  suggested_palette: string[];
  reasoning: string;
}

// Poster elements
interface PosterElements {
  headline: string;
  subheadline: string | null;
  body_text: string[];
  visual_elements: string[];
  brand: string | null;
  purpose: string;
}

interface UserPreferenceSignals {
  style_bias: string;
  color_bias: string;
  composition_bias: string;
  type_bias: string;
  evidence: string[];
  next_time_suggestions: string[];
  confidence: number;
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

// Design variation - flexible, not fixed
interface DesignVariation {
  name: string;
  what_it_fixes: string;
  stolen_from: string;
  the_feeling: string;
  prompt: string;
}

// Variation mode based on poster quality
type VariationMode = "artistic_style" | "redesign";

// Redesign rules for bad posters
const REDESIGN_RULES = [
  "SIMPLIFY - Remove ALL decorative noise",
  "ONE MESSAGE - Find the core, cut everything else",
  "ONE VISUAL - Maximum one main visual element",
  "GRID SYSTEM - Rebuild with structure",
  "COLOR DISCIPLINE - Max 2-3 colors",
  "BREATHING ROOM - 50-70% empty space",
  "HIERARCHY - Clear reading order",
  "MEANINGFUL VISUALS - No decoration for decoration's sake"
];

// Poster type detection
type PosterType = "carousel_slide" | "social_post" | "thumbnail" | "poster" | "banner";

// Steal from reference - 2026 evolution
interface StealFrom {
  feeling_detected: string;
  mix_of_influences: string[];
  the_2026_truth: string;
  techniques_to_steal: string[];
  why_this_mix: string;
}

// Main analysis result
interface AnalysisResult {
  analysis_id?: string;
  score: number;
  their_vision: string;
  how_close: string;
  first_impression: string;
  the_gap: string;
  steal_from?: StealFrom;
  intent_profile?: IntentProfile;
  user_preference_signals?: UserPreferenceSignals;
  category_scores: CategoryScores;
  style_detection: StyleDetection;
  emotional_analysis: EmotionalAnalysis;
  what_must_go: string[];
  what_must_stay: string[];
  what_must_change: string[];
  color_analysis: ColorAnalysis;
  feedback: {
    the_good: string[];
    the_bad: string[];
    the_fix: string;
    overall: string;
  };
  elements: PosterElements;
  poster_type: PosterType;
  reference_matches?: ReferenceMatch[];
  is_sketch?: boolean;
  sketch_layout?: {
    header_area: string;
    main_area: string;
    footer_area: string;
    elements: string[];
    hierarchy: string;
  };
  is_product?: boolean;
  product_info?: ProductInfo;
  variation_mode: VariationMode;
  variations: DesignVariation[];
  would_steve_ship_this: boolean;
  what_would_make_steve_ship_this: string;
}

function isAnalysisResult(value: unknown): value is AnalysisResult {
  if (!value || typeof value !== "object") return false;
  const v = value as AnalysisResult;
  return (
    typeof v.score === "number" &&
    typeof v.first_impression === "string" &&
    typeof v.feedback?.the_fix === "string" &&
    typeof v.feedback?.overall === "string" &&
    Array.isArray(v.feedback?.the_good) &&
    Array.isArray(v.feedback?.the_bad) &&
    Array.isArray(v.variations) &&
    typeof v.elements?.headline === "string"
  );
}

export async function POST(request: NextRequest) {
  try {
    const clientId = getClientId(request);
    const limitResult = rateLimit(`analyze:${clientId}`, RATE_LIMIT_PER_MINUTE, 60_000);
    if (!limitResult.ok) {
      const retryAfter = Math.max(1, Math.ceil((limitResult.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again soon." },
        { status: 429, headers: { "Retry-After": retryAfter.toString() } }
      );
    }
    const analysisId = crypto.randomUUID();
    if (USE_MOCK_ANALYZE) {
      const mockResult: AnalysisResult = {
        analysis_id: analysisId,
        score: 78,
        their_vision: "Mock analysis (Gemini disabled).",
        how_close: "Close enough to iterate quickly.",
        first_impression: "Clear intent, needs refinement.",
        the_gap: "Hierarchy and spacing need polish.",
        steal_from: {
          feeling_detected: "Calm confidence",
          mix_of_influences: ["Swiss poster", "Apple keynote"],
          the_2026_truth: "Less noise, more signal.",
          techniques_to_steal: ["Strong grid", "Simple palette"],
          why_this_mix: "It keeps clarity while feeling modern.",
        },
        category_scores: {
          typography: {
            score: 7,
            hierarchy_clear: true,
            fonts_detected: ["Sans-serif"],
            feedback: "Reduce font variety and tighten sizes.",
          },
          space: {
            score: 6,
            white_space_percentage: "45%",
            feels_intentional: false,
            feedback: "Increase breathing room around the headline.",
          },
          simplicity: {
            score: 7,
            elements_that_should_go: ["Extra badges"],
            essence_preserved: true,
            feedback: "Trim decorative elements.",
          },
          emotion: {
            score: 7,
            feeling_evoked: "Calm",
            feeling_intended: "Inspiring",
            has_soul: true,
            feedback: "Push the contrast to amplify mood.",
          },
          craft: {
            score: 8,
            details_considered: true,
            jony_would_approve: false,
            feedback: "Align edges and fix optical balance.",
          },
        },
        style_detection: {
          primary_style: "Minimal",
          style_confidence: 0.72,
          what_its_trying_to_be: "Premium, clean poster",
          what_it_actually_is: "Minimal but a bit uneven",
          apple_compatibility: 0.68,
        },
        emotional_analysis: {
          intended_emotion: "Confidence",
          actual_emotion: "Calm",
          target_audience: "Design-aware viewers",
          makes_you_feel_something: true,
          soul_elements: ["Clear headline"],
        },
        what_must_go: ["Cluttered corner detail"],
        what_must_stay: ["Headline clarity"],
        what_must_change: ["Spacing and hierarchy"],
        color_analysis: {
          current_palette: ["#111111", "#ffffff"],
          palette_works: true,
          suggested_palette: ["#0b0b0b", "#f5f5f5"],
          reasoning: "Slightly soften contrast for elegance.",
        },
        feedback: {
          the_good: ["Strong intent", "Readable headline"],
          the_bad: ["Crowded margins", "Weak hierarchy"],
          the_fix: "Simplify and give the headline more space.",
          overall: "Good foundation. Make it breathe.",
        },
        elements: {
          headline: "Mock headline",
          subheadline: null,
          body_text: [],
          visual_elements: [],
          brand: null,
          purpose: "Demo response while Gemini is disabled.",
        },
        poster_type: "poster",
        variation_mode: "redesign",
        variations: [
          {
            name: "Clean Grid",
            what_it_fixes: "Hierarchy and spacing",
            stolen_from: "Swiss poster design",
            the_feeling: "Confident and calm",
            prompt: "Rebuild with strict grid, big headline, wide margins.",
          },
        ],
        would_steve_ship_this: false,
        what_would_make_steve_ship_this: "Remove clutter and commit to the grid.",
      };
      logEvent({
        id: crypto.randomUUID(),
        ts: new Date().toISOString(),
        type: "analyze",
        sessionId: analysisId,
        userId: clientId,
        payload: {
          score: mockResult.score,
          poster_type: mockResult.poster_type,
          variation_mode: mockResult.variation_mode,
          mock: true,
          prompt_hash: loadPromptFile("01-analyze-steve-jobs.md").hash,
        },
      });
      return NextResponse.json(mockResult);
    }
    if (!GOOGLE_AI_API_KEY) {
      return NextResponse.json(
        { error: "API key is not configured" },
        { status: 500 }
      );
    }

    const { image } = await request.json();

    if (!image) {
      return NextResponse.json(
        { error: "No image provided" },
        { status: 400 }
      );
    }

    // Extract base64 data and media type from data URL
    const matches = image.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      return NextResponse.json(
        { error: "Invalid image format" },
        { status: 400 }
      );
    }

    let mediaType = matches[1];
    let base64Data = matches[2];

    // Check image size and compress if needed
    const imageBuffer = Buffer.from(base64Data, "base64");
    const imageHash = crypto.createHash("sha256").update(imageBuffer).digest("hex");
    if (imageBuffer.length > MAX_IMAGE_SIZE) {
      console.log(`Image too large (${(imageBuffer.length / 1024 / 1024).toFixed(2)}MB), compressing...`);

      // Compress image using sharp
      const compressedBuffer = await sharp(imageBuffer)
        .resize(1920, 1920, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();

      base64Data = compressedBuffer.toString("base64");
      mediaType = "image/jpeg";
      console.log(`Compressed to ${(compressedBuffer.length / 1024 / 1024).toFixed(2)}MB`);
    }

    // Call Gemini Vision API with enhanced prompt
    const promptFile = loadPromptFile("01-analyze-steve-jobs.md");
    const prompt = extractFirstCodeBlock(promptFile.content);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90_000);
    let response: Response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent?key=${GOOGLE_AI_API_KEY}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    inlineData: {
                      mimeType: mediaType,
                      data: base64Data,
                    },
                  },
                  {
                    text: prompt,
                  },
                ],
              },
            ],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
          },
        }),
      }
    );
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Gemini API error:", errorData);
      const errorMessage = errorData?.error?.message || errorData?.message || `Status ${response.status}`;
      return NextResponse.json(
        { error: `Gemini API error: ${errorMessage}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const content = parts
      .map((part: { text?: string }) => part.text)
      .filter(Boolean)
      .join("\n");

    if (!content) {
      return NextResponse.json(
        { error: "Empty response from model" },
        { status: 500 }
      );
    }

    // Parse the JSON response from Gemini
    try {
      // Extract JSON from the response (in case there's extra text)
      const jsonText = extractJsonBlock(content) || content.match(/\{[\s\S]*\}/)?.[0];
      if (!jsonText) {
        throw new Error("JSON not found");
      }

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
      analysisResult.analysis_id = analysisId;
      const derivedIntent = deriveIntentProfile(analysisResult, content);
      analysisResult.intent_profile = mergeIntentProfile(analysisResult.intent_profile, derivedIntent);
      const referenceMatches = findReferenceMatches(analysisResult);
      if (referenceMatches.length > 0) {
        analysisResult.reference_matches = referenceMatches;
      }
      if (!isAnalysisResult(analysisResult)) {
        return NextResponse.json(
          { error: "Invalid analysis response format", raw: content },
          { status: 500 }
        );
      }

      // Log Steve's summary for debugging.
      console.log("\n" + "=".repeat(60));
      console.log("🎨 STEVE'S ANALYSIS COMPLETE");
      console.log("=".repeat(60));

      // 📦 DEBUG: Product detection
      console.log(`📦 is_product: ${analysisResult.is_product}`);
      if (analysisResult.is_product && analysisResult.product_info) {
        console.log(`📦 Product Type: ${analysisResult.product_info.product_type}`);
        console.log(`📦 Brand: ${analysisResult.product_info.brand_detected}`);
      }

      console.log(`📊 Score: ${analysisResult.score}/100`);
      console.log(`👁️ Their Vision: ${analysisResult.their_vision}`);
      console.log(`📏 How Close: ${analysisResult.how_close}`);
      console.log(`💥 First Impression: ${analysisResult.first_impression}`);
      console.log(`🎯 The Gap: ${analysisResult.the_gap}`);
      if (analysisResult.steal_from) {
        console.log(`🎨 Feeling Detected: ${analysisResult.steal_from.feeling_detected}`);
        console.log(`🔀 Mix of Influences: ${analysisResult.steal_from.mix_of_influences?.join(", ")}`);
      }
      console.log(`\n📝 Variations:`);
      analysisResult.variations?.forEach((v, i) => {
        console.log(`  ${i + 1}. ${v.name} - ${v.what_it_fixes}`);
      });
      console.log("=".repeat(60) + "\n");

      logEvent({
        id: crypto.randomUUID(),
        ts: new Date().toISOString(),
        type: "analyze",
        sessionId: analysisId,
        userId: clientId,
        payload: {
          score: analysisResult.score,
          poster_type: analysisResult.poster_type,
          variation_mode: analysisResult.variation_mode,
          image_hash: imageHash,
          prompt_hash: promptFile.hash,
          intent_goal: analysisResult.intent_profile?.goal,
          intent_confidence: analysisResult.intent_profile?.confidence,
        },
      });

      return NextResponse.json(analysisResult);
    } catch (parseError) {
      console.error("JSON parse error:", parseError, "Content:", content);
      return NextResponse.json(
        { error: "Failed to parse model response", raw: content },
        { status: 500 }
      );
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("Gemini API timeout");
      return NextResponse.json(
        { error: "Gemini API request timed out" },
        { status: 504 }
      );
    }
    console.error("Server error:", error);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}

