import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": process.env.API_GENERATE_ALLOWED_ORIGIN || "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function validateApiKey(request: NextRequest): boolean {
  const expectedKey = process.env.API_GENERATE_KEY;
  if (!expectedKey) return false;

  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;

  const providedKey = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  return providedKey === expectedKey;
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
  if (!validateApiKey(request)) {
    return NextResponse.json(
      { error: "Unauthorized. Invalid or missing API key." },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  const email = request.nextUrl.searchParams.get("email");

  if (!email) {
    return NextResponse.json(
      { error: "Missing required query parameter: email" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const profile = await prisma.profile.findFirst({
    where: { email },
  });

  if (!profile) {
    return NextResponse.json(
      { error: "User not found" },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  return NextResponse.json(profile, { headers: CORS_HEADERS });
}
