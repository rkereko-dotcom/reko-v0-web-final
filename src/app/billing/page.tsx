"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/auth-provider";

interface UpgradeInfo {
  premiumMonthlyPrice: number;
  paidGenerationLimit: number;
  freeGenerationLimit: number;
  tokenPrice: number;
}

interface UserQuota {
  tier: string;
  tokenBalance: number;
  premiumExpiresAt: string | null;
  quotaResetAt: string;
  usedRequests: number;
  limit: number;
}

interface QPayInvoice {
  invoiceId: string;
  qrImage: string;
  amount: number;
  type: string;
  tokenAmount: number;
}

export default function BillingPage() {
  const { profile } = useAuth();
  const [info, setInfo] = useState<UpgradeInfo | null>(null);
  const [quota, setQuota] = useState<UserQuota | null>(null);
  const [tokenCount, setTokenCount] = useState(5);
  const [invoice, setInvoice] = useState<QPayInvoice | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [pollInterval, setPollInterval] = useState<ReturnType<typeof setInterval> | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/upgrade-info")
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (profile) fetchQuota();
  }, [profile]);

  async function fetchQuota() {
    try {
      const res = await fetch("/api/profile/quota");
      if (res.ok) setQuota(await res.json());
    } catch {}
  }

  const startPolling = useCallback(
    (invoiceId: string) => {
      if (pollInterval) clearInterval(pollInterval);
      const id = setInterval(async () => {
        try {
          const res = await fetch(`/api/payment/qpay/check/${invoiceId}`);
          if (!res.ok) return;
          const data = await res.json();
          if (data.paid) {
            clearInterval(id);
            setPollInterval(null);
            setInvoice(null);
            setPaymentSuccess("Төлбөр амжилттай! Таны эрх шинэчлэгдлээ.");
            fetchQuota();
            setTimeout(() => setPaymentSuccess(null), 5000);
          }
        } catch {}
      }, 3000);
      setPollInterval(id);
    },
    [pollInterval],
  );

  useEffect(() => {
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [pollInterval]);

  async function handlePurchase(type: "token" | "premium") {
    setPurchasing(true);
    setInvoice(null);
    try {
      const res = await fetch("/api/payment/qpay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          tokenAmount: type === "token" ? tokenCount : undefined,
        }),
      });
      if (!res.ok) throw new Error("Invoice үүсгэхэд алдаа гарлаа");
      const data = await res.json();
      setInvoice(data);
      startPolling(data.invoiceId);
    } catch {
      // QPay not configured — show manual payment info only
    } finally {
      setPurchasing(false);
    }
  }

  const premiumDaysLeft =
    quota?.premiumExpiresAt
      ? Math.max(
          0,
          Math.ceil(
            (new Date(quota.premiumExpiresAt).getTime() - Date.now()) /
              (24 * 60 * 60 * 1000),
          ),
        )
      : 0;

  return (
    <div className="min-h-screen gradient-bg px-6 py-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] tracking-[0.08em] uppercase text-zinc-500">
              Төлбөр
            </p>
            <h1 className="text-2xl md:text-3xl font-semibold text-white font-[var(--font-display)] tracking-tight">
              Эрх болон хэрэглээ
            </h1>
          </div>
          <Link
            href="/dashboard"
            className="text-xs uppercase tracking-[0.3em] text-zinc-500 hover:text-zinc-300"
          >
            Буцах
          </Link>
        </div>

        {paymentSuccess && (
          <div className="mt-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-4 py-3 text-sm text-emerald-300">
            {paymentSuccess}
          </div>
        )}

        {/* Current Status */}
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/8 bg-zinc-950/80 p-5">
            <p className="text-[11px] tracking-[0.08em] uppercase text-zinc-500">
              Эрх
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  quota?.tier === "premium"
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-white/10 text-zinc-400"
                }`}
              >
                {quota?.tier === "premium" ? "Premium" : "Free"}
              </span>
              {quota?.tier === "premium" && premiumDaysLeft > 0 && (
                <span className="text-xs text-zinc-500">
                  {premiumDaysLeft} хоног үлдсэн
                </span>
              )}
            </div>
            {quota && (
              <div className="mt-3">
                <div className="h-2 rounded-full bg-white/10">
                  <div
                    className="h-2 rounded-full bg-[#bde7ff]/70 transition-all"
                    style={{
                      width: `${Math.min(100, (quota.usedRequests / Math.max(1, quota.limit)) * 100)}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-zinc-500 mt-1.5">
                  {quota.usedRequests}/{quota.limit} удаа ашигласан
                  {quota.usedRequests >= quota.limit && (
                    <span className="text-red-400 ml-1">(дууссан)</span>
                  )}
                </p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/8 bg-zinc-950/80 p-5">
            <p className="text-[11px] tracking-[0.08em] uppercase text-zinc-500">
              Token үлдэгдэл
            </p>
            <div className="mt-2 text-3xl font-semibold text-amber-300">
              {quota?.tokenBalance ?? 0}
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              1 token = 1 generate = 4 зураг
            </p>
          </div>

          <div className="rounded-2xl border border-white/8 bg-zinc-950/80 p-5">
            <p className="text-[11px] tracking-[0.08em] uppercase text-zinc-500">
              Дараагийн шинэчлэл
            </p>
            {quota && (
              <>
                <div className="mt-2 text-lg font-semibold text-white">
                  {new Date(
                    new Date(quota.quotaResetAt).getTime() +
                      (quota.tier === "premium" ? 30 : 7) * 24 * 60 * 60 * 1000,
                  ).toLocaleDateString("mn-MN", {
                    month: "short",
                    day: "numeric",
                  })}
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  {quota.tier === "premium" ? "30 хоног тутам" : "7 хоног тутам"}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Purchase Options */}
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {/* Token Purchase */}
          <div className="rounded-2xl border border-amber-500/20 bg-zinc-950/80 p-6">
            <h2 className="text-white font-semibold text-lg">
              Token худалдаж авах
            </h2>
            <p className="text-zinc-500 text-sm mt-1">
              Хэдэн ч token авч болно. Хугацаагүй.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-[11px] tracking-[0.08em] uppercase text-zinc-500 mb-2">
                  Token тоо
                </label>
                <div className="flex gap-2">
                  {[1, 5, 10, 20].map((n) => (
                    <button
                      key={n}
                      onClick={() => setTokenCount(n)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                        tokenCount === n
                          ? "border-amber-500/50 bg-amber-500/15 text-amber-300"
                          : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3">
                <span className="text-xs text-zinc-500">Нийт үнэ</span>
                <span className="text-lg font-semibold text-white">
                  {((info?.tokenPrice ?? 1000) * tokenCount).toLocaleString(
                    "mn-MN",
                  )}
                  ₮
                </span>
              </div>

              <button
                onClick={() => handlePurchase("token")}
                disabled={purchasing}
                className="w-full rounded-xl bg-amber-500/90 py-2.5 text-sm font-semibold text-white hover:bg-amber-500 transition disabled:opacity-50"
              >
                {purchasing ? "Уншиж байна..." : `${tokenCount} token авах`}
              </button>
            </div>

            {/* Bank transfer info */}
            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 space-y-1.5">
              <p className="text-[11px] tracking-[0.08em] uppercase text-zinc-500">
                Банкаар шилжүүлэх бол
              </p>
              <p className="text-xs text-zinc-400">
                Данс: <span className="text-zinc-200">5429 1234 5678</span>
              </p>
              <p className="text-xs text-zinc-400">
                Банк: <span className="text-zinc-200">Хаан банк</span>
              </p>
              <p className="text-xs text-zinc-400">
                Гүйлгээний утга:{" "}
                <span className="text-zinc-200">{profile?.email}</span>
              </p>
              <p className="text-[11px] text-zinc-600">
                Шилжүүлсний дараа админ таны token-г нэмнэ.
              </p>
            </div>
          </div>

          {/* Premium Subscription */}
          <div className="rounded-2xl border border-emerald-500/20 bg-zinc-950/80 p-6">
            <h2 className="text-white font-semibold text-lg">
              Premium эрх авах
            </h2>
            <p className="text-zinc-500 text-sm mt-1">
              30 хоногийн турш {info?.paidGenerationLimit ?? 50} удаа generate
            </p>

            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Сарын төлбөр</span>
                  <span className="text-lg font-semibold text-white">
                    {(info?.premiumMonthlyPrice ?? 29900).toLocaleString(
                      "mn-MN",
                    )}
                    ₮
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Generate лимит</span>
                  <span className="text-sm text-zinc-300">
                    {info?.paidGenerationLimit ?? 50} удаа/сар
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Хугацаа</span>
                  <span className="text-sm text-zinc-300">30 хоног</span>
                </div>
              </div>

              {quota?.tier === "premium" ? (
                <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-center">
                  <p className="text-sm text-emerald-300 font-medium">
                    Premium идэвхтэй — {premiumDaysLeft} хоног үлдсэн
                  </p>
                </div>
              ) : (
                <button
                  onClick={() => handlePurchase("premium")}
                  disabled={purchasing}
                  className="w-full rounded-xl bg-emerald-500/90 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 transition disabled:opacity-50"
                >
                  {purchasing ? "Уншиж байна..." : "Premium авах"}
                </button>
              )}
            </div>

            {/* Bank transfer info */}
            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 space-y-1.5">
              <p className="text-[11px] tracking-[0.08em] uppercase text-zinc-500">
                Банкаар шилжүүлэх бол
              </p>
              <p className="text-xs text-zinc-400">
                Данс: <span className="text-zinc-200">5429 1234 5678</span>
              </p>
              <p className="text-xs text-zinc-400">
                Банк: <span className="text-zinc-200">Хаан банк</span>
              </p>
              <p className="text-xs text-zinc-400">
                Гүйлгээний утга:{" "}
                <span className="text-zinc-200">{profile?.email}</span>
              </p>
              <p className="text-[11px] text-zinc-600">
                Шилжүүлсний дараа админ таны эрхийг ахиулна.
              </p>
            </div>
          </div>
        </div>

        {/* QPay QR Modal */}
        {invoice && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={() => {
              setInvoice(null);
              if (pollInterval) {
                clearInterval(pollInterval);
                setPollInterval(null);
              }
            }}
          >
            <div
              className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-950 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-white text-center">
                QPay төлбөр
              </h3>
              <p className="mt-1 text-sm text-zinc-400 text-center">
                QR код уншуулж төлбөрөө хийнэ үү
              </p>

              <div className="mt-4 flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:image/png;base64,${invoice.qrImage}`}
                  alt="QPay QR"
                  className="w-56 h-56 rounded-xl"
                />
              </div>

              <div className="mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3">
                <span className="text-xs text-zinc-500">Төлөх дүн</span>
                <span className="text-lg font-semibold text-white">
                  {invoice.amount.toLocaleString("mn-MN")}₮
                </span>
              </div>

              <p className="mt-3 text-center text-xs text-zinc-500 animate-pulse">
                Төлбөр хүлээж байна...
              </p>

              <button
                onClick={() => {
                  setInvoice(null);
                  if (pollInterval) {
                    clearInterval(pollInterval);
                    setPollInterval(null);
                  }
                }}
                className="mt-4 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-white/10 transition"
              >
                Хаах
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
