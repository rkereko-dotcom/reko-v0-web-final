import fs from "fs";
import path from "path";

const TELEMETRY_ENABLED = process.env.TELEMETRY_ENABLED === "true";
const TELEMETRY_SUPABASE = process.env.TELEMETRY_SUPABASE === "true";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TELEMETRY_DIR = process.env.TELEMETRY_DIR || path.join(process.cwd(), "telemetry");
const TELEMETRY_FILE = path.join(TELEMETRY_DIR, "events.jsonl");
const MAX_EVENT_BYTES = 200_000;

export type TelemetryEvent = {
  id: string;
  ts: string;
  type: "analyze" | "generate" | "feedback";
  sessionId?: string;
  userId?: string;
  payload?: Record<string, unknown>;
};

function ensureDir() {
  if (!fs.existsSync(TELEMETRY_DIR)) {
    fs.mkdirSync(TELEMETRY_DIR, { recursive: true });
  }
}

async function sendToSupabase(event: TelemetryEvent) {
  if (!TELEMETRY_SUPABASE || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  const payload = event.payload ?? {};
  const record = {
    id: event.id,
    ts: event.ts,
    type: event.type,
    session_id: event.sessionId ?? null,
    user_id: event.userId ?? null,
    analysis_id: (payload as { analysis_id?: string; analysisId?: string }).analysis_id ?? (payload as { analysisId?: string }).analysisId ?? null,
    request_id: (payload as { request_id?: string; requestId?: string }).request_id ?? (payload as { requestId?: string }).requestId ?? null,
    variation_id: (payload as { variation_id?: string; variationId?: string }).variation_id ?? (payload as { variationId?: string }).variationId ?? null,
    action: (payload as { action?: string }).action ?? null,
    payload,
  };
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/telemetry_events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify(record),
    });
  } catch {
    // Ignore errors to avoid breaking user flows.
  }
}

export function logEvent(event: TelemetryEvent) {
  if (!TELEMETRY_ENABLED && !TELEMETRY_SUPABASE) return;
  if (TELEMETRY_ENABLED) {
    try {
      ensureDir();
      const line = JSON.stringify(event);
      if (Buffer.byteLength(line, "utf8") <= MAX_EVENT_BYTES) {
        fs.appendFileSync(TELEMETRY_FILE, `${line}\n`, "utf8");
      }
    } catch {
      // Swallow telemetry errors to avoid breaking user flows.
    }
  }
  void sendToSupabase(event);
}
