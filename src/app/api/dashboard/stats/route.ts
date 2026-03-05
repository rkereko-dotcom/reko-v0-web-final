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

  // Recent images (latest 10)
  const recentImages = await prisma.generatedImage.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  // Total generation count
  const totalGenerations = await prisma.generatedImage.count({
    where: { userId: user.id },
  });

  // Generations this week
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const generationsThisWeek = await prisma.generatedImage.count({
    where: { userId: user.id, createdAt: { gte: weekAgo } },
  });

  // Generations previous week (for trend)
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);
  const generationsPrevWeek = await prisma.generatedImage.count({
    where: {
      userId: user.id,
      createdAt: { gte: twoWeeksAgo, lt: weekAgo },
    },
  });

  // Top variation names (style affinity)
  const variationStats = await prisma.generatedImage.groupBy({
    by: ["variationName"],
    where: { userId: user.id },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 5,
  });

  // Recent projects grouped by requestId (latest 5)
  const recentProjects = await prisma.generatedImage.groupBy({
    by: ["requestId"],
    where: { userId: user.id },
    _count: { id: true },
    _max: { createdAt: true },
    orderBy: { _max: { createdAt: "desc" } },
    take: 5,
  });

  // Get first image of each recent project for name/details
  const projectDetails = await Promise.all(
    recentProjects.map(async (p) => {
      const firstImage = await prisma.generatedImage.findFirst({
        where: { userId: user.id, requestId: p.requestId },
        orderBy: { createdAt: "asc" },
      });
      return {
        requestId: p.requestId,
        imageCount: p._count.id,
        createdAt: p._max.createdAt,
        variationName: firstImage?.variationName ?? "",
        aspectRatio: firstImage?.aspectRatio ?? "",
        source: firstImage?.source ?? "",
      };
    })
  );

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
    recentImages,
    totalGenerations,
    generationsThisWeek,
    generationsPrevWeek,
    variationStats: variationStats.map((v) => ({
      name: v.variationName,
      count: v._count.id,
    })),
    recentProjects: projectDetails,
    recentTokenLogs,
    totalTokensUsed: Math.abs(tokensUsed._sum.amount ?? 0),
  });
}
