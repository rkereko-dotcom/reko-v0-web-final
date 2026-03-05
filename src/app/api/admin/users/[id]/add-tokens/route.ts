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
  const amount = Number(body.amount);

  if (!Number.isInteger(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "amount must be a positive integer" },
      { status: 400 },
    );
  }

  const targetProfile = await prisma.profile.findUnique({
    where: { id },
  });

  if (!targetProfile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const updated = await prisma.profile.update({
    where: { id },
    data: { tokenBalance: { increment: amount } },
  });

  await prisma.tokenLog.create({
    data: {
      userId: id,
      amount,
      reason: "admin_grant",
      balance: updated.tokenBalance,
    },
  });

  await prisma.paymentLog.create({
    data: {
      userId: id,
      action: "token_grant",
      prevTier: targetProfile.tier,
      newTier: targetProfile.tier,
    },
  });

  return NextResponse.json({
    tokenBalance: updated.tokenBalance,
  });
}
