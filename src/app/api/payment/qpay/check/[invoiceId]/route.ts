import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkQPayPayment } from "@/lib/qpay";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { invoiceId } = await params;

  try {
    const result = await checkQPayPayment(invoiceId);

    return NextResponse.json({
      paid: result.count > 0,
      paidAmount: result.paid_amount,
      count: result.count,
    });
  } catch (error) {
    console.error("QPay check error:", error);
    return NextResponse.json(
      { error: "Төлбөр шалгахад алдаа гарлаа" },
      { status: 500 },
    );
  }
}
