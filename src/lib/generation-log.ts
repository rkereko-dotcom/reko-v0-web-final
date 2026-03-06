import { prisma } from "@/lib/prisma";

export async function logGeneration(
  userId: string,
  requestId: string,
  source: "studio" | "api",
  imageCount: number,
): Promise<void> {
  try {
    await prisma.generationLog.create({
      data: { userId, requestId, source, imageCount },
    });
  } catch (error) {
    console.error("Failed to log generation:", error);
  }
}
