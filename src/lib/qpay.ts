const QPAY_BASE_URL =
  process.env.QPAY_ENV === "production"
    ? "https://merchant.qpay.mn/v2"
    : "https://merchant-sandbox.qpay.mn/v2";

const QPAY_USERNAME = process.env.QPAY_USERNAME || "";
const QPAY_PASSWORD = process.env.QPAY_PASSWORD || "";
const QPAY_INVOICE_CODE = process.env.QPAY_INVOICE_CODE || "";

let cachedToken: { access_token: string; expires_at: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires_at) {
    return cachedToken.access_token;
  }

  const res = await fetch(`${QPAY_BASE_URL}/auth/token`, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(`${QPAY_USERNAME}:${QPAY_PASSWORD}`).toString("base64"),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`QPay auth failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  cachedToken = {
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000,
  };
  return data.access_token;
}

export interface QPayInvoiceResult {
  invoice_id: string;
  qr_text: string;
  qr_image: string;
  urls: Array<{
    name: string;
    description: string;
    logo: string;
    link: string;
  }>;
}

export async function createQPayInvoice(opts: {
  amount: number;
  description: string;
  callbackUrl: string;
  senderInvoiceNo: string;
}): Promise<QPayInvoiceResult> {
  const token = await getAccessToken();

  const res = await fetch(`${QPAY_BASE_URL}/invoice`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      invoice_code: QPAY_INVOICE_CODE,
      sender_invoice_no: opts.senderInvoiceNo,
      invoice_receiver_code: "",
      invoice_description: opts.description,
      amount: opts.amount,
      callback_url: opts.callbackUrl,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`QPay create invoice failed: ${res.status} ${text}`);
  }

  return res.json();
}

export interface QPayPaymentCheck {
  count: number;
  paid_amount: number;
  rows: Array<{
    payment_id: string;
    payment_status: string;
    payment_amount: number;
  }>;
}

export async function checkQPayPayment(
  invoiceId: string,
): Promise<QPayPaymentCheck> {
  const token = await getAccessToken();

  const res = await fetch(`${QPAY_BASE_URL}/payment/check`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      object_type: "INVOICE",
      object_id: invoiceId,
      offset: { page_number: 1, page_limit: 10 },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`QPay check payment failed: ${res.status} ${text}`);
  }

  return res.json();
}
