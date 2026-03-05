import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { createQPayInvoice } from "@/lib/qpay";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const rl = rateLimit(`billing-premium:${ip}`, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
  });

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const settings = await prisma.siteSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });

  const now = new Date();
  const isActive =
    profile.tier === "premium" &&
    profile.premiumExpiresAt &&
    profile.premiumExpiresAt > now;

  const action = isActive ? "renew" : "upgrade";

  const amount = settings.premiumMonthlyPrice;
  const description =
    action === "renew"
      ? "Reko Premium сунгалт (30 хоног)"
      : "Reko Premium 1 сарын эрх";

  const senderInvoiceNo = `reko_premium_${action}_${user.id.slice(0, 8)}_${Date.now()}`;

  const callbackUrl = `${
    process.env.QPAY_CALLBACK_URL ||
    `${process.env.NEXT_PUBLIC_SITE_URL || "https://reko.mn"}/api/payment/qpay/callback`
  }?userId=${user.id}&type=premium&tokenAmount=0&invoiceRef=${senderInvoiceNo}`;

  try {
    const invoice = await createQPayInvoice({
      amount,
      description,
      callbackUrl,
      senderInvoiceNo,
    });

    return NextResponse.json({
      invoiceId: invoice.invoice_id,
      qrImage: invoice.qr_image,
      qrText: invoice.qr_text,
      urls: invoice.urls,
      amount,
      action,
      premiumExpiresAt: profile.premiumExpiresAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error("Billing premium error:", error);
    return NextResponse.json(
      { error: "QPay invoice үүсгэхэд алдаа гарлаа" },
      { status: 500 },
    );
  }
}
