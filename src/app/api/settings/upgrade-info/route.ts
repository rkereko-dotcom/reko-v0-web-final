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
    });
  } catch {
    return NextResponse.json({
      premiumMonthlyPrice: 29900,
      paidGenerationLimit: 50,
    });
  }
}
