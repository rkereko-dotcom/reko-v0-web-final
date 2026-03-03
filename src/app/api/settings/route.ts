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
      siteName: settings.siteName,
    });
  } catch {
    return NextResponse.json({ siteName: "Reko" });
  }
}
