import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const settings = await prisma.siteSettings.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" },
    });

    return NextResponse.json({
      premiumMonthlyPrice: settings.premiumMonthlyPrice,
      paidGenerationLimit: settings.paidGenerationLimit,
      freeGenerationLimit: settings.freeGenerationLimit,
      tokenPrice: settings.tokenPrice,
    });
  } catch {
    return NextResponse.json({
      premiumMonthlyPrice: 29900,
      paidGenerationLimit: 50,
      freeGenerationLimit: 5,
      tokenPrice: 1000,
    });
  }
}
