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

  const now = new Date();

  // Recent generations (latest 10)
  const recentGenerations = await prisma.generationLog.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  // Total generation count
  const totalGenerations = await prisma.generationLog.count({
    where: { userId: user.id },
  });

  // Generations this week
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const generationsThisWeek = await prisma.generationLog.count({
    where: { userId: user.id, createdAt: { gte: weekAgo } },
  });

  // Generations previous week (for trend)
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);
  const generationsPrevWeek = await prisma.generationLog.count({
    where: {
      userId: user.id,
      createdAt: { gte: twoWeeksAgo, lt: weekAgo },
    },
  });

  // Recent token logs (last 10)
  const recentTokenLogs = await prisma.tokenLog.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  // Total tokens used (generation_use)
  const tokensUsed = await prisma.tokenLog.aggregate({
    where: { userId: user.id, amount: { lt: 0 } },
    _sum: { amount: true },
  });

  return NextResponse.json({
    recentGenerations,
    totalGenerations,
    generationsThisWeek,
    generationsPrevWeek,
    recentTokenLogs,
    totalTokensUsed: Math.abs(tokensUsed._sum.amount ?? 0),
  });
}
