import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { createQPayInvoice } from "@/lib/qpay";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const rl = rateLimit(`billing-tokens:${ip}`, 5, 60_000);
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

  const body = await request.json().catch(() => ({}));
  const { amount: tokenAmount } = body as { amount?: number };

  if (!tokenAmount || !Number.isInteger(tokenAmount) || tokenAmount < 1 || tokenAmount > 100) {
    return NextResponse.json(
      { error: "amount нь 1-100 хооронд бүхэл тоо байх ёстой" },
      { status: 400 },
    );
  }

  const settings = await prisma.siteSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });

  const totalPrice = settings.tokenPrice * tokenAmount;
  const description = `Reko ${tokenAmount} token худалдан авалт`;
  const senderInvoiceNo = `reko_token_${user.id.slice(0, 8)}_${Date.now()}`;

  const callbackUrl = `${
    process.env.QPAY_CALLBACK_URL ||
    `${process.env.NEXT_PUBLIC_SITE_URL || "https://reko.mn"}/api/payment/qpay/callback`
  }?userId=${user.id}&type=token&tokenAmount=${tokenAmount}&invoiceRef=${senderInvoiceNo}`;

  try {
    const invoice = await createQPayInvoice({
      amount: totalPrice,
      description,
      callbackUrl,
      senderInvoiceNo,
    });

    return NextResponse.json({
      invoiceId: invoice.invoice_id,
      qrImage: invoice.qr_image,
      qrText: invoice.qr_text,
      urls: invoice.urls,
      amount: totalPrice,
      tokenAmount,
      unitPrice: settings.tokenPrice,
    });
  } catch (error) {
    console.error("Billing tokens error:", error);
    return NextResponse.json(
      { error: "QPay invoice үүсгэхэд алдаа гарлаа" },
      { status: 500 },
    );
  }
}
