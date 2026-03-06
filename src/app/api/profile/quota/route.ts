import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
  });

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const now = new Date();
  let currentTier = profile.tier;

  // Auto-downgrade expired premium
  if (
    currentTier === "premium" &&
    profile.premiumExpiresAt &&
    now > profile.premiumExpiresAt
  ) {
    await prisma.profile.update({
      where: { id: user.id },
      data: { tier: "free", premiumExpiresAt: null },
    });
    currentTier = "free";
  }

  const settings = await prisma.siteSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });

  const limit =
    currentTier === "premium"
      ? settings.paidGenerationLimit
      : settings.freeGenerationLimit;

  // Auto-refresh quota cycle
  const cycleDays = currentTier === "premium" ? 30 : 7;
  const cycleMs = cycleDays * 24 * 60 * 60 * 1000;
  let quotaResetAt = profile.quotaResetAt;

  if (now.getTime() - quotaResetAt.getTime() >= cycleMs) {
    quotaResetAt = now;
    await prisma.profile.update({
      where: { id: user.id },
      data: { quotaResetAt: now },
    });
  }

  const usedRequests = await prisma.generationLog.count({
    where: {
      userId: user.id,
      createdAt: { gte: quotaResetAt },
    },
  });

  return NextResponse.json({
    tier: currentTier,
    tokenBalance: profile.tokenBalance,
    premiumExpiresAt: profile.premiumExpiresAt,
    quotaResetAt: quotaResetAt.toISOString(),
    usedRequests,
    limit,
  });
}
