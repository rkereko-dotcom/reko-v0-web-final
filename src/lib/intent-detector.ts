type AnalysisLike = {
  elements?: {
    headline?: string;
    subheadline?: string | null;
    body_text?: string[];
    brand?: string | null;
    purpose?: string;
  };
  emotional_analysis?: {
    intended_emotion?: string;
    target_audience?: string;
  };
  style_detection?: {
    primary_style?: string;
    what_its_trying_to_be?: string;
  };
  product_info?: {
    product_type?: string;
    brand_detected?: string | null;
    target_demographic?: {
      age_range?: string;
      gender?: string;
      lifestyle?: string;
    };
  };
  their_vision?: string;
  feedback?: { overall?: string };
  is_product?: boolean;
};

export type IntentProfile = {
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
};

const CTA_PATTERNS: Array<[RegExp, string]> = [
  [/\b(get started|start now|start today)\b/i, "get started"],
  [/\b(try now|try free|free trial)\b/i, "try now"],
  [/\b(buy now|shop now|order now|purchase)\b/i, "buy now"],
  [/\b(register|sign up|signup|rsvp)\b/i, "register"],
  [/\b(download|install)\b/i, "download"],
  [/\b(learn more|read more)\b/i, "learn more"],
  [/\b(book now|reserve)\b/i, "book now"],
  [/\b(apply|join our team)\b/i, "apply"],
  [/\b(visit|contact)\b/i, "contact"],
];

const INTENT_KEYWORDS = {
  conversion: /\b(sale|discount|off|deal|offer|limited|price|only)\b/i,
  event: /\b(event|conference|seminar|workshop|webinar|meetup|launch party)\b/i,
  hiring: /\b(hiring|apply|job|career|vacancy|we are hiring|join our team)\b/i,
  announcement: /\b(announcing|announcement|launch|new|introducing|coming soon)\b/i,
};

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function buildTextBlob(analysis: AnalysisLike, rawText?: string) {
  const parts: string[] = [];
  if (analysis.elements?.headline) parts.push(analysis.elements.headline);
  if (analysis.elements?.subheadline) parts.push(analysis.elements.subheadline);
  if (analysis.elements?.body_text?.length) parts.push(analysis.elements.body_text.join(" "));
  if (analysis.elements?.purpose) parts.push(analysis.elements.purpose);
  if (analysis.elements?.brand) parts.push(analysis.elements.brand);
  if (analysis.product_info?.brand_detected) parts.push(analysis.product_info.brand_detected);
  if (analysis.product_info?.product_type) parts.push(analysis.product_info.product_type);
  if (analysis.their_vision) parts.push(analysis.their_vision);
  if (analysis.feedback?.overall) parts.push(analysis.feedback.overall);
  if (analysis.emotional_analysis?.target_audience) parts.push(analysis.emotional_analysis.target_audience);
  if (rawText) parts.push(rawText);
  return normalizeText(parts.join(" "));
}

function detectCTA(text: string) {
  for (const [pattern, label] of CTA_PATTERNS) {
    if (pattern.test(text)) return label;
  }
  return "none";
}

function detectPrice(text: string) {
  const priceMatch = text.match(/(?:\$|USD|EUR|GBP|MNT|KRW|JPY)\s?\d[\d,]*(?:\.\d+)?/i);
  if (priceMatch) return priceMatch[0];
  const altMatch = text.match(/\b\d[\d,]*(?:\.\d+)?\s?(usd|eur|gbp|mnt|krw|jpy)\b/i);
  return altMatch ? altMatch[0] : "";
}

function detectDiscount(text: string) {
  const percentMatch = text.match(/\b\d{1,3}\s?%(\s?off)?\b/i);
  return percentMatch ? percentMatch[0] : "";
}

function detectDate(text: string) {
  const monthMatch = text.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i);
  if (monthMatch) return monthMatch[0];
  const numericMatch = text.match(/\b\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?\b/);
  if (numericMatch) return numericMatch[0];
  const yearMatch = text.match(/\b20\d{2}\b/);
  return yearMatch ? yearMatch[0] : "";
}

function detectLocation(text: string) {
  const locationMatch = text.match(/\b(venue|location|address|at|ulaanbaatar|ub|mongolia|tokyo|seoul|new york|london)\b/i);
  return locationMatch ? locationMatch[0] : "";
}

function guessBrandTone(analysis: AnalysisLike) {
  return (
    analysis.style_detection?.what_its_trying_to_be ||
    analysis.style_detection?.primary_style ||
    ""
  );
}

export function deriveIntentProfile(analysis: AnalysisLike, rawText?: string): IntentProfile {
  const textBlob = buildTextBlob(analysis, rawText);
  const lower = textBlob.toLowerCase();

  const cta = detectCTA(lower);
  const price = detectPrice(lower);
  const discount = detectDiscount(lower);
  const date = detectDate(lower);
  const location = detectLocation(lower);

  let conversion = 0;
  let event = 0;
  let awareness = 0;
  let hiring = 0;
  let announcement = 0;

  if (price) conversion += 30;
  if (discount) conversion += 20;
  if (cta !== "none") conversion += 15;
  if (analysis.product_info?.product_type || analysis.is_product) conversion += 10;
  if (INTENT_KEYWORDS.conversion.test(lower)) conversion += 10;

  if (date) event += 30;
  if (location) event += 15;
  if (INTENT_KEYWORDS.event.test(lower)) event += 20;
  if (cta === "register" || cta === "book now") event += 10;

  if (INTENT_KEYWORDS.hiring.test(lower)) hiring += 40;

  if (INTENT_KEYWORDS.announcement.test(lower)) announcement += 25;

  if ((analysis.elements?.brand || analysis.product_info?.brand_detected) && cta === "none") {
    awareness += 20;
  }
  if (!cta && !price && !discount && !date) awareness += 10;

  const scores = [
    { key: "conversion", score: conversion },
    { key: "event", score: event },
    { key: "awareness", score: awareness },
    { key: "hiring", score: hiring },
    { key: "announcement", score: announcement },
  ].sort((a, b) => b.score - a.score);

  const top = scores[0];
  const second = scores[1];
  const confidence = Math.max(20, Math.min(100, Math.round(50 + (top.score - second.score))));
  const needsQuestions = top.score < 40 || top.score - second.score < 10;

  const questions: string[] = [];
  if (needsQuestions) {
    questions.push("What is the main goal? (awareness, conversion, event, hiring)");
    questions.push("What should the viewer do next? (CTA)");
    questions.push("Who is the target audience?");
  }

  const primaryMessage =
    analysis.elements?.headline ||
    analysis.their_vision ||
    analysis.feedback?.overall ||
    "";

  const desiredEmotion =
    analysis.emotional_analysis?.intended_emotion ||
    "";

  const targetAudience =
    analysis.emotional_analysis?.target_audience ||
    [
      analysis.product_info?.target_demographic?.age_range,
      analysis.product_info?.target_demographic?.gender,
      analysis.product_info?.target_demographic?.lifestyle,
    ].filter(Boolean).join(" ");

  const constraints: string[] = [];
  if (analysis.elements?.brand || analysis.product_info?.brand_detected) {
    constraints.push("Keep brand identity");
  }
  if (analysis.elements?.headline) {
    constraints.push("Keep headline wording");
  }
  if (analysis.is_product) {
    constraints.push("Single product focus");
  }

  return {
    goal: top.key,
    primary_message: primaryMessage,
    what_they_want_to_show: analysis.elements?.purpose || analysis.their_vision || "",
    what_they_want_viewer_to_feel: desiredEmotion,
    desired_emotion: desiredEmotion,
    target_audience: targetAudience,
    cta,
    brand_tone: guessBrandTone(analysis),
    constraints,
    confidence,
    needs_questions: needsQuestions,
    questions: needsQuestions ? questions : [],
    signals: {
      price,
      discount,
      date,
      location,
      brand: analysis.elements?.brand || analysis.product_info?.brand_detected || "",
    },
  };
}

function isEmptyValue(value: unknown) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    return trimmed.length === 0 || trimmed === "none" || trimmed === "unknown";
  }
  if (typeof value === "number") return Number.isNaN(value) || value === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function mergeIntentProfile(existing: Partial<IntentProfile> | undefined, derived: IntentProfile) {
  if (!existing) return derived;
  const merged: IntentProfile = { ...derived };
  (Object.keys(existing) as Array<keyof IntentProfile>).forEach((key) => {
    const value = existing[key];
    if (!isEmptyValue(value)) {
      merged[key] = value as never;
    }
  });
  return merged;
}
