"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";

interface QuotaInfo {
  tier: string;
  tokenBalance: number;
  premiumExpiresAt: string | null;
  quotaResetAt: string;
  usedRequests: number;
  limit: number;
}

interface DashboardStats {
  recentGenerations: {
    id: string;
    requestId: string;
    source: string;
    imageCount: number;
    createdAt: string;
  }[];
  totalGenerations: number;
  generationsThisWeek: number;
  generationsPrevWeek: number;
  recentTokenLogs: {
    id: string;
    amount: number;
    reason: string;
    balance: number;
    createdAt: string;
  }[];
  totalTokensUsed: number;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Саяхан";
  if (mins < 60) return `${mins} мин өмнө`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} цагийн өмнө`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} өдрийн өмнө`;
  return new Date(dateStr).toLocaleDateString("mn-MN");
}

export default function DashboardPage() {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    if (user) {
      fetch("/api/profile/quota")
        .then((res) => res.json())
        .then((data) => setQuota(data))
        .catch(() => {});
      fetch("/api/dashboard/stats")
        .then((res) => res.json())
        .then((data) => setStats(data))
        .catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [loading, user, router]);

  async function handleSignOut() {
    await signOut();
    router.push("/login");
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen gradient-bg px-6 pb-16 pt-8">
        <div className="mx-auto max-w-6xl flex items-center justify-center min-h-[50vh]">
          <p className="text-zinc-500 text-sm">Ачаалж байна...</p>
        </div>
      </div>
    );
  }

  // Trend calculation
  const trendPercent =
    stats && stats.generationsPrevWeek > 0
      ? Math.round(
          ((stats.generationsThisWeek - stats.generationsPrevWeek) /
            stats.generationsPrevWeek) *
            100,
        )
      : null;

  return (
    <div className="min-h-screen gradient-bg px-6 pb-16 pt-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] tracking-[0.08em] normal-case text-zinc-500">
              {user?.email} ({profile?.tier === "premium" ? "Premium" : "Free"})
            </p>
            <h1 className="text-3xl md:text-4xl font-semibold text-white tracking-tight">
              User dashboard
            </h1>
          </div>
          <div className="flex gap-2">
            {profile?.role === "admin" && (
              <Link
                href="/admin"
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/10"
              >
                Admin Panel
              </Link>
            )}
            <Link
              href="/studio"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/10"
            >
              Go to Studio
            </Link>
            {profile?.tier === "free" && (
              <Link
                href="/billing"
                className="rounded-full bg-[#bde7ff] px-4 py-2 text-sm font-semibold text-black shadow-[0_12px_30px_-20px_rgba(140,215,255,0.6)]"
              >
                Upgrade plan
              </Link>
            )}
            <button
              onClick={handleSignOut}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-white/10"
            >
              Гарах
            </button>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-3 text-xs uppercase tracking-[0.25em] text-zinc-500">
          <Link href="/billing" className="hover:text-zinc-300">
            Billing
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/8 bg-zinc-950/80 p-5">
            <p className="text-[11px] tracking-[0.08em] normal-case text-zinc-500">
              Зураг үүсгэлт
            </p>
            {quota ? (
              <>
                <div className="mt-3 text-3xl font-semibold text-white">
                  {quota.usedRequests}
                </div>
                <p className="mt-1 text-sm text-zinc-500">
                  {quota.limit} удаагаас ашигласан
                </p>
                <div className="mt-4 h-2 w-full rounded-full bg-white/10">
                  <div
                    className="h-2 rounded-full bg-[#bde7ff]/70 transition-all"
                    style={{
                      width: `${Math.min((quota.usedRequests / quota.limit) * 100, 100)}%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  {Math.max(quota.limit - quota.usedRequests, 0)} удаа үлдсэн
                  {quota.tokenBalance > 0 && ` · ${quota.tokenBalance} token`}
                </p>
              </>
            ) : (
              <div className="mt-3 text-sm text-zinc-500">Ачаалж байна...</div>
            )}
          </div>

          <div className="rounded-2xl border border-white/8 bg-zinc-950/80 p-5">
            <p className="text-[11px] tracking-[0.08em] normal-case text-zinc-500">
              Үүсгэлтийн чиг хандлага
            </p>
            {stats ? (
              <>
                <div className="mt-3 flex items-center gap-3">
                  <div className="text-3xl font-semibold text-white">
                    {stats.generationsThisWeek}
                  </div>
                  {trendPercent !== null && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        trendPercent >= 0
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-red-500/15 text-red-300"
                      }`}
                    >
                      {trendPercent >= 0 ? "+" : ""}
                      {trendPercent}%
                    </span>
                  )}
                </div>
                <p className="text-zinc-500 text-sm mt-1">
                  Энэ 7 хоногт үүсгэсэн зураг
                </p>
                <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                  <span>Нийт: {stats.totalGenerations} зураг</span>
                  <span>Өмнөх 7 хоног: {stats.generationsPrevWeek}</span>
                </div>
              </>
            ) : (
              <div className="mt-3 text-sm text-zinc-500">Ачаалж байна...</div>
            )}
          </div>

          <div className="rounded-2xl border border-white/8 bg-zinc-950/80 p-5">
            <h2 className="text-white font-semibold">Статистик</h2>
            {stats ? (
              <div className="mt-4 grid gap-3 text-sm text-zinc-400">
                <div className="flex items-center justify-between">
                  <span>Нийт үүсгэсэн зураг</span>
                  <span className="text-zinc-200">
                    {stats.totalGenerations}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Энэ 7 хоногт</span>
                  <span className="text-zinc-200">
                    {stats.generationsThisWeek}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Нийт зарцуулсан токен</span>
                  <span className="text-zinc-200">{stats.totalTokensUsed}</span>
                </div>
              </div>
            ) : (
              <div className="mt-4 text-sm text-zinc-500">Ачаалж байна...</div>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/8 bg-zinc-950/80 p-5 space-y-4">
            <h2 className="text-white font-semibold">Багц & хэрэглээ</h2>
            {quota ? (
              <>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      quota.tier === "premium"
                        ? "bg-amber-500/15 text-amber-300"
                        : "bg-zinc-700/50 text-zinc-400"
                    }`}
                  >
                    {quota.tier === "premium" ? "Premium" : "Free"}
                  </span>
                  {quota.tokenBalance > 0 && (
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
                      {quota.tokenBalance} token
                    </span>
                  )}
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-200">Лимит</span>
                    <span className="text-zinc-400">
                      {quota.limit} удаа /{" "}
                      {quota.tier === "premium" ? "сар" : "7 хоног"}
                    </span>
                  </div>
                  {quota.tier === "premium" && quota.premiumExpiresAt && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-200">Хугацаа дуусах</span>
                      <span className="text-zinc-400">
                        {new Date(quota.premiumExpiresAt).toLocaleDateString(
                          "mn-MN",
                        )}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-200">Эрх шинэчлэгдэлт</span>
                    <span className="text-zinc-400">
                      {new Date(
                        new Date(quota.quotaResetAt).getTime() +
                          (quota.tier === "premium" ? 30 : 7) * 86400000,
                      ).toLocaleDateString("mn-MN")}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-sm text-zinc-500">Ачаалж байна...</div>
            )}
            <Link
              href="/billing"
              className="block w-full rounded-xl bg-[#bde7ff] py-2.5 text-center text-sm font-semibold text-black"
            >
              Багц удирдах
            </Link>
          </div>
          <div className="rounded-2xl border border-white/8 bg-zinc-950/80 p-5 space-y-4 lg:col-span-2">
            <h2 className="text-white font-semibold">Сүүлийн үүсгэлтүүд</h2>
            {stats?.recentGenerations && stats.recentGenerations.length > 0 ? (
              stats.recentGenerations.slice(0, 6).map((gen) => (
                <div
                  key={gen.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-zinc-200">
                    {gen.source === "api" ? "API" : "Studio"} · {gen.imageCount} зураг
                  </span>
                  <span className="text-zinc-500">
                    {timeAgo(gen.createdAt)}
                  </span>
                </div>
              ))
            ) : stats ? (
              <p className="text-sm text-zinc-500">Одоогоор үүсгэлт байхгүй</p>
            ) : (
              <p className="text-sm text-zinc-500">Ачаалж байна...</p>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr,1fr]">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/8 bg-zinc-950/80 p-5">
              <h2 className="text-white font-semibold">Зөвлөмж</h2>
              <div className="mt-4 space-y-3">
                {[
                  "Minimal хэв маягтай зураг илүү тод харагддаг.",
                  "1080x1350 хэмжээ нь сошиал зар сурталчилгаанд тохиромжтой.",
                  "Studio-с шинэ зураг үүсгэж эхлэхэд бэлэн!",
                ].map((tip) => (
                  <div
                    key={tip}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-300"
                  >
                    {tip}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/8 bg-zinc-950/80 p-5 space-y-4">
              <h2 className="text-white font-semibold">Токен хэрэглээ</h2>
              {stats?.recentTokenLogs && stats.recentTokenLogs.length > 0 ? (
                stats.recentTokenLogs.slice(0, 5).map((log) => (
                  <div
                    key={log.id}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-200">
                        {log.reason === "generation_use"
                          ? "Зураг үүсгэлт"
                          : log.reason === "qpay_purchase"
                            ? "QPay худалдан авалт"
                            : log.reason === "admin_grant"
                              ? "Админ олголт"
                              : log.reason}
                      </span>
                      <span
                        className={`font-semibold ${
                          log.amount > 0 ? "text-emerald-300" : "text-red-300"
                        }`}
                      >
                        {log.amount > 0 ? "+" : ""}
                        {log.amount}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
                      <span>Үлдэгдэл: {log.balance}</span>
                      <span>{timeAgo(log.createdAt)}</span>
                    </div>
                  </div>
                ))
              ) : stats ? (
                <div className="text-sm text-zinc-500">
                  Токен хэрэглээний түүх байхгүй
                </div>
              ) : (
                <div className="text-sm text-zinc-500">Ачаалж байна...</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
