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

  let profile = await prisma.profile.findUnique({
    where: { id: user.id },
  });

  // Auto-create profile if it doesn't exist (e.g. first login)
  if (!profile) {
    profile = await prisma.profile.create({
      data: {
        id: user.id,
        email: user.email,
      },
    });
  }

  return NextResponse.json(profile);
}
