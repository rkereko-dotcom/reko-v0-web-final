import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

const SAVE_FOLDER = path.join(process.cwd(), "generated-images");

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const file = request.nextUrl.searchParams.get("file");
  if (!file) {
    return NextResponse.json({ error: "Missing file parameter" }, { status: 400 });
  }

  // Security: only allow filenames (no path traversal)
  const safeName = path.basename(file);

  // Verify that this image belongs to the requesting user
  // filePath in DB is stored as full absolute path, so match by endsWith
  const fullPath = path.join(SAVE_FOLDER, safeName);
  const image = await prisma.generatedImage.findFirst({
    where: {
      userId: user.id,
      filePath: { endsWith: safeName },
    },
  });
  if (!image) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const filePath = fullPath;
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
