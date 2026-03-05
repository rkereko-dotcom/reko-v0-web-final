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
      const thirtyDaysLater = new Date(
        now.getTime() + 30 * 24 * 60 * 60 * 1000,
      );

      const prevTier = profile.tier;

      await prisma.profile.update({
        where: { id: userId },
        data: {
          tier: "premium",
          premiumExpiresAt: thirtyDaysLater,
          quotaResetAt: now,
        },
      });

      await prisma.paymentLog.create({
        data: {
          userId,
          action: "qpay_premium",
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
