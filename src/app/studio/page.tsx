"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { TEXT_SPECS } from "@/lib/design-system";

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

interface PosterElements {
  headline: string;
  subheadline: string | null;
  body_text: string[];
  visual_elements: string[];
  brand: string | null;
  purpose: string;
}

interface DesignVariation {
  name: string;
  what_it_fixes: string;
  stolen_from: string;
  the_feeling: string;
  prompt: string;
}

interface StyleDetection {
  primary_style: string;
  style_confidence: number;
  what_its_trying_to_be: string;
  what_it_actually_is: string;
  apple_compatibility: number;
}

interface EmotionalAnalysis {
  intended_emotion: string;
  actual_emotion: string;
  target_audience: string;
  makes_you_feel_something: boolean;
  soul_elements: string[];
}

interface ColorAnalysis {
  current_palette: string[];
  palette_works: boolean;
  suggested_palette: string[];
  reasoning: string;
}

interface StealFrom {
  feeling_detected: string;
  mix_of_influences: string[];
  the_2026_truth: string;
  techniques_to_steal: string[];
  why_this_mix: string;
}

interface SketchLayout {
  header_area: string;
  main_area: string;
  footer_area: string;
  elements: string[];
  hierarchy: string;
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
}

interface IntentProfile {
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
  needs_questions?: boolean;
  questions?: string[];
  signals?: {
    price?: string;
    discount?: string;
    date?: string;
    location?: string;
    brand?: string;
  };
}

interface ReferenceMatch {
  id: string;
  title: string;
  score: number;
  reasons: string[];
  styles?: string[];
  moods?: string[];
  palette?: string[];
  layout?: string;
  tags?: string[];
}

interface AnalysisResult {
  analysis_id?: string;
  poster_type?: "banner" | "thumbnail" | string;
  score: number;
  their_vision?: string;
  how_close?: string;
  first_impression: string;
  the_gap?: string;
  steal_from?: StealFrom;
  category_scores?: CategoryScores;
  style_detection?: StyleDetection;
  emotional_analysis?: EmotionalAnalysis;
  what_must_go?: string[];
  what_must_stay?: string[];
  what_must_change?: string[];
  color_analysis?: ColorAnalysis;
  feedback: {
    the_good: string[];
    the_bad: string[];
    the_fix: string;
    overall: string;
  };
  elements: PosterElements;
  intent_profile?: IntentProfile;
  reference_matches?: ReferenceMatch[];
  is_sketch?: boolean;
  sketch_layout?: SketchLayout;
  is_product?: boolean;
  product_info?: ProductInfo;
  variations: DesignVariation[];
  would_steve_ship_this: boolean;
  what_would_make_steve_ship_this: string;
}

interface GeneratedImage {
  index: number;
  imageData: string;
  prompt: string;
  name?: string;  // Variation name from server
  variationId?: string;
}

type AspectRatio = "9:16" | "16:9" | "1:1" | "4:5" | "3:4";
type RedesignPreset = "clean" | "bold" | "swiss" | "pop" | "luxury" | "retro";
type GradientPreset = "auto" | "mesh-soft" | "duotone-wash" | "dark-spotlight" | "warm-film";
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

const ASPECT_RATIOS: { value: AspectRatio; label: string; icon: string }[] = [
  { value: "9:16", label: "Portrait", icon: "▯" },
  { value: "16:9", label: "Landscape", icon: "▭" },
  { value: "1:1", label: "Square", icon: "□" },
  { value: "4:5", label: "Instagram", icon: "▯" },
  { value: "3:4", label: "Standard", icon: "▯" },
];

const REDESIGN_PRESET_GROUPS = {
  recommended: [
    { value: "clean", label: "Clean Minimal", description: "Clean, lots of whitespace, 2-3 colors", icon: "CM" },
    { value: "bold", label: "Bold Typography", description: "Large headline, high contrast", icon: "BT" },
    { value: "swiss", label: "Swiss/Grid", description: "Grid-based, highly structured", icon: "SG" },
  ],
  more: [
    { value: "pop", label: "Energetic Pop", description: "Bold colors, dynamic energy", icon: "EP" },
    { value: "luxury", label: "Luxury", description: "Premium, black/white + accent", icon: "LX" },
    { value: "retro", label: "Retro Poster", description: "Retro vibe, limited palette", icon: "RT" },
  ],
} as const;

const REDESIGN_PRESET_LABELS: Record<RedesignPreset, string> = {
  clean: "Clean Minimal",
  bold: "Bold Typography",
  swiss: "Swiss/Grid",
  pop: "Energetic Pop",
  luxury: "Luxury",
  retro: "Retro Poster",
};

const ARTISTIC_STYLE_GROUPS = {
  recommended: [
    { key: "dnaLayout", label: "Layout/Ratio DNA", icon: "LR" },
    { key: "dnaIconic", label: "Iconic Object", icon: "IO" },
    { key: "dnaGradient", label: "Gradient Atmosphere", icon: "GA" },
    { key: "elevated", label: "Elevated Essence", icon: "EE" },
  ],
  more: [
    { key: "painterly", label: "Painterly Touch", icon: "PT" },
    { key: "hand", label: "Hand-Drawn Heart", icon: "HD" },
    { key: "mood", label: "Mood Amplified", icon: "MA" },
    { key: "riso", label: "Risograph Print", icon: "RS" },
    { key: "paper", label: "Paper Cut Collage", icon: "PC" },
    { key: "ink", label: "Ink Wash", icon: "IW" },
    { key: "halftone", label: "Halftone Screenprint", icon: "HT" },
  ],
  trending: [
    { key: "boldMinimal", label: "Bold Minimal", icon: "BM" },
    { key: "warmEditorial", label: "Warm Editorial", icon: "WE" },
    { key: "handcrafted", label: "Handcrafted Type", icon: "HC" },
    { key: "texturedGrain", label: "Textured Grain", icon: "TG" },
    { key: "neoTech", label: "Neo-Tech Glow", icon: "NT" },
    { key: "windowLight", label: "Window Light", icon: "WL" },
    { key: "retroMetallic", label: "Retro Serif", icon: "RM" },
    { key: "abstractBotanicals", label: "Abstract Botanicals", icon: "AB" },
  ],
} as const;

const GRADIENT_PRESETS: { value: GradientPreset; label: string; description: string }[] = [
  { value: "auto", label: "Auto", description: "Pick based on moodboard cues" },
  { value: "mesh-soft", label: "Mesh Gradient", description: "Soft modern mesh blend" },
  { value: "duotone-wash", label: "Duotone Wash", description: "Two-tone wash for clarity" },
  { value: "dark-spotlight", label: "Dark Spotlight", description: "Dark-to-light focus glow" },
  { value: "warm-film", label: "Warm Film", description: "Warm fade, editorial feel" },
];

const MAX_AUTO_RETRIES = 3;

export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [generationRequestId, setGenerationRequestId] = useState<string | null>(null);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "details" | "principles" | "variations">("overview");
  const [selectedVariation, setSelectedVariation] = useState<number | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("9:16");
  const [redesignPreset, setRedesignPreset] = useState<RedesignPreset>("clean");
  const [artisticIntensity, setArtisticIntensity] = useState<"subtle" | "balanced" | "extreme">("balanced");
  const [artisticTextSafety, setArtisticTextSafety] = useState<"strict" | "creative">("strict");
  const [artisticColorFidelity, setArtisticColorFidelity] = useState<"preserve" | "explore">("preserve");
  const [artisticExtra, setArtisticExtra] = useState(false);
  const [selectedArtisticStyles, setSelectedArtisticStyles] = useState<ArtisticStyleKey[]>([]);
  const [gradientPreset, setGradientPreset] = useState<GradientPreset>("auto");
  const [compareValue, setCompareValue] = useState(50);
  const [editingPromptIndex, setEditingPromptIndex] = useState<number | null>(null);
  const [editedPrompts, setEditedPrompts] = useState<Record<number, string>>({});
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
  const [intentInputs, setIntentInputs] = useState({
    goal: "",
    cta: "",
    audience: "",
  });
  const [intentSaved, setIntentSaved] = useState(false);
  const [inspirationNotes, setInspirationNotes] = useState("");
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);
  const [retryLabel, setRetryLabel] = useState<string | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryAttemptsRef = useRef<Record<string, number>>({});

  // Sketch-to-Design states
  const [showSketchModal, setShowSketchModal] = useState(false);
  const [sketchInputs, setSketchInputs] = useState({
    headline: "",
    subheadline: "",
    price: "",
    cta: "",
    brand: "",
    additionalText: ""
  });
  const [sketchStyle, setSketchStyle] = useState<"minimal" | "bold" | "playful" | "premium" | "dark">("minimal");
  const [sketchCategory, setSketchCategory] = useState<"product" | "event" | "sale" | "announcement" | "social">("product");
  const [isGeneratingFromSketch, setIsGeneratingFromSketch] = useState(false);

  // Product-to-Poster states
  const [showProductModal, setShowProductModal] = useState(false);
  const [productInputs, setProductInputs] = useState({
    headline: "",
    subheadline: "",
    price: "",
    cta: "",
    brand: ""
  });
  const [productCampaign, setProductCampaign] = useState<"sale" | "launch" | "awareness" | "seasonal">("awareness");
  const [productStyle, setProductStyle] = useState<"fun" | "premium" | "athletic" | "eco" | "minimal" | "bold">("premium");
  const [isGeneratingFromProduct, setIsGeneratingFromProduct] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectionActive = selectedArtisticStyles.length > 0;
  const defaultArtisticCount = 4 + (artisticExtra ? 4 : 0);

  const toggleArtisticStyle = (key: ArtisticStyleKey) => {
    setSelectedArtisticStyles((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    );
  };

  const clearArtisticStyles = () => {
    setSelectedArtisticStyles([]);
  };

  const clearRetryTimers = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (retryIntervalRef.current) {
      clearInterval(retryIntervalRef.current);
      retryIntervalRef.current = null;
    }
    setRetryCountdown(null);
    setRetryLabel(null);
  }, []);

  const parseRetryDelaySeconds = useCallback((message: string) => {
    const secMatch = message.match(/Please retry in\s*([\d.]+)s/i);
    if (secMatch) {
      const seconds = Number.parseFloat(secMatch[1]);
      if (Number.isFinite(seconds) && seconds > 0) {
        return Math.ceil(seconds);
      }
    }
    const msMatch = message.match(/Please retry in\s*([\d.]+)ms/i);
    if (msMatch) {
      const ms = Number.parseFloat(msMatch[1]);
      if (Number.isFinite(ms) && ms > 0) {
        return Math.max(1, Math.ceil(ms / 1000));
      }
    }
    return null;
  }, []);

  const isHardQuotaOrBillingError = useCallback((message: string) => {
    const lower = message.toLowerCase();
    return (
      lower.includes("quota exceeded") ||
      lower.includes("limit: 0") ||
      lower.includes("billing details") ||
      lower.includes("generate_requests_per_model_per_day")
    );
  }, []);

  const isRetryableServiceError = useCallback((message: string) => {
    if (isHardQuotaOrBillingError(message)) return false;
    const lower = message.toLowerCase();
    return (
      lower.includes("high demand") ||
      lower.includes("try again later") ||
      lower.includes("temporar") ||
      lower.includes("unavailable") ||
      lower.includes("rate limit") ||
      lower.includes("too many requests") ||
      lower.includes("retry in") ||
      lower.includes("503") ||
      lower.includes("429")
    );
  }, [isHardQuotaOrBillingError]);

  const buildApiErrorMessage = useCallback(
    (
      fallback: string,
      payload?: { error?: unknown; details?: unknown }
    ) => {
      const error =
        typeof payload?.error === "string" && payload.error.trim()
          ? payload.error.trim()
          : fallback;
      const details =
        typeof payload?.details === "string" && payload.details.trim()
          ? payload.details.trim()
          : "";
      return details ? `${error}: ${details}` : error;
    },
    []
  );

  const scheduleAutoRetry = useCallback(
    (
      key: string,
      label: string,
      message: string,
      retryAction: () => Promise<void> | void
    ) => {
      if (!isRetryableServiceError(message)) return false;

      const attempt = retryAttemptsRef.current[key] ?? 0;
      if (attempt >= MAX_AUTO_RETRIES) return false;

      const parsedDelay = parseRetryDelaySeconds(message);
      const delaySeconds = Math.min(90, Math.max(5, parsedDelay ?? 20));
      retryAttemptsRef.current[key] = attempt + 1;

      clearRetryTimers();
      setRetryLabel(`${label} auto-retry ${attempt + 1}/${MAX_AUTO_RETRIES}`);
      setRetryCountdown(delaySeconds);

      retryIntervalRef.current = setInterval(() => {
        setRetryCountdown((prev) => {
          if (prev === null) return null;
          if (prev <= 1) return 0;
          return prev - 1;
        });
      }, 1000);

      retryTimeoutRef.current = setTimeout(() => {
        clearRetryTimers();
        void Promise.resolve(retryAction());
      }, delaySeconds * 1000);

      return true;
    },
    [clearRetryTimers, isRetryableServiceError, parseRetryDelaySeconds]
  );

  useEffect(() => {
    return () => {
      clearRetryTimers();
    };
  }, [clearRetryTimers]);

  const buildAutoMoodboard = useCallback((analysis: AnalysisResult | null) => {
    if (!analysis) return null;
    const palette =
      analysis.color_analysis?.suggested_palette?.length
        ? analysis.color_analysis.suggested_palette
        : analysis.color_analysis?.current_palette || [];

    const mood =
      analysis.intent_profile?.desired_emotion ||
      analysis.emotional_analysis?.intended_emotion ||
      analysis.steal_from?.feeling_detected ||
      "";

    const style =
      analysis.style_detection?.primary_style ||
      analysis.style_detection?.what_its_trying_to_be ||
      "";

    const intent = analysis.intent_profile?.goal || "";

    const keywords = [style, mood, intent].filter(Boolean);

    const layoutHint =
      analysis.poster_type === "banner"
        ? "Wide layout, strong left-right hierarchy"
        : analysis.poster_type === "thumbnail"
          ? "Center focus, oversized headline"
          : "Poster layout, 60%+ whitespace";

    return {
      palette,
      keywords,
      layoutHint,
      fonts: {
        headline: TEXT_SPECS.fonts.display,
        body: TEXT_SPECS.fonts.sans,
      },
    };
  }, []);

  const applyIntentInputs = () => {
    if (!analysisResult) return;
    const existing = analysisResult.intent_profile || ({} as IntentProfile);
    const updated: IntentProfile = {
      ...existing,
      goal: intentInputs.goal || existing.goal || "awareness",
      primary_message: existing.primary_message || analysisResult.elements?.headline || "",
      what_they_want_to_show: existing.what_they_want_to_show || analysisResult.elements?.purpose || "",
      what_they_want_viewer_to_feel:
        existing.what_they_want_viewer_to_feel || analysisResult.emotional_analysis?.intended_emotion || "",
      desired_emotion: existing.desired_emotion || analysisResult.emotional_analysis?.intended_emotion || "",
      target_audience:
        intentInputs.audience ||
        existing.target_audience ||
        analysisResult.emotional_analysis?.target_audience ||
        "",
      cta: intentInputs.cta || existing.cta || "none",
      brand_tone: existing.brand_tone || analysisResult.style_detection?.what_its_trying_to_be || "",
      constraints: existing.constraints || [],
      confidence: 100,
      needs_questions: false,
      questions: [],
    };

    setAnalysisResult({
      ...analysisResult,
      intent_profile: updated,
    });
    setIntentSaved(true);
  };

  const compressImage = (file: File, maxSize: number = 1920): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = document.createElement("img");
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let { width, height } = img;

          // Resize if larger than maxSize
          if (width > maxSize || height > maxSize) {
            if (width > height) {
              height = (height / width) * maxSize;
              width = maxSize;
            } else {
              width = (width / height) * maxSize;
              height = maxSize;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, width, height);

          // Compress to JPEG with 0.8 quality
          const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.8);
          resolve(compressedDataUrl);
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFile = useCallback(async (file: File) => {
    if (file && file.type.startsWith("image/")) {
      setFileName(file.name);
      setAnalysisResult(null);
      setGeneratedImages([]);
      setError(null);
      clearRetryTimers();
      retryAttemptsRef.current = {};
      setActiveTab("overview");
      setSelectedVariation(null);
      setCompareValue(50);

      try {
        // Compress image to reduce size for upload
        const compressedImage = await compressImage(file);
        setImage(compressedImage);
      } catch {
        // Fallback to original if compression fails
        const reader = new FileReader();
        reader.onload = (e) => {
          setImage(e.target?.result as string);
        };
        reader.readAsDataURL(file);
      }
    }
  }, [clearRetryTimers]);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const sendFeedback = useCallback(
    (event: { action: "select" | "download"; variationId?: string; index?: number }) => {
      if (!analysisId && !generationRequestId) return;
      void fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId,
          requestId: generationRequestId,
          ...event,
        }),
      }).catch(() => {});
    },
    [analysisId, generationRequestId]
  );

  const handleAnalyze = async (isAutoRetry = false) => {
    if (!image) return;
    const retryKey = "analyze";
    if (!isAutoRetry) {
      retryAttemptsRef.current[retryKey] = 0;
      clearRetryTimers();
    }
    setIsAnalyzing(true);
    setError(null);
    setAnalysisResult(null);
    setAnalysisId(null);
    setGenerationRequestId(null);
    setGeneratedImages([]);
    setSelectedArtisticStyles([]);
    setInspirationNotes("");
    setGradientPreset("auto");

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ image }),
      });

      // Handle non-OK responses first
      if (!response.ok) {
        if (response.status === 413) {
          throw new Error("Image is too large. Please upload a smaller one.");
        }
        const text = await response.text();
        try {
          const data = JSON.parse(text);
          throw new Error(data.error || "Something went wrong");
        } catch {
          throw new Error(`Server error: ${response.status}`);
        }
      }

      const data = await response.json();
      setAnalysisResult(data);
      retryAttemptsRef.current[retryKey] = 0;
      setAnalysisId(data.analysis_id ?? null);
      setIntentInputs({
        goal: data?.intent_profile?.goal || "",
        cta: data?.intent_profile?.cta || "",
        audience: data?.intent_profile?.target_audience || "",
      });
      setIntentSaved(false);

      // If sketch detected, show sketch input modal
      if (data.is_sketch) {
        console.log("📝 SKETCH DETECTED! Showing input modal...");
        setShowSketchModal(true);
        // Pre-fill from sketch_layout if available
        if (data.sketch_layout) {
          setSketchInputs(prev => ({
            ...prev,
            headline: data.sketch_layout.hierarchy || "",
          }));
        }
      }
      // If product detected, show product input modal
      else if (data.is_product) {
        console.log("📦 PRODUCT DETECTED! Showing input modal...");
        setShowProductModal(true);
        // Pre-fill from product_info if available
        if (data.product_info) {
          setProductInputs(prev => ({
            ...prev,
            brand: data.product_info.brand_detected || "",
            headline: data.product_info.suggested_headlines?.[0] || "",
          }));
          // Auto-select style based on product mood
          const moodToStyle: Record<string, "fun" | "premium" | "athletic" | "eco" | "minimal" | "bold"> = {
            playful: "fun",
            professional: "premium",
            energetic: "athletic",
            calm: "minimal",
            premium: "premium",
            natural: "eco",
            bold: "bold"
          };
          if (data.product_info.color_mood && moodToStyle[data.product_info.color_mood]) {
            setProductStyle(moodToStyle[data.product_info.color_mood]);
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      void scheduleAutoRetry(retryKey, "Analyze", message, () => handleAnalyze(true));
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Generation mode state
  const [generationMode, setGenerationMode] = useState<"artistic" | "redesign" | null>(null);

  const handleGenerateVariations = async (
    mode: "artistic" | "redesign",
    isAutoRetry = false
  ) => {
    if (!image) return;
    const retryKey = `generate:${mode}`;
    if (!isAutoRetry) {
      retryAttemptsRef.current[retryKey] = 0;
      clearRetryTimers();
    }
    setIsGenerating(true);
    setGenerationMode(mode);
    setError(null);

    try {
      // Pass mode to API - it will generate appropriate prompts
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode,
          aspectRatio,
          parallel: true,
          originalImage: image,
          analysisResult,
          sourceImageName: fileName || undefined, // Keep source name for better logo matching
          analysisId,
          redesignPreset: mode === "redesign" ? redesignPreset : undefined,
          artisticIntensity: mode === "artistic" ? artisticIntensity : undefined,
          artisticTextSafety: mode === "artistic" ? artisticTextSafety : undefined,
          artisticColorFidelity: mode === "artistic" ? artisticColorFidelity : undefined,
          artisticExtra: mode === "artistic" ? artisticExtra : undefined,
          artisticStyles: mode === "artistic" && selectedArtisticStyles.length > 0 ? selectedArtisticStyles : undefined,
          inspirationNotes: inspirationNotes.trim() ? inspirationNotes.trim() : undefined,
          gradientPreset: gradientPreset
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(buildApiErrorMessage("Failed to generate image", data));
      }

      setGeneratedImages(data.images);
      retryAttemptsRef.current[retryKey] = 0;
      setGenerationRequestId(data.requestId ?? null);
      if (data.images && data.images.length > 0) {
        const bestIndex = pickBestVariationIndex(data.images);
        setSelectedVariation(bestIndex ?? 0);
        setCompareValue(50);
      }
      setActiveTab("variations");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      void scheduleAutoRetry(retryKey, "Generate", message, () => handleGenerateVariations(mode, true));
    } finally {
      setIsGenerating(false);
      setGenerationMode(null);
    }
  };

  // Regenerate a single variation with edited prompt
  const handleRegenerateVariation = async (index: number, isAutoRetry = false) => {
    if (!analysisResult?.variations[index]) return;
    const retryKey = `regenerate:${index}`;
    if (!isAutoRetry) {
      retryAttemptsRef.current[retryKey] = 0;
      clearRetryTimers();
    }
    setRegeneratingIndex(index);
    setError(null);

    try {
      const prompt = editedPrompts[index] || analysisResult.variations[index].prompt;

      // Pass original image so Gemini can SEE it and IMPROVE it
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompts: [prompt],
          aspectRatio,
          parallel: false,
          originalImage: image,
          analysisResult,
          sourceImageName: fileName || undefined, // Keep source name for better logo matching
          analysisId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(buildApiErrorMessage("Failed to generate image", data));
      }

      if (data.images && data.images.length > 0) {
        retryAttemptsRef.current[retryKey] = 0;
        setGenerationRequestId(data.requestId ?? null);
        // Update the specific image
        setGeneratedImages(prev => {
          const newImages = [...prev];
          const existingIndex = newImages.findIndex(img => img.index === index);
          const newImage = { ...data.images[0], index };
          if (existingIndex >= 0) {
            newImages[existingIndex] = newImage;
          } else {
            newImages.push(newImage);
            newImages.sort((a, b) => a.index - b.index);
          }
          return newImages;
        });
      }
      setEditingPromptIndex(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      void scheduleAutoRetry(retryKey, "Regenerate", message, () => handleRegenerateVariation(index, true));
    } finally {
      setRegeneratingIndex(null);
    }
  };

  // Sketch-to-Design generation
  const handleGenerateFromSketch = async (isAutoRetry = false) => {
    if (!image || !analysisResult?.sketch_layout) return;
    const retryKey = "generate:sketch";
    if (!isAutoRetry) {
      retryAttemptsRef.current[retryKey] = 0;
      clearRetryTimers();
    }
    setIsGeneratingFromSketch(true);
    setShowSketchModal(false);
    setError(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "sketch-to-design",
          aspectRatio,
          parallel: true,
          originalImage: image,
          analysisResult,
          sourceImageName: fileName || undefined, // Keep source name for better logo matching
          analysisId,
          sketchInputs,
          sketchStyle,
          sketchCategory,
          sketchLayout: analysisResult.sketch_layout
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(buildApiErrorMessage("Failed to generate design", data));
      }

      if (data.images && data.images.length > 0) {
        retryAttemptsRef.current[retryKey] = 0;
        setGenerationRequestId(data.requestId ?? null);
        const normalized = data.images.map((img: { imageData: string; prompt: string; name?: string }, i: number) => ({
          ...img,
          index: i
        }));
        setGeneratedImages(normalized);
        const bestIndex = pickBestVariationIndex(normalized);
        setSelectedVariation(bestIndex ?? 0);
        setCompareValue(50);
        setActiveTab("variations");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      void scheduleAutoRetry(retryKey, "Generate design", message, () => handleGenerateFromSketch(true));
    } finally {
      setIsGeneratingFromSketch(false);
    }
  };

  // Product-to-Poster generation
  const handleGenerateFromProduct = async (isAutoRetry = false) => {
    if (!image || !analysisResult?.product_info) return;
    const retryKey = "generate:product";
    if (!isAutoRetry) {
      retryAttemptsRef.current[retryKey] = 0;
      clearRetryTimers();
    }
    setIsGeneratingFromProduct(true);
    setShowProductModal(false);
    setError(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "product-to-poster",
          aspectRatio,
          parallel: true,
          originalImage: image,
          analysisResult,
          sourceImageName: fileName || undefined, // Keep source name for better logo matching
          analysisId,
          productInputs,
          productCampaign,
          productStyle,
          productInfo: analysisResult.product_info
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(buildApiErrorMessage("Failed to generate poster", data));
      }

      if (data.images && data.images.length > 0) {
        retryAttemptsRef.current[retryKey] = 0;
        setGenerationRequestId(data.requestId ?? null);
        const normalized = data.images.map((img: { imageData: string; prompt: string; name?: string }, i: number) => ({
          ...img,
          index: i
        }));
        setGeneratedImages(normalized);
        const bestIndex = pickBestVariationIndex(normalized);
        setSelectedVariation(bestIndex ?? 0);
        setCompareValue(50);
        setActiveTab("variations");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      void scheduleAutoRetry(retryKey, "Generate poster", message, () => handleGenerateFromProduct(true));
    } finally {
      setIsGeneratingFromProduct(false);
    }
  };

  const handleRemoveImage = () => {
    clearRetryTimers();
    retryAttemptsRef.current = {};
    setImage(null);
    setFileName("");
    setAnalysisResult(null);
    setAnalysisId(null);
    setGenerationRequestId(null);
    setGeneratedImages([]);
    setError(null);
    setActiveTab("overview");
    setSelectedVariation(null);
    setCompareValue(50);
    setEditedPrompts({});
    setEditingPromptIndex(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDownload = (imageData: string, index: number) => {
    const link = document.createElement("a");
    link.href = imageData;
    link.download = `improved-poster-${index + 1}.png`;
    link.click();
    sendFeedback({
      action: "download",
      variationId: generatedImages[index]?.variationId,
      index,
    });
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-[#cfeaff]";
    if (score >= 60) return "text-zinc-300";
    return "text-zinc-500";
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return "from-[#bde7ff]/20 to-transparent border-[#bde7ff]/30";
    if (score >= 60) return "from-white/10 to-transparent border-white/15";
    return "from-white/5 to-transparent border-white/10";
  };

  const getScoreRingColor = (score: number) => {
    if (score >= 80) return "stroke-[#bde7ff]";
    if (score >= 60) return "stroke-white/60";
    return "stroke-white/40";
  };


  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "typography":
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
          </svg>
        );
      case "space":
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
          </svg>
        );
      case "simplicity":
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        );
      case "emotion":
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        );
      case "craft":
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      default:
        return null;
    }
  };

  const getCategoryName = (category: string) => {
    const names: Record<string, string> = {
      typography: "Typography",
      space: "White Space",
      simplicity: "Simplicity",
      emotion: "Emotion",
      craft: "Craft",
    };
    return names[category] || category;
  };

  const getErrorHint = (message: string) => {
    const lower = message.toLowerCase();
    if (lower.includes("tailwindcss")) {
      return "Dependencies missing. Run npm install inside the project folder.";
    }
    if (lower.includes("lock") && lower.includes(".next")) {
      return "Another Next.js dev server is running. Stop it, then restart.";
    }
    if (lower.includes("timeout") || lower.includes("504")) {
      return "The request timed out. Try again or use a smaller image.";
    }
    if (lower.includes("invalid analysis response format")) {
      return "AI response was truncated. Try analyze again.";
    }
    return "Please try again. If it keeps happening, restart dev server.";
  };

  const pickBestVariationIndex = (images: GeneratedImage[]) => {
    if (!images || images.length === 0) return null;
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
      const score = keywords.reduce((acc, { key, weight }) => (haystack.includes(key) ? acc + weight : acc), 0);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = idx;
      }
    });

    return bestIndex;
  };

  const normalizeImageData = (imageData: string) => {
    if (!imageData) return "";
    if (imageData.startsWith("data:")) return imageData;
    return `data:image/jpeg;base64,${imageData}`;
  };

  // Score Ring Component
  const ScoreRing = ({ score, size = 120 }: { score: number; size?: number }) => {
    const strokeWidth = 8;
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (score / 100) * circumference;

    return (
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="transform -rotate-90" width={size} height={size}>
          <circle
            className="stroke-white/10"
            strokeWidth={strokeWidth}
            fill="transparent"
            r={radius}
            cx={size / 2}
            cy={size / 2}
          />
          <circle
            className={`${getScoreRingColor(score)} transition-all duration-1000 ease-out`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="transparent"
            r={radius}
            cx={size / 2}
            cy={size / 2}
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: offset,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-3xl font-bold ${getScoreColor(score)}`}>{score}</span>
        </div>
      </div>
    );
  };

  // Category Score Card
  const CategoryScoreCard = ({
    category,
    score,
    feedback
  }: {
    category: string;
    score: number;
    feedback: string;
  }) => (
    <div className={`p-5 rounded-2xl bg-gradient-to-br ${getScoreBgColor(score)} border`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={getScoreColor(score)}>{getCategoryIcon(category)}</span>
          <span className="text-white font-semibold text-base">{getCategoryName(category)}</span>
        </div>
        <span className={`text-2xl font-semibold ${getScoreColor(score)}`}>{score}</span>
      </div>
      <p className="text-zinc-300 text-sm leading-relaxed">{feedback}</p>
    </div>
  );

  const isBusy =
    isAnalyzing ||
    isGenerating ||
    isGeneratingFromSketch ||
    isGeneratingFromProduct;

  const busyLabel = isAnalyzing
    ? "Analyzing poster"
    : isGenerating
    ? generationMode === "artistic"
      ? "Generating artistic variants"
      : "Generating redesign variants"
    : isGeneratingFromSketch
    ? "Generating from sketch"
    : isGeneratingFromProduct
    ? "Generating product poster"
    : null;

  const busyEstimate = isAnalyzing
    ? "~ 10-20s"
    : isGenerating
    ? "~ 35-60s"
    : isGeneratingFromSketch || isGeneratingFromProduct
    ? "~ 45-70s"
    : "";

  const currentStep = !image ? 1 : !analysisResult ? 2 : 3;
  const bestVariationIndex = pickBestVariationIndex(generatedImages);
  const quickFix =
    analysisResult?.what_must_change?.[0] ||
    analysisResult?.feedback?.the_fix ||
    "Refine hierarchy so the message lands in three seconds.";
  const quickKeep =
    analysisResult?.what_must_stay?.[0] ||
    analysisResult?.feedback?.the_good?.[0] ||
    "Keep your strongest headline and clearest visual cue.";
  const quickRemove =
    analysisResult?.what_must_go?.[0] ||
    analysisResult?.feedback?.the_bad?.[0] ||
    "Remove competing elements that split attention.";
  const splitLeadSentence = (text: string) => {
    if (!text) return { lead: "", rest: "" };
    const match = text.match(/^(.*?[.!?])\s+(.*)$/);
    if (match) return { lead: match[1], rest: match[2] };
    return { lead: text, rest: "" };
  };
  const overall = splitLeadSentence(analysisResult?.feedback?.overall || "");

  return (
    <div className="min-h-screen gradient-bg relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_500px_at_50%_-10%,rgba(16,185,129,0.12),transparent_60%)]" />
      {/* Header */}
      <header className="px-6 py-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/90 flex items-center justify-center text-black">
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <div className="leading-tight">
              <span className="block text-xl font-semibold text-white font-[var(--font-display)] tracking-tight">Reko</span>
              <span className="text-xs uppercase tracking-[0.3em] text-zinc-400">Poster Coach</span>
            </div>

          </div>
          <nav className="flex items-center gap-4 text-xs uppercase tracking-[0.2em] text-zinc-400">
            <Link href="/" className="hidden sm:inline hover:text-zinc-200">
              Home
            </Link>
            <Link href="/dashboard" className="hidden sm:inline hover:text-zinc-200">
              Dashboard
            </Link>
            <Link href="/library" className="hidden sm:inline hover:text-zinc-200">
              Library
            </Link>
            <Link href="/billing" className="hidden sm:inline hover:text-zinc-200">
              Billing
            </Link>
            <span className="hidden sm:inline">Private by default</span>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 px-6 pb-16 pt-8">
        <div className="max-w-6xl mx-auto">
          {/* Title Section */}
          <div className="text-center mb-12">
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-400 mb-4">Upload / Analyze / Improve</p>
            <h1 className="text-4xl md:text-6xl font-semibold text-white mb-4 font-[var(--font-display)] tracking-tight">
              Make your poster feel <span className="text-zinc-200">inevitable</span>.
            </h1>
            <p className="text-zinc-300 text-lg md:text-xl max-w-2xl mx-auto">
              Strip the design down to what can be understood in seconds. One goal, one message, one strong feeling.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs uppercase tracking-[0.3em] text-zinc-400">
              {[
                { id: 1, label: "01 Upload" },
                { id: 2, label: "02 Analyze" },
                { id: 3, label: "03 Improve" },
              ].map((step) => (
                <span
                  key={step.id}
                  className={`border-b pb-1 transition-colors ${
                    currentStep >= step.id
                      ? "border-emerald-400 text-zinc-200"
                      : "border-transparent text-zinc-500"
                  }`}
                >
                  {step.label}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            {/* Left Column - Upload & Original */}
            <div className="space-y-6">
              {/* Upload Area */}
              <div
                onClick={!image ? handleClick : undefined}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`
                  relative rounded-3xl border border-white/10 transition-all duration-300 overflow-hidden backdrop-blur
                  ${
                    isDragging
                      ? "border-emerald-400 bg-emerald-400/10"
                      : image
                      ? "bg-white/5"
                      : "bg-white/5 hover:border-emerald-400/50 hover:bg-white/10 cursor-pointer"
                  }
                `}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileInput}
                  className="hidden"
                />

                {!image ? (
                  <div className="flex flex-col items-center justify-center py-16 px-6">
                    <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center mb-6">
                      <svg
                        className="w-7 h-7 text-zinc-200"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                    <h3 className="text-2xl font-semibold text-white mb-2 font-[var(--font-display)]">
                      Upload Poster
                    </h3>
                    <p className="text-zinc-300 text-center mb-5 max-w-sm">
                      Drag and drop an image or pick one. We'll read the intent and improve it fast.
                    </p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClick();
                      }}
                      className="mb-4 inline-flex items-center gap-2 rounded-full bg-emerald-400 px-6 py-2.5 text-sm font-semibold text-black shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-300"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Upload Poster
                    </button>
                    <p className="text-zinc-500 text-sm">
                      PNG, JPG, WEBP / &lt;= 10MB
                    </p>
                  </div>
                ) : (
                  <div className="relative">
                    {/* Image Preview */}
                    <div className="relative aspect-[3/4] w-full">
                      <img
                        src={image}
                        alt="Uploaded poster"
                        className="absolute inset-0 h-full w-full object-contain"
                      />
                    </div>

                    {/* Image Info Bar */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                            <svg
                              className="w-4 h-4 text-zinc-200"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          </div>
                          <span className="text-sm text-zinc-300 truncate max-w-[200px]">
                            {fileName}
                          </span>
                        </div>
                        <button
                          onClick={handleRemoveImage}
                          className="text-zinc-400 hover:text-zinc-400 transition-colors p-2"
                        >
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Analyze Button */}
              {image && !analysisResult && (
                <button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing}
                  className={`
                    w-full px-8 py-4 rounded-xl font-medium text-lg transition-all duration-300 flex items-center justify-center gap-3
                    ${
                      !isAnalyzing
                        ? "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-400 hover:to-emerald-500 shadow-lg shadow-emerald-500/25"
                        : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                    }
                  `}
                >
                  {isAnalyzing ? (
                    <>
                      <svg
                        className="w-5 h-5 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                        />
                      </svg>
                      Analyze
                    </>
                  )}
                </button>
              )}

              {/* Product Poster Button */}
              {analysisResult?.product_info && (
                <button
                  onClick={() => setShowProductModal(true)}
                  disabled={isGeneratingFromProduct}
                  className={`w-full px-6 py-3 rounded-xl font-medium transition-all duration-300 flex items-center justify-center gap-2 border ${
                    !isGeneratingFromProduct
                      ? "border-emerald-500/40 text-zinc-200 hover:border-emerald-400 hover:text-emerald-200 bg-emerald-500/10"
                      : "border-zinc-700 text-zinc-500 cursor-not-allowed bg-zinc-900"
                  }`}
                >
                  {isGeneratingFromProduct ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Preparing product poster...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18l-1.5 10.5a2 2 0 01-2 1.5H6.5a2 2 0 01-2-1.5L3 7zm4 0V5a2 2 0 012-2h6a2 2 0 012 2v2" />
                      </svg>
                      Create product poster
                    </>
                  )}
                </button>
              )}

              {/* Main Score Card */}
              {analysisResult && (
                <div className="rounded-2xl border border-white/8 bg-zinc-950/80 shadow-[0_18px_48px_-32px_rgba(0,0,0,0.9)]">
                  <div className="p-4 sm:p-6 grid gap-6 lg:grid-cols-[0.9fr,1.1fr]">
                    <div className="rounded-2xl border border-white/6 bg-zinc-950/80 p-5">
                      <div className="flex items-center gap-5">
                        <ScoreRing score={analysisResult.score} />
                        <div>
                          <p className="text-[12px] tracking-[0.08em] normal-case text-zinc-500 font-medium">Analysis score</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <p className="text-3xl md:text-4xl font-semibold text-white font-[var(--font-display)] tracking-tight leading-tight">
                              {analysisResult.would_steve_ship_this
                                ? "Ship it."
                                : analysisResult.score >= 60
                                ? "Close, but not yet."
                                : "Needs a reset."}
                            </p>
                            <span className={`rounded-full border px-3 py-1 text-[11px] tracking-[0.08em] normal-case ${
                              analysisResult.would_steve_ship_this
                                ? "border-[#bde7ff]/40 bg-[#bde7ff]/15 text-[#e8f7ff]"
                                : "border-white/20 bg-white/5 text-zinc-200"
                            }`}>
                              {analysisResult.would_steve_ship_this ? "Approved" : "In progress"}
                            </span>
                          </div>
                          <p className="text-zinc-500 text-[11px] tracking-[0.08em] normal-case mt-2">Steve Jobs rubric</p>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {analysisResult.style_detection?.primary_style && (
                          <Badge>{analysisResult.style_detection.primary_style}</Badge>
                        )}
                        {analysisResult.style_detection?.apple_compatibility !== undefined && (
                          <Badge variant="outline">Apple fit {analysisResult.style_detection.apple_compatibility}%</Badge>
                        )}
                        {analysisResult.color_analysis?.palette_works !== undefined && (
                          <Badge variant="outline">
                            {analysisResult.color_analysis.palette_works ? "Palette works" : "Palette needs work"}
                          </Badge>
                        )}
                      </div>
                </div>

                <div className="space-y-4">
                  {analysisResult && (() => {
                    const moodboard = buildAutoMoodboard(analysisResult);
                    if (!moodboard) return null;
                    return (
                      <div className="rounded-2xl border border-white/6 bg-zinc-950/80 p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-[12px] tracking-[0.08em] normal-case text-zinc-500">Auto moodboard</p>
                            <p className="mt-2 text-sm text-zinc-300">
                              We read the poster and generate a quick moodboard (palette, type, layout cues).
                            </p>
                          </div>
                          <div className="text-xs text-zinc-500">Instant research</div>
                        </div>

                        <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
                          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                            <p className="text-xs uppercase tracking-wide text-zinc-500">Palette</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {moodboard.palette.length ? (
                                moodboard.palette.map((color, index) => (
                                  <div
                                    key={`${color}-${index}`}
                                    className="flex items-center gap-2 rounded-full border border-white/10 px-2 py-1"
                                  >
                                    <span
                                      className="h-4 w-4 rounded-full border border-white/20"
                                      style={{ backgroundColor: color }}
                                    />
                                    <span className="text-xs text-zinc-300">{color}</span>
                                  </div>
                                ))
                              ) : (
                                <p className="text-xs text-zinc-500">Palette will appear after analysis.</p>
                              )}
                            </div>
                          </div>

                          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
                            <div>
                              <p className="text-xs uppercase tracking-wide text-zinc-500">Keywords</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {moodboard.keywords.length ? (
                                  moodboard.keywords.map((word, index) => (
                                    <span
                                      key={`${word}-${index}`}
                                      className="rounded-full border border-white/10 px-2 py-1 text-xs text-zinc-300"
                                    >
                                      {word}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-xs text-zinc-500">No keywords yet.</span>
                                )}
                              </div>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wide text-zinc-500">Layout cue</p>
                              <p className="mt-2 text-xs text-zinc-300">{moodboard.layoutHint}</p>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                            <p className="text-xs uppercase tracking-wide text-zinc-500">Headline fonts</p>
                            <p className="mt-2 text-xs text-zinc-300">
                              {moodboard.fonts.headline.join(", ")}
                            </p>
                          </div>
                          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                            <p className="text-xs uppercase tracking-wide text-zinc-500">Body fonts</p>
                            <p className="mt-2 text-xs text-zinc-300">
                              {moodboard.fonts.body.join(", ")}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="rounded-2xl border border-white/6 bg-zinc-950/80 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[12px] tracking-[0.08em] normal-case text-zinc-500">Summary</p>
                      <p className="text-[12px] tracking-[0.08em] normal-case text-zinc-500">Meta</p>
                        </div>
                        <div className="mt-4 grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
                          <div className="space-y-4 divide-y divide-white/10">
                            {analysisResult.their_vision && (
                              <div className="pt-0">
                                <p className="text-[11px] tracking-[0.08em] normal-case text-zinc-500 mb-2">Intent</p>
                                <p className="text-zinc-200 text-sm leading-6 line-clamp-4">{analysisResult.their_vision}</p>
                              </div>
                            )}

                            {analysisResult.how_close && (
                              <div className="pt-4">
                                <p className="text-[11px] tracking-[0.08em] normal-case text-zinc-500 mb-2">Distance</p>
                                <p className="text-zinc-200 text-sm leading-6 line-clamp-4">{analysisResult.how_close}</p>
                              </div>
                            )}

                            {analysisResult.first_impression && (
                              <div className="pt-4">
                                <p className="text-[11px] tracking-[0.08em] normal-case text-zinc-500 mb-2">First impression</p>
                                <p className="text-zinc-200 text-sm italic leading-6 line-clamp-3">
                                  &ldquo;{analysisResult.first_impression}&rdquo;
                                </p>
                              </div>
                            )}
                          </div>

                          <div className="rounded-xl bg-white/5 p-4 space-y-4">
                            {analysisResult.emotional_analysis?.intended_emotion && (
                              <div>
                                <p className="text-[11px] tracking-[0.08em] normal-case text-zinc-500">Intended feel</p>
                                <p className="mt-2 text-zinc-200 text-sm leading-6 line-clamp-2">
                                  {analysisResult.emotional_analysis.intended_emotion}
                                </p>
                              </div>
                            )}
                            {analysisResult.emotional_analysis?.actual_emotion && (
                              <div>
                                <p className="text-[11px] tracking-[0.08em] normal-case text-zinc-500">Actual feel</p>
                                <p className="mt-2 text-zinc-200 text-sm leading-6 line-clamp-2">
                                  {analysisResult.emotional_analysis.actual_emotion}
                                </p>
                              </div>
                            )}
                            {analysisResult.emotional_analysis?.target_audience && (
                              <div>
                                <p className="text-[11px] tracking-[0.08em] normal-case text-zinc-500">Audience</p>
                                <p className="mt-2 text-zinc-200 text-sm leading-6 line-clamp-2">
                                  {analysisResult.emotional_analysis.target_audience}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {analysisResult.intent_profile && (
                        <div className="rounded-2xl border border-white/6 bg-zinc-950/80 p-5">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-[12px] tracking-[0.08em] normal-case text-zinc-500">Quick intent check</p>
                              <p className="mt-2 text-sm text-zinc-300">
                                We understand your poster. Answer three quick questions to match the best reference style.
                              </p>
                            </div>
                            <div className="text-xs text-zinc-500">
                              Confidence: {analysisResult.intent_profile.confidence ?? 0}%
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 md:grid-cols-3">
                            <div className="space-y-2">
                              <label className="text-xs uppercase tracking-wide text-zinc-500">Goal</label>
                              <select
                                value={intentInputs.goal}
                                onChange={(e) => setIntentInputs((prev) => ({ ...prev, goal: e.target.value }))}
                                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-white focus:outline-none"
                              >
                                <option value="">Select</option>
                                <option value="awareness">Awareness</option>
                                <option value="conversion">Conversion</option>
                                <option value="event">Event</option>
                                <option value="hiring">Hiring</option>
                                <option value="announcement">Announcement</option>
                              </select>
                            </div>

                            <div className="space-y-2">
                              <label className="text-xs uppercase tracking-wide text-zinc-500">CTA</label>
                              <input
                                value={intentInputs.cta}
                                onChange={(e) => setIntentInputs((prev) => ({ ...prev, cta: e.target.value }))}
                                placeholder="Get started / Register / Buy now"
                                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-white focus:outline-none"
                              />
                            </div>

                            <div className="space-y-2">
                              <label className="text-xs uppercase tracking-wide text-zinc-500">Audience</label>
                              <input
                                value={intentInputs.audience}
                                onChange={(e) => setIntentInputs((prev) => ({ ...prev, audience: e.target.value }))}
                                placeholder="Example: marketers, small teams"
                                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-white focus:outline-none"
                              />
                            </div>
                          </div>

                          <div className="mt-4 flex items-center justify-between gap-3">
                            <p className="text-xs text-zinc-500">
                              We use this to choose the closest style reference and mood.
                            </p>
                            <button
                              type="button"
                              onClick={applyIntentInputs}
                              className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${
                                intentSaved
                                  ? "bg-white/15 text-white"
                                  : "bg-white text-black hover:bg-zinc-100"
                              }`}
                            >
                              {intentSaved ? "Saved" : "Apply"}
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="rounded-2xl border border-white/6 bg-zinc-950/80 p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-[12px] tracking-[0.08em] normal-case text-zinc-500">Inspiration notes (optional)</p>
                            <p className="mt-2 text-sm text-zinc-400">
                              Paste a link or describe the vibe. We only use high-level cues (mood, palette, typography).
                            </p>
                          </div>
                          <div className="text-xs text-zinc-500">No copying</div>
                        </div>
                        <textarea
                          value={inspirationNotes}
                          onChange={(e) => setInspirationNotes(e.target.value)}
                          placeholder="Example: https://behance.net/... bold minimal, big headline, black/white + cobalt accent"
                          rows={3}
                          className="mt-4 w-full rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-white focus:outline-none"
                        />
                      </div>

                      <div className="rounded-2xl border border-white/6 bg-zinc-950/80 p-5">
                        <div className="flex items-center justify-between">
                          <p className="text-[12px] tracking-[0.08em] normal-case text-zinc-500">Closest references</p>
                          <p className="text-[12px] tracking-[0.08em] normal-case text-zinc-500">Reference match</p>
                        </div>

                        {analysisResult.reference_matches && analysisResult.reference_matches.length > 0 ? (
                          <div className="mt-4 space-y-3">
                            {analysisResult.reference_matches.map((match) => (
                              <div
                                key={match.id}
                                className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
                              >
                                <div className="flex items-center justify-between">
                                  <p className="text-sm font-semibold text-zinc-100">{match.title}</p>
                                  <span className="text-xs text-zinc-500">Score {match.score}</span>
                                </div>
                                {match.reasons?.length ? (
                                  <p className="mt-2 text-xs text-zinc-400">
                                    {match.reasons.join(" · ")}
                                  </p>
                                ) : null}
                                <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-500">
                                  {match.styles?.length ? (
                                    <span className="rounded-full border border-white/10 px-2 py-0.5">
                                      styles: {match.styles.join(", ")}
                                    </span>
                                  ) : null}
                                  {match.moods?.length ? (
                                    <span className="rounded-full border border-white/10 px-2 py-0.5">
                                      mood: {match.moods.join(", ")}
                                    </span>
                                  ) : null}
                                  {match.layout ? (
                                    <span className="rounded-full border border-white/10 px-2 py-0.5">
                                      layout: {match.layout}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-black/30 p-4 text-sm text-zinc-500">
                            No reference gallery items yet. Add items in `prompts/reference-gallery.json`.
                          </div>
                        )}
                      </div>

                      {analysisResult.steal_from && (
                        <details className="rounded-2xl border border-white/6 bg-zinc-950/80 overflow-hidden">
                          <summary className="cursor-pointer list-none px-5 py-4 text-[12px] tracking-[0.08em] normal-case text-zinc-500 flex items-center justify-between border-b border-white/10">
                            Signal mix
                            <span className="text-xs text-zinc-500">Expand</span>
                          </summary>
                          <div className="divide-y divide-white/10">
                            {analysisResult.steal_from.the_2026_truth && (
                              <div className="grid gap-2 px-5 py-4 sm:grid-cols-[140px,1fr]">
                                <span className="text-[11px] tracking-[0.08em] normal-case text-zinc-500">Truth</span>
                                <p className="text-zinc-200 text-sm leading-relaxed">{analysisResult.steal_from.the_2026_truth}</p>
                              </div>
                            )}
                            <div className="grid gap-2 px-5 py-4 sm:grid-cols-[140px,1fr]">
                              <span className="text-[11px] tracking-[0.08em] normal-case text-zinc-500">Feel</span>
                              <p className="text-zinc-100 text-sm leading-relaxed">{analysisResult.steal_from.feeling_detected || "Unclear"}</p>
                            </div>
                            {analysisResult.steal_from.mix_of_influences?.length ? (
                              <div className="grid gap-2 px-5 py-4 sm:grid-cols-[140px,1fr]">
                                <span className="text-[11px] tracking-[0.08em] normal-case text-zinc-500">Influences</span>
                                <p className="text-zinc-300 text-xs leading-relaxed">
                                  {analysisResult.steal_from.mix_of_influences.join(" / ")}
                                </p>
                              </div>
                            ) : null}
                            {analysisResult.steal_from.techniques_to_steal?.length ? (
                              <div className="grid gap-2 px-5 py-4 sm:grid-cols-[140px,1fr]">
                                <span className="text-[11px] tracking-[0.08em] normal-case text-zinc-500">Techniques</span>
                                <ul className="space-y-2 text-sm text-zinc-200 leading-relaxed">
                                  {analysisResult.steal_from.techniques_to_steal.map((tech, i) => (
                                    <li key={i} className="flex gap-2">
                                      <span className="text-zinc-500">-</span>
                                      <span>{tech}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                          </div>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
            {/* Right Column - Results */}
            <div className="space-y-6">
              {isBusy && busyLabel && (
                <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-100 font-medium">{busyLabel}</span>
                    <span className="text-[#cfeaff]/80">{busyEstimate}</span>
                  </div>
                  <div className="mt-4 h-2 w-full rounded-full bg-white/10">
                    <div className="h-2 w-2/3 rounded-full bg-[#bde7ff]/60 animate-pulse" />
                  </div>
                  <p className="mt-3 text-xs uppercase tracking-[0.2em] text-zinc-500">
                    Keep this tab open while we generate.
                  </p>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                  <p className="text-zinc-400 text-sm text-center">{error}</p>
                  <p className="text-red-300/70 text-xs text-center mt-2">
                    {getErrorHint(error)}
                  </p>
                  {retryCountdown !== null && retryLabel && (
                    <p className="text-amber-200 text-xs text-center mt-2">
                      {retryLabel}: retrying in {retryCountdown}s...
                    </p>
                  )}
                </div>
              )}

              {analysisResult && (
                <>
                  {/* Quick Insights */}
                  <div className="rounded-2xl border border-white/6 bg-zinc-950/80">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                      <h3 className="text-base font-semibold text-white font-[var(--font-display)] tracking-tight">Quick insights</h3>
                      <span className="text-[12px] tracking-[0.08em] normal-case text-zinc-500">Post-analysis</span>
                    </div>
                    <div className="divide-y divide-white/10">
                      <div className="grid gap-2 px-5 py-4 sm:grid-cols-[140px,1fr]">
                        <span className="text-[11px] tracking-[0.08em] normal-case text-[#cfeaff]">Fix first</span>
                        <p className="text-zinc-200 text-[15px] leading-[1.7]">{quickFix}</p>
                      </div>
                      <div className="grid gap-2 px-5 py-4 sm:grid-cols-[140px,1fr]">
                        <span className="text-[11px] tracking-[0.08em] normal-case text-zinc-300">Keep</span>
                        <p className="text-zinc-200 text-[15px] leading-[1.7]">{quickKeep}</p>
                      </div>
                      <div className="grid gap-2 px-5 py-4 sm:grid-cols-[140px,1fr]">
                        <span className="text-[11px] tracking-[0.08em] normal-case text-zinc-300">Remove</span>
                        <p className="text-zinc-200 text-[15px] leading-[1.7]">{quickRemove}</p>
                      </div>
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className="flex gap-2 p-2 bg-zinc-950/70 border border-white/12 rounded-2xl overflow-x-auto backdrop-blur">
                    {[
                      { id: "overview", label: "Overview" },
                      { id: "details", label: "Scores" },
                      { id: "principles", label: "Visions" },
                      { id: "variations", label: `Generate (${generatedImages.length})` },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as typeof activeTab)}
                        className={`flex-1 py-2.5 px-4 rounded-xl font-semibold text-[14px] tracking-[0.04em] transition-all whitespace-nowrap ${
                          activeTab === tab.id
                            ? "bg-[#bde7ff] text-black shadow-[0_12px_30px_-20px_rgba(140,215,255,0.6)]"
                            : "text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Overview Tab */}
                  {activeTab === "overview" && (
                    <div className="space-y-6">
                      {/* Overall Feedback */}
                      <div className="p-6 rounded-2xl bg-zinc-950/70 border border-white/10">
                        <h3 className="text-white font-semibold text-lg mb-3 flex items-center gap-3 font-[var(--font-display)] tracking-tight">
                          <svg className="w-5 h-5 text-[#cfeaff]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Overall verdict
                        </h3>
                        <p className="text-zinc-400 leading-relaxed text-base">
                          {overall.lead && (
                            <span className="text-[#bde7ff] font-semibold">{overall.lead}</span>
                          )}
                          {overall.rest && (
                            <>
                              {" "}
                              <span>{overall.rest}</span>
                            </>
                          )}
                        </p>
                      </div>

                      {/* The Fix */}
                      {analysisResult.feedback.the_fix && (
                        <div className="p-5 rounded-2xl bg-zinc-950/70 border border-white/10">
                          <h4 className="text-zinc-100 font-semibold text-base mb-3 font-[var(--font-display)]">The One Fix</h4>
                          <p className="text-zinc-400 text-base leading-relaxed">{analysisResult.feedback.the_fix}</p>
                        </div>
                      )}

                                        <details className="rounded-2xl border border-white/10 bg-zinc-950/70">
                    <summary className="cursor-pointer list-none px-5 py-4 text-white font-semibold text-base font-[var(--font-display)] tracking-tight flex items-center justify-between">
                      Deep review
                      <span className="text-xs text-zinc-500">Expand</span>
                    </summary>
                    <div className="px-5 pb-6 pt-2 space-y-6">
{/* Style Detection */}
                      {analysisResult.style_detection && (
                        <div className="p-5 rounded-2xl bg-zinc-950/70 border border-white/10">
                          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                            <h4 className="text-zinc-100 font-semibold text-base flex items-center gap-2 font-[var(--font-display)]">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                              </svg>
                              Style Analysis
                            </h4>
                            <div className="flex items-center gap-2">
                              <Badge>{analysisResult.style_detection.primary_style}</Badge>
                              <Badge variant="outline">Apple: {analysisResult.style_detection.apple_compatibility}%</Badge>
                            </div>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2 text-sm">
                            <div className="p-3 bg-white/5 rounded-xl">
                              <span className="text-zinc-500 uppercase tracking-[0.2em] text-[11px]">Trying to be</span>
                              <div className="text-zinc-400 mt-2 leading-relaxed">{analysisResult.style_detection.what_its_trying_to_be}</div>
                            </div>
                            <div className="p-3 bg-white/5 rounded-xl">
                              <span className="text-zinc-500 uppercase tracking-[0.2em] text-[11px]">Actually is</span>
                              <div className="text-zinc-400 mt-2 leading-relaxed">{analysisResult.style_detection.what_it_actually_is}</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Emotional Analysis */}
                      {analysisResult.emotional_analysis && (
                        <div className="p-5 rounded-2xl bg-zinc-950/70 border border-white/10">
                          <h4 className="text-zinc-100 font-semibold text-base mb-4 flex items-center gap-2 font-[var(--font-display)]">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                            </svg>
                            Does it have soul?
                          </h4>
                          <div className="grid gap-3 sm:grid-cols-2 text-sm">
                            <div className="rounded-xl bg-white/5 p-3">
                              <span className="text-zinc-500 uppercase tracking-[0.2em] text-[11px]">Intended</span>
                              <div className="text-zinc-100 mt-2 text-base">{analysisResult.emotional_analysis.intended_emotion}</div>
                            </div>
                            <div className="rounded-xl bg-white/5 p-3">
                              <span className="text-zinc-500 uppercase tracking-[0.2em] text-[11px]">Actual</span>
                              <div className="text-zinc-400 mt-2 text-base">{analysisResult.emotional_analysis.actual_emotion}</div>
                            </div>
                            <div className="sm:col-span-2 rounded-xl bg-white/5 p-3">
                              <span className="text-zinc-500 uppercase tracking-[0.2em] text-[11px]">Emotional impact</span>
                              <div className={`mt-2 text-base ${analysisResult.emotional_analysis.makes_you_feel_something ? 'text-[#cfeaff]' : 'text-zinc-400'}`}>
                                {analysisResult.emotional_analysis.makes_you_feel_something ? 'Yes' : 'No'}
                              </div>
                            </div>
                            {analysisResult.emotional_analysis.soul_elements?.length > 0 && (
                              <div className="sm:col-span-2">
                                <span className="text-zinc-500 uppercase tracking-[0.2em] text-[11px]">Soul elements</span>
                                <div className="flex flex-wrap gap-2 mt-3">
                                  {analysisResult.emotional_analysis.soul_elements.map((el, i) => (
                                    <Badge key={i} variant="secondary">{el}</Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* The Gap */}
                      {analysisResult.the_gap && (
                        <div className="p-5 rounded-2xl bg-zinc-950/70 border border-white/10">
                          <h4 className="text-zinc-100 font-semibold text-base mb-4 flex items-center gap-2 font-[var(--font-display)]">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            The Gap
                          </h4>
                          <p className="text-zinc-400 text-base leading-relaxed mb-4">{analysisResult.the_gap}</p>

                          {analysisResult.what_must_go && analysisResult.what_must_go.length > 0 && (
                            <div className="mb-4">
                              <span className="text-zinc-500 uppercase tracking-[0.2em] text-[11px] font-medium">Must go</span>
                              <div className="flex flex-wrap gap-2 mt-3">
                                {analysisResult.what_must_go.map((item, i) => (
                                  <Badge key={i} variant="secondary">{item}</Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {analysisResult.what_must_change && analysisResult.what_must_change.length > 0 && (
                            <div>
                              <span className="text-zinc-500 uppercase tracking-[0.2em] text-[11px] font-medium">Must change</span>
                              <div className="flex flex-wrap gap-2 mt-3">
                                {analysisResult.what_must_change.map((item, i) => (
                                  <Badge key={i} variant="secondary">{item}</Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Color Analysis */}
                      {analysisResult.color_analysis && (
                        <div className="p-5 rounded-2xl bg-zinc-950/70 border border-white/10">
                          <h4 className="text-zinc-100 font-semibold text-base mb-4 flex items-center gap-2 font-[var(--font-display)]">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                            </svg>
                            Color Palette
                            <span className={`ml-2 text-[11px] tracking-[0.08em] normal-case ${analysisResult.color_analysis.palette_works ? 'text-[#cfeaff]' : 'text-zinc-500'}`}>
                              {analysisResult.color_analysis.palette_works ? 'OK' : 'Needs work'}
                            </span>
                          </h4>
                          <div className="space-y-4">
                            <div className="flex flex-wrap items-center gap-4">
                              <div>
                                <span className="text-zinc-500 text-[11px] uppercase tracking-[0.2em]">Current</span>
                                <div className="flex gap-2 mt-2">
                                  {analysisResult.color_analysis.current_palette?.map((color, i) => (
                                    <div key={i} className="w-6 h-6 rounded border border-zinc-600" style={{ backgroundColor: color }} title={color} />
                                  ))}
                                </div>
                              </div>
                              <div className="text-zinc-500 text-sm">-&gt;</div>
                              <div>
                                <span className="text-zinc-500 text-[11px] uppercase tracking-[0.2em]">Suggested</span>
                                <div className="flex gap-2 mt-2">
                                  {analysisResult.color_analysis.suggested_palette?.map((color, i) => (
                                    <div key={i} className="w-6 h-6 rounded border border-white/30" style={{ backgroundColor: color }} title={color} />
                                  ))}
                                </div>
                              </div>
                            </div>
                            <p className="text-zinc-400 text-sm leading-relaxed">{analysisResult.color_analysis.reasoning}</p>
                          </div>
                        </div>
                      )}

                      {/* The Good & The Bad */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-5 rounded-2xl bg-zinc-950/70 border border-white/10">
                          <h4 className="text-zinc-100 font-semibold text-base mb-4 flex items-center gap-2 font-[var(--font-display)]">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            The Good
                          </h4>
                          <ul className="space-y-3">
                            {analysisResult.feedback.the_good?.map((s, i) => (
                              <li key={i} className="text-zinc-400 text-sm flex items-start gap-3 leading-relaxed">
                                <span className="text-zinc-500 mt-1">-</span>
                                {s}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="p-5 rounded-2xl bg-zinc-950/70 border border-white/10">
                          <h4 className="text-zinc-100 font-semibold text-base mb-4 flex items-center gap-2 font-[var(--font-display)]">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            The Bad
                          </h4>
                          <ul className="space-y-3">
                            {analysisResult.feedback.the_bad?.map((s, i) => (
                              <li key={i} className="text-zinc-400 text-sm flex items-start gap-3 leading-relaxed">
                                <span className="text-zinc-500 mt-1">-</span>
                                {s}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      {/* What Must Stay */}
                      {analysisResult.what_must_stay && analysisResult.what_must_stay.length > 0 && (
                        <div className="p-5 rounded-2xl bg-zinc-950/70 border border-white/10">
                          <h4 className="text-zinc-100 font-semibold text-base mb-4 flex items-center gap-2 font-[var(--font-display)]">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Must Stay (Don&apos;t Touch)
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {analysisResult.what_must_stay.map((item, i) => (
                              <Badge key={i} variant="secondary">{item}</Badge>
                            ))}
                          </div>
                        </div>
                      )}

                                          </div>
                  </details>

{/* Aspect Ratio Selector */}
                      <div className="p-5 rounded-2xl bg-zinc-950/70 border border-white/10">
                        <h4 className="text-zinc-400 text-[11px] tracking-[0.08em] normal-case font-medium mb-4">Image size</h4>
                        <div className="flex flex-wrap gap-2">
                          {ASPECT_RATIOS.map((ratio) => (
                            <button
                              key={ratio.value}
                              onClick={() => setAspectRatio(ratio.value)}
                              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                                aspectRatio === ratio.value
                                  ? "bg-white text-black"
                                  : "bg-zinc-900 text-zinc-500 hover:bg-zinc-800"
                              }`}
                            >
                              <span className="text-lg">{ratio.icon}</span>
                              {ratio.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Details Tab - Steve's Category Scores */}
                  {activeTab === "details" && analysisResult.category_scores && (
                    <div className="space-y-6">
                      {Object.entries(analysisResult.category_scores).map(([category, data]) => (
                        <CategoryScoreCard
                          key={category}
                          category={category}
                          score={data.score}
                          feedback={data.feedback}
                        />
                      ))}

                      {/* Detected Elements */}
                      <div className="p-5 rounded-2xl bg-zinc-950/70 border border-white/10">
                        <h4 className="text-zinc-100 font-semibold text-base mb-4 font-[var(--font-display)]">Poster elements</h4>
                        <div className="space-y-3 text-sm">
                          {analysisResult.elements.headline && (
                            <div>
                              <span className="text-zinc-500 uppercase tracking-[0.2em] text-[11px]">Headline</span>
                              <div className="text-zinc-100 mt-2 text-base font-medium leading-relaxed">&ldquo;{analysisResult.elements.headline}&rdquo;</div>
                            </div>
                          )}
                          {analysisResult.elements.subheadline && (
                            <div>
                              <span className="text-zinc-500 uppercase tracking-[0.2em] text-[11px]">Subheadline</span>
                              <div className="text-zinc-200 mt-2 text-base leading-relaxed">&ldquo;{analysisResult.elements.subheadline}&rdquo;</div>
                            </div>
                          )}
                          <div>
                            <span className="text-zinc-500 uppercase tracking-[0.2em] text-[11px]">Purpose</span>
                            <div className="text-zinc-200 mt-2 text-base leading-relaxed">{analysisResult.elements.purpose}</div>
                          </div>
                          {analysisResult.elements.visual_elements && analysisResult.elements.visual_elements.length > 0 && (
                            <div>
                              <span className="text-zinc-500 uppercase tracking-[0.2em] text-[11px]">Visual elements</span>
                              <div className="flex flex-wrap gap-2 mt-3">
                                {analysisResult.elements.visual_elements.map((el, i) => (
                                  <span key={i} className="px-3 py-1 bg-white/5 text-zinc-200 rounded-full text-xs uppercase tracking-[0.2em]">{el}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Would Steve Ship This */}
                      <div className={`p-5 rounded-2xl border ${analysisResult.would_steve_ship_this ? 'bg-[#bde7ff]/10 border-[#bde7ff]/30' : 'bg-white/5 border-white/10'}`}>
                        <h4 className="font-semibold text-base mb-3 text-zinc-100 font-[var(--font-display)]">
                          Would Steve Ship This?
                        </h4>
                        <p className={`text-2xl mb-2 ${analysisResult.would_steve_ship_this ? 'text-[#cfeaff]' : 'text-zinc-300'}`}>
                          {analysisResult.would_steve_ship_this ? 'Yes' : 'No'}
                        </p>
                        {analysisResult.what_would_make_steve_ship_this && !analysisResult.would_steve_ship_this && (
                          <p className="text-zinc-400 text-sm leading-relaxed">{analysisResult.what_would_make_steve_ship_this}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Steve's Visions Tab */}
                  {activeTab === "principles" && (
                    <div className="space-y-6">
                      <h3 className="text-white font-semibold text-lg font-[var(--font-display)] tracking-tight">Steve&apos;s 4 Visions</h3>
                      {analysisResult.variations && analysisResult.variations.length > 0 ? (
                        analysisResult.variations.map((variation, i) => (
                          <div
                            key={i}
                            className="p-5 rounded-2xl bg-zinc-950/70 border border-white/10"
                          >
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-white font-semibold text-base">{variation.name}</h4>
                              <span className="text-[11px] tracking-[0.08em] normal-case px-3 py-1 bg-white/5 text-zinc-200 rounded-full">
                                {variation.stolen_from}
                              </span>
                            </div>
                            {variation.what_it_fixes && (
                              <div className="mb-2">
                                <span className="text-zinc-500 text-[11px] uppercase tracking-[0.2em] font-medium">Fixes</span>
                                <div className="text-zinc-200 text-sm mt-2 leading-relaxed">{variation.what_it_fixes}</div>
                              </div>
                            )}
                            {variation.the_feeling && (
                              <p className="text-zinc-200 text-sm italic border-l-2 border-white/20 pl-4 leading-relaxed">
                                {variation.the_feeling}
                              </p>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="p-8 rounded-2xl bg-zinc-900/50 border border-zinc-800 text-center">
                          <p className="text-zinc-400">No variations available</p>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Variations Tab */}
                  {activeTab === "variations" && (
                    <div className="space-y-6">
{/* TWO GENERATION BUTTONS */}
                      <div className="space-y-3">
                        <div className="grid gap-3 md:grid-cols-2">
                          <button
                            onClick={() => handleGenerateVariations("artistic")}
                            disabled={isGenerating}
                          className={`
                              group relative w-full rounded-2xl p-5 text-left transition-all duration-300 border shadow-lg
                              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900
                              ${
                                !isGenerating
                                  ? "bg-white text-black border-white/20 hover:bg-zinc-100 hover:-translate-y-0.5"
                                  : "bg-zinc-900/60 border-zinc-800 text-zinc-500 cursor-not-allowed"
                              }
                            `}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">🎨</span>
                              <div className="font-semibold text-base">
                                Enhance artistic style
                              </div>
                            </div>
                            <p className="mt-2 text-sm opacity-70">
                              Keep the current structure, add painterly flavors like watercolor or pencil.
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs opacity-70">
                              <span className="rounded-full border border-current bg-black/5 px-2 py-0.5">Mood</span>
                              <span className="rounded-full border border-current bg-black/5 px-2 py-0.5">Texture</span>
                              <span className="rounded-full border border-current bg-black/5 px-2 py-0.5">Soft Light</span>
                            </div>
                            {!isGenerating && (
                              <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-black/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
                                Generate
                                <span className="text-sm">-&gt;</span>
                              </div>
                            )}
                            {isGenerating && generationMode === "artistic" && (
                              <div className="mt-4 flex items-center gap-2 text-sm text-black">
                                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Generating artistic variations...
                              </div>
                            )}
                          </button>

                          <button
                            onClick={() => handleGenerateVariations("redesign")}
                            disabled={isGenerating}
                          className={`
                              group relative w-full rounded-2xl p-5 text-left transition-all duration-300 border shadow-lg
                              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900
                              ${
                                !isGenerating
                                  ? "bg-zinc-900 text-white border-white/10 hover:bg-zinc-800 hover:-translate-y-0.5"
                                  : "bg-zinc-900/60 border-zinc-800 text-zinc-500 cursor-not-allowed"
                              }
                            `}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">🔧</span>
                              <div className="font-semibold text-base text-white">
                                Full redesign
                              </div>
                            </div>
                            <p className="mt-2 text-sm text-white/80">
                              Rebuild layout, hierarchy, and typography for a cleaner poster.
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/80">
                              <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5">Grid</span>
                              <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5">White Space</span>
                              <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5">Hierarchy</span>
                            </div>
                            <div className="mt-2 text-xs text-white/80">
                              Preset: <span className="font-semibold">{REDESIGN_PRESET_LABELS[redesignPreset]}</span>
                            </div>
                            {!isGenerating && (
                              <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
                                Generate
                                <span className="text-sm">-&gt;</span>
                              </div>
                            )}
                            {isGenerating && generationMode === "redesign" && (
                              <div className="mt-4 flex items-center gap-2 text-sm text-white">
                                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Redesigning...
                              </div>
                            )}
                          </button>
                        </div>

                        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-medium text-zinc-500">Artistic settings</div>
                            <div className="text-xs text-zinc-500">For artistic upgrades</div>
                          </div>

                          <div className="mt-4">
                            <div className="text-xs uppercase tracking-wide text-zinc-500">Gradient presets</div>
                            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                              {GRADIENT_PRESETS.map((preset) => (
                                <button
                                  key={preset.value}
                                  type="button"
                                  disabled={isGenerating}
                                  onClick={() => setGradientPreset(preset.value)}
                                  className={`rounded-xl border px-3 py-2 text-left transition-all ${
                                    gradientPreset === preset.value
                                      ? "bg-white text-zinc-900 border-white shadow"
                                      : "bg-zinc-800/60 text-zinc-400 border-zinc-700 hover:bg-zinc-700/70"
                                  } ${isGenerating ? "opacity-60 cursor-not-allowed" : ""}`}
                                >
                                  <div className="text-sm font-semibold">{preset.label}</div>
                                  <p className={`mt-1 text-xs ${gradientPreset === preset.value ? "text-zinc-600" : "text-zinc-500"}`}>
                                    {preset.description}
                                  </p>
                                </button>
                              ))}
                            </div>
                          </div>

                        <div className="mt-3 grid gap-3 md:grid-cols-3">
                          <div>
                            <div className="text-xs uppercase tracking-wide text-zinc-500">Intensity</div>
                              <div className="mt-2 grid grid-cols-3 gap-2">
                                {[
                                  { value: "subtle", label: "Subtle" },
                                  { value: "balanced", label: "Balanced" },
                                  { value: "extreme", label: "Extreme" },
                                ].map((opt) => (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    disabled={isGenerating}
                                    onClick={() => setArtisticIntensity(opt.value as typeof artisticIntensity)}
                                    className={`rounded-lg border px-2 py-1 text-xs transition-all ${
                                      artisticIntensity === opt.value
                                        ? "bg-white text-zinc-900 border-white"
                                        : "bg-zinc-800/60 text-zinc-400 border-zinc-700 hover:bg-zinc-700/70"
                                    } ${isGenerating ? "opacity-60 cursor-not-allowed" : ""}`}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div>
                              <div className="text-xs uppercase tracking-wide text-zinc-500">Text safety</div>
                              <div className="mt-2 grid grid-cols-2 gap-2">
                                {[
                                  { value: "strict", label: "Lock layout" },
                                  { value: "creative", label: "Creative layout" },
                                ].map((opt) => (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    disabled={isGenerating}
                                    onClick={() => setArtisticTextSafety(opt.value as typeof artisticTextSafety)}
                                    className={`rounded-lg border px-2 py-1 text-xs transition-all ${
                                      artisticTextSafety === opt.value
                                        ? "bg-white text-zinc-900 border-white"
                                        : "bg-zinc-800/60 text-zinc-400 border-zinc-700 hover:bg-zinc-700/70"
                                    } ${isGenerating ? "opacity-60 cursor-not-allowed" : ""}`}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div>
                              <div className="text-xs uppercase tracking-wide text-zinc-500">Color</div>
                              <div className="mt-2 grid grid-cols-2 gap-2">
                                {[
                                  { value: "preserve", label: "Keep palette" },
                                  { value: "explore", label: "Explore new" },
                                ].map((opt) => (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    disabled={isGenerating}
                                    onClick={() => setArtisticColorFidelity(opt.value as typeof artisticColorFidelity)}
                                    className={`rounded-lg border px-2 py-1 text-xs transition-all ${
                                      artisticColorFidelity === opt.value
                                        ? "bg-white text-zinc-900 border-white"
                                        : "bg-zinc-800/60 text-zinc-400 border-zinc-700 hover:bg-zinc-700/70"
                                    } ${isGenerating ? "opacity-60 cursor-not-allowed" : ""}`}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
                            <div className="text-xs text-zinc-500">
                              {selectionActive
                                ? `Selected styles: ${selectedArtisticStyles.length}`
                                : `Extra styles: ${defaultArtisticCount} total`}
                            </div>
                            <div className="flex items-center gap-2">
                              {selectionActive && (
                                <button
                                  type="button"
                                  disabled={isGenerating}
                                  onClick={clearArtisticStyles}
                                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                                    isGenerating
                                      ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                                      : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                                  }`}
                                >
                                  Clear
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={isGenerating || selectionActive}
                                onClick={() => setArtisticExtra((prev) => !prev)}
                                className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                                  artisticExtra
                                    ? "bg-white text-black"
                                    : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700"
                                } ${isGenerating || selectionActive ? "opacity-60 cursor-not-allowed" : ""}`}
                              >
                                {artisticExtra ? "Extra ON" : "Extra OFF"}
                              </button>
                            </div>
                          </div>

                          <div className="mt-3 text-xs text-zinc-500">
                            Select styles to generate only those. Leave empty to use the default set.
                          </div>

                          <div className="mt-4 grid gap-2 md:grid-cols-2">
                            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                              <div className="text-xs uppercase tracking-wide text-zinc-500">Recommended</div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {ARTISTIC_STYLE_GROUPS.recommended.map((style) => {
                                  const key = style.key as ArtisticStyleKey;
                                  const active = selectedArtisticStyles.includes(key);
                                  return (
                                    <button
                                      key={style.key}
                                      type="button"
                                      disabled={isGenerating}
                                      onClick={() => toggleArtisticStyle(key)}
                                      className={`rounded-full border px-2 py-1 text-xs transition-all ${
                                        active
                                          ? "bg-white text-black border-white"
                                          : "bg-zinc-800/60 text-zinc-400 border-zinc-700 hover:bg-zinc-700/70"
                                      } ${isGenerating ? "opacity-60 cursor-not-allowed" : ""}`}
                                    >
                                      <span className="mr-1 text-[10px] font-semibold">{style.icon}</span>
                                      {style.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                              <div className="text-xs uppercase tracking-wide text-zinc-500">More styles</div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {ARTISTIC_STYLE_GROUPS.more.map((style) => {
                                  const key = style.key as ArtisticStyleKey;
                                  const active = selectedArtisticStyles.includes(key);
                                  return (
                                    <button
                                      key={style.key}
                                      type="button"
                                      disabled={isGenerating}
                                      onClick={() => toggleArtisticStyle(key)}
                                      className={`rounded-full border px-2 py-1 text-xs transition-all ${
                                        active
                                          ? "bg-white text-black border-white"
                                          : "bg-zinc-800/60 text-zinc-400 border-zinc-700 hover:bg-zinc-700/70"
                                      } ${isGenerating ? "opacity-60 cursor-not-allowed" : ""}`}
                                    >
                                      <span className="mr-1 text-[10px] font-semibold">{style.icon}</span>
                                      {style.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                            <div className="text-xs uppercase tracking-wide text-zinc-500">Trending</div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {ARTISTIC_STYLE_GROUPS.trending.map((style) => {
                                const key = style.key as ArtisticStyleKey;
                                const active = selectedArtisticStyles.includes(key);
                                return (
                                  <button
                                    key={style.key}
                                    type="button"
                                    disabled={isGenerating}
                                    onClick={() => toggleArtisticStyle(key)}
                                    className={`rounded-full border px-2 py-1 text-xs transition-all ${
                                      active
                                        ? "bg-white text-black border-white"
                                        : "bg-zinc-800/60 text-zinc-400 border-zinc-700 hover:bg-zinc-700/70"
                                    } ${isGenerating ? "opacity-60 cursor-not-allowed" : ""}`}
                                  >
                                    <span className="mr-1 text-[10px] font-semibold">{style.icon}</span>
                                    {style.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-medium text-zinc-500">Poster Improve presets</div>
                            <div className="flex items-center gap-2 text-xs text-zinc-500">
                              <span>Use for redesign</span>
                              <span className="rounded-full bg-[#bde7ff]/15 px-2 py-0.5 text-[#e8f7ff]">
                                Selected: {REDESIGN_PRESET_LABELS[redesignPreset]}
                              </span>
                            </div>
                          </div>

                          <div className="mt-3">
                            <div className="text-xs uppercase tracking-wide text-zinc-500">Recommended</div>
                            <div className="mt-2 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                              {REDESIGN_PRESET_GROUPS.recommended.map((preset) => (
                                <button
                                  key={preset.value}
                                  type="button"
                                  disabled={isGenerating}
                                  onClick={() => setRedesignPreset(preset.value)}
                                  className={`rounded-xl border px-3 py-2 text-left transition-all ${
                                    redesignPreset === preset.value
                                      ? "bg-white text-zinc-900 border-white shadow"
                                      : "bg-zinc-800/60 text-zinc-400 border-zinc-700 hover:bg-zinc-700/70"
                                  } ${isGenerating ? "opacity-60 cursor-not-allowed" : ""}`}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="text-base">{preset.icon}</span>
                                    <span className="font-medium text-sm">{preset.label}</span>
                                  </div>
                                  <p className={`mt-1 text-xs ${redesignPreset === preset.value ? "text-zinc-700" : "text-zinc-400"}`}>
                                    {preset.description}
                                  </p>
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="mt-4">
                            <div className="text-xs uppercase tracking-wide text-zinc-500">More styles</div>
                            <div className="mt-2 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                              {REDESIGN_PRESET_GROUPS.more.map((preset) => (
                                <button
                                  key={preset.value}
                                  type="button"
                                  disabled={isGenerating}
                                  onClick={() => setRedesignPreset(preset.value)}
                                  className={`rounded-xl border px-3 py-2 text-left transition-all ${
                                    redesignPreset === preset.value
                                      ? "bg-white text-zinc-900 border-white shadow"
                                      : "bg-zinc-800/60 text-zinc-400 border-zinc-700 hover:bg-zinc-700/70"
                                  } ${isGenerating ? "opacity-60 cursor-not-allowed" : ""}`}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="text-base">{preset.icon}</span>
                                    <span className="font-medium text-sm">{preset.label}</span>
                                  </div>
                                  <p className={`mt-1 text-xs ${redesignPreset === preset.value ? "text-zinc-700" : "text-zinc-400"}`}>
                                    {preset.description}
                                  </p>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        <p className="text-zinc-500 text-xs text-center">
                          PS = Preserve style and enhance | RD = Rebuild the design
                        </p>
                      </div>

                      {generatedImages.length === 0 ? (
                        <div className="p-8 rounded-2xl bg-zinc-900/50 border border-zinc-800 text-center">
                          <svg className="w-16 h-16 text-zinc-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <p className="text-zinc-400 mb-4">
                            To create an improved version, use the button in the &quot;Overview&quot; tab.
                          </p>
                          <button
                            onClick={() => setActiveTab("overview")}
                            className="text-zinc-200 hover:text-white text-[11px] tracking-[0.08em] normal-case"
                          >
                            Go to Overview
                          </button>
                        </div>
                      ) : (
                        <>
                          <p className="text-zinc-400 text-xs text-center mb-3">
                            Generated images received: {generatedImages.length}
                          </p>

                          {/* Variation Grid */}
                          <div className="grid grid-cols-2 gap-3">
                            {generatedImages.map((genImg, idx) => (
                              <button
                                key={idx}
                                onClick={() => {
                                  setSelectedVariation(idx);
                                  setCompareValue(50);
                                  sendFeedback({
                                    action: "select",
                                    variationId: generatedImages[idx]?.variationId,
                                    index: idx,
                                  });
                                }}
                                className={`relative aspect-[3/4] rounded-xl overflow-hidden border-2 transition-all ${
                                  selectedVariation === idx
                                    ? "border-[#bde7ff] ring-2 ring-[#bde7ff]/40"
                                    : "border-zinc-700 hover:border-zinc-500"
                                }`}
                              >
                                {bestVariationIndex === idx && (
                                  <div className="absolute left-2 top-2 z-10 rounded-full bg-[#bde7ff] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-black shadow">
                                    Best pick
                                  </div>
                                )}
                                  <img
                                  src={normalizeImageData(genImg.imageData)}
                                  alt={genImg.name || `Variation ${idx + 1}`}
                                  className="absolute inset-0 h-full w-full object-cover"
                                />
                                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                                  <p className="text-white text-xs font-medium">
                                    {genImg.name || `Variation ${idx + 1}`}
                                  </p>
                                </div>
                              </button>
                            ))}
                          </div>

                          {/* Selected Variation Details */}
                          {selectedVariation !== null && generatedImages[selectedVariation] && (
                            <div className="p-5 rounded-2xl bg-zinc-950/70 border border-white/10 space-y-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <h3 className="text-white font-semibold">
                                    {generatedImages[selectedVariation].name || `Variation ${selectedVariation + 1}`}
                                  </h3>
                                  {selectedVariation === bestVariationIndex && (
                                    <span className="mt-1 inline-flex rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-zinc-200">
                                      Best pick
                                    </span>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleDownload(
                                      generatedImages[selectedVariation].imageData,
                                      selectedVariation
                                    )}
                                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    Download
                                  </button>
                                </div>
                              </div>

                              {image && (
                                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                                  <div className="flex items-center justify-between text-xs text-zinc-400">
                                    <span>Before / After</span>
                                    <span>{compareValue}% improved</span>
                                  </div>
                                  <div className="relative mt-3 aspect-[3/4] w-full overflow-hidden rounded-lg border border-zinc-800 bg-black/70">
                                    <img
                                      src={image}
                                      alt="Original poster"
                                      className="absolute inset-0 h-full w-full object-cover"
                                    />
                                    <div
                                      className="absolute inset-0 overflow-hidden transition-[clip-path] duration-150 ease-out"
                                      style={{ clipPath: `inset(0 ${100 - compareValue}% 0 0)` }}
                                    >
                                    <img
                                      src={normalizeImageData(generatedImages[selectedVariation].imageData)}
                                        alt="Improved poster"
                                        className="absolute inset-0 h-full w-full object-cover"
                                      />
                                    </div>
                                    <div
                                      className="absolute top-0 h-full w-1 bg-emerald-400/90 shadow transition-[left] duration-150 ease-out"
                                      style={{ left: `calc(${compareValue}% - 2px)` }}
                                    />
                                    <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[10px] uppercase text-white">
                                      Before
                                    </span>
                                    <span className="absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[10px] uppercase text-white">
                                      After
                                    </span>
                                  </div>
                                  <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    value={compareValue}
                                    onChange={(e) => setCompareValue(Number(e.target.value))}
                                    className="mt-3 w-full accent-emerald-400"
                                  />
                                </div>
                              )}

                              {/* Prompt Display */}
                              <div className="border-t border-zinc-700 pt-4">
                                <h4 className="text-zinc-400 text-xs font-medium mb-2">Prompt:</h4>
                                <p className="text-zinc-500 text-xs bg-zinc-800/50 rounded-lg p-2 max-h-20 overflow-y-auto">
                                  {generatedImages[selectedVariation].prompt?.slice(0, 200)}...
                                </p>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Features - show when no analysis */}
              {!analysisResult && !error && (
                <div className="grid grid-cols-1 gap-4">
                  <div className="p-5 rounded-2xl bg-zinc-950/70 border border-white/10">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                        <svg className="w-6 h-6 text-zinc-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="text-white font-medium mb-1">Professional review</h4>
                        <p className="text-zinc-500 text-sm">
                          Reviewed using Gestalt, color theory, typography, and layout principles.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-5 rounded-2xl bg-zinc-950/70 border border-white/10">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                        <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="text-white font-medium mb-1">Scores by category</h4>
                        <p className="text-zinc-500 text-sm">
                          Detailed scores and notes across five categories.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-5 rounded-2xl bg-zinc-950/70 border border-white/10">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-pink-500/20 flex items-center justify-center flex-shrink-0">
                        <svg className="w-6 h-6 text-zinc-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="text-white font-medium mb-1">Learning highlights</h4>
                        <p className="text-zinc-500 text-sm">
                          Explains what principles were used or violated.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 px-6 py-4">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-zinc-500 text-sm">
            &copy; 2025 Reko. Uses the Design Principles Database.
          </p>
        </div>
      </footer>

      {/* Sketch Input Modal */}
      {showSketchModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-2xl border border-zinc-700 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="p-6 border-b border-zinc-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                    <span className="text-2xl">✏️</span>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Sketch detected!</h2>
                    <p className="text-zinc-400 text-sm">Choose the text and style.</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowSketchModal(false)}
                  className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  <svg className="w-6 h-6 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Sketch Layout Preview */}
            {analysisResult?.sketch_layout && (
              <div className="p-4 mx-6 mt-4 rounded-xl bg-zinc-800/50 border border-zinc-700">
                <h3 className="text-sm font-medium text-zinc-400 mb-2">Detected layout:</h3>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="p-2 rounded bg-zinc-900">
                    <span className="text-zinc-200">Header:</span>
                    <p className="text-zinc-300 truncate">{analysisResult.sketch_layout.header_area}</p>
                  </div>
                  <div className="p-2 rounded bg-zinc-900">
                    <span className="text-zinc-200">Main:</span>
                    <p className="text-zinc-300 truncate">{analysisResult.sketch_layout.main_area}</p>
                  </div>
                  <div className="p-2 rounded bg-zinc-900">
                    <span className="text-zinc-200">Footer:</span>
                    <p className="text-zinc-300 truncate">{analysisResult.sketch_layout.footer_area}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Text Inputs */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <span>Text</span> Enter text
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-zinc-400 mb-1">Headline *</label>
                    <input
                      type="text"
                      value={sketchInputs.headline}
                      onChange={(e) => setSketchInputs(prev => ({ ...prev, headline: e.target.value }))}
                      placeholder="Example: MEGA SALE"
                      className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-zinc-400 mb-1">Subheadline</label>
                    <input
                      type="text"
                      value={sketchInputs.subheadline}
                      onChange={(e) => setSketchInputs(prev => ({ ...prev, subheadline: e.target.value }))}
                      placeholder="Example: On all products"
                      className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-zinc-400 mb-1">Price / Discount</label>
                    <input
                      type="text"
                      value={sketchInputs.price}
                      onChange={(e) => setSketchInputs(prev => ({ ...prev, price: e.target.value }))}
                      placeholder="Example: 50% OFF or $99"
                      className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-zinc-400 mb-1">CTA / Button</label>
                    <input
                      type="text"
                      value={sketchInputs.cta}
                      onChange={(e) => setSketchInputs(prev => ({ ...prev, cta: e.target.value }))}
                      placeholder="Example: Shop Now"
                      className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-zinc-400 mb-1">Brand name</label>
                    <input
                      type="text"
                      value={sketchInputs.brand}
                      onChange={(e) => setSketchInputs(prev => ({ ...prev, brand: e.target.value }))}
                      placeholder="Example: MyShop"
                      className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-zinc-400 mb-1">Extra text</label>
                    <input
                      type="text"
                      value={sketchInputs.additionalText}
                      onChange={(e) => setSketchInputs(prev => ({ ...prev, additionalText: e.target.value }))}
                      placeholder="Example: This week only"
                      className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Category Selection */}
              <div>
                <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-3">
                  <span>-</span> Poster type
                </h3>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: "product", label: "- Product", desc: "Commerce, pricing" },
                    { value: "event", label: "Event", desc: "Date, location" },
                    { value: "sale", label: "Sale", desc: "Sale, discount" },
                    { value: "announcement", label: "Announcement", desc: "Information" },
                    { value: "social", label: "📱 Social", desc: "Instagram, FB" },
                  ].map((cat) => (
                    <button
                      key={cat.value}
                      onClick={() => setSketchCategory(cat.value as typeof sketchCategory)}
                      className={`px-4 py-2 rounded-xl border transition-all ${
                        sketchCategory === cat.value
                          ? "bg-amber-500/20 border-amber-500 text-zinc-200"
                          : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-600"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Style Selection */}
              <div>
                <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-3">
                  <span>Style</span> Design style
                </h3>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { value: "minimal", label: "Minimal", color: "from-gray-400 to-gray-600" },
                    { value: "bold", label: "Bold", color: "from-red-400 to-red-600" },
                    { value: "playful", label: "Playful", color: "from-pink-400 to-purple-500" },
                    { value: "premium", label: "Premium", color: "from-amber-400 to-yellow-600" },
                    { value: "dark", label: "Dark", color: "from-zinc-600 to-zinc-900" },
                  ].map((style) => (
                    <button
                      key={style.value}
                      onClick={() => setSketchStyle(style.value as typeof sketchStyle)}
                      className={`p-3 rounded-xl border transition-all ${
                        sketchStyle === style.value
                          ? "border-amber-500 ring-2 ring-amber-500/30"
                          : "border-zinc-700 hover:border-zinc-600"
                      }`}
                    >
                      <div className={`w-full h-8 rounded-lg bg-gradient-to-br ${style.color} mb-2`} />
                      <span className="text-sm text-zinc-300">{style.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-zinc-700 flex justify-between items-center">
              <button
                onClick={() => setShowSketchModal(false)}
                className="px-6 py-3 rounded-xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateFromSketch}
                disabled={!sketchInputs.headline.trim() || isGeneratingFromSketch}
                className="px-8 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold hover:from-amber-600 hover:to-orange-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isGeneratingFromSketch ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Generating design...
                  </>
                ) : (
                  <>
                    <span>✨</span>
                    Generate design
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product-to-Poster Modal */}
      {showProductModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-2xl border border-zinc-700 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="p-6 border-b border-zinc-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
                    <span className="text-2xl">📦</span>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Product detected!</h2>
                    <p className="text-zinc-400 text-sm">Enter the details needed to generate a poster.</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowProductModal(false)}
                  className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  <svg className="w-6 h-6 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Product Info Preview */}
            {analysisResult?.product_info && (
              <div className="p-4 mx-6 mt-4 rounded-xl bg-zinc-800/50 border border-zinc-700">
                <h3 className="text-sm font-medium text-zinc-400 mb-2">Detected info:</h3>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="p-2 rounded bg-zinc-900">
                    <span className="text-zinc-200">Type:</span>
                    <p className="text-zinc-300">{analysisResult.product_info.product_type}</p>
                  </div>
                  <div className="p-2 rounded bg-zinc-900">
                    <span className="text-zinc-200">Audience:</span>
                    <p className="text-zinc-300">{analysisResult.product_info.target_demographic.age_range} / {analysisResult.product_info.target_demographic.gender}</p>
                  </div>
                  <div className="p-2 rounded bg-zinc-900">
                    <span className="text-zinc-200">Style:</span>
                    <p className="text-zinc-300">{analysisResult.product_info.target_demographic.lifestyle}</p>
                  </div>
                </div>
                {/* Suggested Headlines */}
                {analysisResult.product_info.suggested_headlines?.length > 0 && (
                  <div className="mt-3 p-2 rounded bg-zinc-900">
                    <span className="text-zinc-200 text-xs">Suggested headlines:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {analysisResult.product_info.suggested_headlines.slice(0, 3).map((headline, i) => (
                        <button
                          key={i}
                          onClick={() => setProductInputs(prev => ({ ...prev, headline }))}
                          className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-300 hover:bg-emerald-500/20 hover:text-zinc-200 transition-colors"
                        >
                          {headline}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Text Inputs */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <span>Text</span> Poster text
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-zinc-400 mb-1">Headline *</label>
                    <input
                      type="text"
                      value={productInputs.headline}
                      onChange={(e) => setProductInputs(prev => ({ ...prev, headline: e.target.value }))}
                      placeholder="Example: STAY HYDRATED"
                      className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-zinc-400 mb-1">Subheadline</label>
                    <input
                      type="text"
                      value={productInputs.subheadline}
                      onChange={(e) => setProductInputs(prev => ({ ...prev, subheadline: e.target.value }))}
                      placeholder="Example: Premium Water Bottle"
                      className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-zinc-400 mb-1">Price / Discount</label>
                    <input
                      type="text"
                      value={productInputs.price}
                      onChange={(e) => setProductInputs(prev => ({ ...prev, price: e.target.value }))}
                      placeholder="Example: $29.99 or 20% OFF"
                      className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-zinc-400 mb-1">CTA / Button</label>
                    <input
                      type="text"
                      value={productInputs.cta}
                      onChange={(e) => setProductInputs(prev => ({ ...prev, cta: e.target.value }))}
                      placeholder="Example: Shop Now"
                      className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm text-zinc-400 mb-1">Brand name</label>
                    <input
                      type="text"
                      value={productInputs.brand}
                      onChange={(e) => setProductInputs(prev => ({ ...prev, brand: e.target.value }))}
                      placeholder="Example: Takeya"
                      className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Campaign Type Selection */}
              <div>
                <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-3">
                  <span>Campaign</span> Campaign type
                </h3>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: "awareness", label: "Awareness", desc: "Brand awareness" },
                    { value: "launch", label: "Launch", desc: "New product" },
                    { value: "sale", label: "Sale", desc: "Discount" },
                    { value: "seasonal", label: "Seasonal", desc: "Seasonal" },
                  ].map((campaign) => (
                    <button
                      key={campaign.value}
                      onClick={() => setProductCampaign(campaign.value as typeof productCampaign)}
                      className={`px-4 py-2 rounded-xl border transition-all ${
                        productCampaign === campaign.value
                          ? "bg-emerald-500/20 border-emerald-500 text-zinc-200"
                          : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-600"
                      }`}
                    >
                      {campaign.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Style Selection */}
              <div>
                <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-3">
                  <span>Style</span> Design style
                </h3>
                <div className="grid grid-cols-6 gap-2">
                  {[
                    { value: "fun", label: "🎉 Fun", color: "from-pink-400 to-purple-500" },
                    { value: "premium", label: "✨ Premium", color: "from-amber-400 to-yellow-600" },
                    { value: "athletic", label: "💪 Athletic", color: "from-orange-400 to-red-500" },
                    { value: "eco", label: "🌿 Eco", color: "from-green-400 to-emerald-500" },
                    { value: "minimal", label: "◻️ Minimal", color: "from-gray-400 to-gray-600" },
                    { value: "bold", label: "🔥 Bold", color: "from-red-500 to-rose-600" },
                  ].map((style) => (
                    <button
                      key={style.value}
                      onClick={() => setProductStyle(style.value as typeof productStyle)}
                      className={`p-3 rounded-xl border transition-all ${
                        productStyle === style.value
                          ? "border-emerald-500 ring-2 ring-emerald-500/30"
                          : "border-zinc-700 hover:border-zinc-600"
                      }`}
                    >
                      <div className={`w-full h-6 rounded-lg bg-gradient-to-br ${style.color} mb-2`} />
                      <span className="text-xs text-zinc-300">{style.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-zinc-700 flex justify-between items-center">
              <button
                onClick={() => setShowProductModal(false)}
                className="px-6 py-3 rounded-xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateFromProduct}
                disabled={!productInputs.headline.trim() || isGeneratingFromProduct}
                className="px-8 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold hover:from-emerald-600 hover:to-teal-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isGeneratingFromProduct ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Generating poster...
                  </>
                ) : (
                  <>
                    <span>🚀</span>
                    Generate poster
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


