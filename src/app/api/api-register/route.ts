import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { rateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RATE_LIMIT = 10;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": process.env.API_GENERATE_ALLOWED_ORIGIN || "*",
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

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// OPTIONS (CORS preflight)
// ---------------------------------------------------------------------------

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// ---------------------------------------------------------------------------
// POST — Register a new free-tier user
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // --- Auth ---
  if (!validateApiKey(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  // --- Rate limit ---
  const clientId = getClientId(request);
  const rl = rateLimit(`api-register:${clientId}`, RATE_LIMIT, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfter: Math.ceil((rl.resetAt - Date.now()) / 1000) },
      { status: 429, headers: CORS_HEADERS },
    );
  }

  // --- Parse body ---
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const { email, password } = body;

  // --- Validate ---
  if (!email || !password) {
    return NextResponse.json(
      { error: "email and password are required" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { error: "Invalid email format" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  // --- Supabase admin client ---
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error: missing Supabase service role key" },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  try {
    // --- Create Supabase Auth user ---
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (authError) {
      if (
        authError.message.toLowerCase().includes("already") ||
        authError.message.toLowerCase().includes("duplicate") ||
        authError.message.toLowerCase().includes("exists")
      ) {
        return NextResponse.json(
          { error: "Email already registered" },
          { status: 409, headers: CORS_HEADERS },
        );
      }
      return NextResponse.json(
        { error: authError.message },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: "Failed to create user" },
        { status: 500, headers: CORS_HEADERS },
      );
    }

    // --- Create Prisma profile ---
    const profile = await prisma.profile.create({
      data: {
        id: authData.user.id,
        email: authData.user.email,
      },
    });

    return NextResponse.json(
      {
        success: true,
        user: {
          id: profile.id,
          email: profile.email,
          role: profile.role,
          tier: profile.tier,
        },
      },
      { status: 201, headers: CORS_HEADERS },
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Internal server error";

    if (message.includes("Unique constraint")) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 409, headers: CORS_HEADERS },
      );
    }

    return NextResponse.json(
      { error: message },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
