import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const userId = searchParams.get("userId");
  const type = searchParams.get("type");
  const tokenAmount = parseInt(searchParams.get("tokenAmount") || "0", 10);

  if (!userId || !type) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  try {
    const profile = await prisma.profile.findUnique({
      where: { id: userId },
    });

    if (!profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (type === "token" && tokenAmount > 0) {
      const updated = await prisma.profile.update({
        where: { id: userId },
        data: { tokenBalance: { increment: tokenAmount } },
      });

      await prisma.tokenLog.create({
        data: {
          userId,
          amount: tokenAmount,
          reason: "qpay_purchase",
          balance: updated.tokenBalance,
        },
      });

      await prisma.paymentLog.create({
        data: {
          userId,
          action: "qpay_token",
          prevTier: profile.tier,
          newTier: profile.tier,
        },
      });
    } else if (type === "premium") {
      const now = new Date();
      const prevTier = profile.tier;
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;

      // If premium is still active, extend from current expiry date
      const isActive =
        prevTier === "premium" &&
        profile.premiumExpiresAt &&
        profile.premiumExpiresAt > now;

      const baseDate = isActive ? profile.premiumExpiresAt! : now;
      const newExpiresAt = new Date(baseDate.getTime() + thirtyDays);

      await prisma.profile.update({
        where: { id: userId },
        data: {
          tier: "premium",
          premiumExpiresAt: newExpiresAt,
          // Only reset quota when upgrading from free
          ...(prevTier === "free" ? { quotaResetAt: now } : {}),
        },
      });

      await prisma.paymentLog.create({
        data: {
          userId,
          action: isActive ? "qpay_premium_renew" : "qpay_premium",
          prevTier,
          newTier: "premium",
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("QPay callback error:", error);
    return NextResponse.json(
      { error: "Callback processing failed" },
      { status: 500 },
    );
  }
}
