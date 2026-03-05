import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { createQPayInvoice } from "@/lib/qpay";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { type, tokenAmount } = body as {
    type?: "token" | "premium";
    tokenAmount?: number;
  };

  if (!type || !["token", "premium"].includes(type)) {
    return NextResponse.json(
      { error: "type must be 'token' or 'premium'" },
      { status: 400 },
    );
  }

  if (type === "token" && (!tokenAmount || tokenAmount < 1)) {
    return NextResponse.json(
      { error: "tokenAmount must be >= 1" },
      { status: 400 },
    );
  }

  const settings = await prisma.siteSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });

  const amount =
    type === "premium"
      ? settings.premiumMonthlyPrice
      : settings.tokenPrice * (tokenAmount ?? 1);

  const description =
    type === "premium"
      ? "Reko Premium 1 сарын эрх"
      : `Reko ${tokenAmount} token худалдан авалт`;

  const senderInvoiceNo = `reko_${type}_${user.id.slice(0, 8)}_${Date.now()}`;

  const callbackUrl = `${process.env.QPAY_CALLBACK_URL || `${process.env.NEXT_PUBLIC_SITE_URL || "https://reko.mn"}/api/payment/qpay/callback`}?userId=${user.id}&type=${type}&tokenAmount=${tokenAmount ?? 0}&invoiceRef=${senderInvoiceNo}`;

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
      type,
      tokenAmount: tokenAmount ?? 0,
    });
  } catch (error) {
    console.error("QPay create invoice error:", error);
    return NextResponse.json(
      { error: "QPay invoice үүсгэхэд алдаа гарлаа" },
      { status: 500 },
    );
  }
}
