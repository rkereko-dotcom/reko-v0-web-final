import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { rateLimit } from "@/lib/rate-limit";
import { logEvent } from "@/lib/telemetry";

const RATE_LIMIT_PER_MINUTE = 30;

function getClientId(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip") || "unknown";
}

export async function POST(request: NextRequest) {
  try {
    const clientId = getClientId(request);
    const limitResult = rateLimit(`feedback:${clientId}`, RATE_LIMIT_PER_MINUTE, 60_000);
    if (!limitResult.ok) {
      const retryAfter = Math.max(1, Math.ceil((limitResult.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again soon." },
        { status: 429, headers: { "Retry-After": retryAfter.toString() } }
      );
    }

    const body = await request.json();
    logEvent({
      id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      type: "feedback",
      sessionId: body?.requestId || body?.analysisId,
      userId: clientId,
      payload: {
        analysis_id: body?.analysisId,
        request_id: body?.requestId,
        action: body?.action,
        variation_id: body?.variationId,
        index: body?.index,
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

