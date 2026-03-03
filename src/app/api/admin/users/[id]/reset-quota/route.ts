import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const currentProfile = await prisma.profile.findUnique({
    where: { id: user.id },
  });

  if (!currentProfile || currentProfile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const shouldUpgrade = body.upgrade === true;

  const targetProfile = await prisma.profile.findUnique({
    where: { id },
  });

  if (!targetProfile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const prevTier = targetProfile.tier;

  const updateData: { quotaResetAt: Date; tier?: "premium" } = {
    quotaResetAt: new Date(),
  };
  if (shouldUpgrade) {
    updateData.tier = "premium";
  }

  const profile = await prisma.profile.update({
    where: { id },
    data: updateData,
  });

  await prisma.paymentLog.create({
    data: {
      userId: id,
      action: shouldUpgrade ? "upgrade" : "renew",
      prevTier: prevTier,
      newTier: profile.tier,
    },
  });

  return NextResponse.json({
    tier: profile.tier,
    quotaResetAt: profile.quotaResetAt,
  });
}
