import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function verifyAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
  });

  if (!profile || profile.role !== "admin") return null;

  return profile;
}

export async function GET() {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const settings = await prisma.siteSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });

  return NextResponse.json(settings);
}

export async function PUT(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();

  const {
    siteName,
    tabTitle,
    freeGenerationLimit,
    paidGenerationLimit,
    premiumMonthlyPrice,
    tokenPrice,
  } = body;

  if (
    typeof siteName !== "string" ||
    typeof tabTitle !== "string" ||
    typeof freeGenerationLimit !== "number" ||
    typeof paidGenerationLimit !== "number" ||
    typeof premiumMonthlyPrice !== "number" ||
    typeof tokenPrice !== "number"
  ) {
    return NextResponse.json(
      { error: "Invalid input: all fields are required with correct types" },
      { status: 400 }
    );
  }

  if (freeGenerationLimit < 0 || paidGenerationLimit < 0 || premiumMonthlyPrice < 0 || tokenPrice < 0) {
    return NextResponse.json(
      { error: "Numeric values must be non-negative" },
      { status: 400 }
    );
  }

  const settings = await prisma.siteSettings.upsert({
    where: { id: "default" },
    update: {
      siteName,
      tabTitle,
      freeGenerationLimit,
      paidGenerationLimit,
      premiumMonthlyPrice,
      tokenPrice,
    },
    create: {
      id: "default",
      siteName,
      tabTitle,
      freeGenerationLimit,
      paidGenerationLimit,
      premiumMonthlyPrice,
      tokenPrice,
    },
  });

  return NextResponse.json(settings);
}
