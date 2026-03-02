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

  const currentProfile = await prisma.profile.findUnique({
    where: { id: user.id },
  });

  if (!currentProfile || currentProfile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.profile.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(users);
}
