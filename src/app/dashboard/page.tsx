"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { useSiteName } from "@/components/providers/site-settings-provider";

interface QuotaInfo {
  tier: string;
  tokenBalance: number;
  premiumExpiresAt: string | null;
  quotaResetAt: string;
  usedRequests: number;
  limit: number;
}

export default function DashboardPage() {
  const { user, profile, loading, signOut } = useAuth();
  const siteName = useSiteName();
  const router = useRouter();
  const [quota, setQuota] = useState<QuotaInfo | null>(null);

  useEffect(() => {
    if (user) {
      fetch("/api/profile/quota")
        .then((res) => res.json())
        .then((data) => setQuota(data))
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
      <main className="relative z-10 flex-1 px-6 pb-16 pt-8">
        <div className="mx-auto max-w-6xl flex items-center justify-center min-h-[50vh]">
          <p className="text-zinc-500 text-sm">Ачаалж байна...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative z-10 flex-1 px-6 pb-16 pt-8">
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
          <Link href="/library" className="hover:text-zinc-300">Library</Link>
          <Link href="/billing" className="hover:text-zinc-300">Billing</Link>
          <Link href="/" className="hover:text-zinc-300">Landing</Link>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/8 bg-zinc-950/80 p-5">
            <p className="text-[11px] tracking-[0.08em] normal-case text-zinc-500">Quick actions</p>
            <div className="mt-4 grid gap-2">
              {[
                { label: "New analysis", href: "/studio" },
                { label: "New project", href: "/studio?new=1" },
                { label: "Choose brand kit", href: "/library?tab=brand" },
              ].map((action) => (
                <Link
                  key={action.label}
                  href={action.href}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-zinc-200 transition hover:border-white/30 hover:bg-white/10"
                >
                  {action.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/8 bg-zinc-950/80 p-5">
            <p className="text-[11px] tracking-[0.08em] normal-case text-zinc-500">Зураг үүсгэлт</p>
            {quota ? (
              <>
                <div className="mt-3 text-3xl font-semibold text-white">{quota.usedRequests}</div>
                <p className="mt-1 text-sm text-zinc-500">{quota.limit} удаагаас ашигласан</p>
                <div className="mt-4 h-2 w-full rounded-full bg-white/10">
                  <div
                    className="h-2 rounded-full bg-[#bde7ff]/70 transition-all"
                    style={{ width: `${Math.min((quota.usedRequests / quota.limit) * 100, 100)}%` }}
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
            <p className="text-[11px] tracking-[0.08em] normal-case text-zinc-500">Quality trend</p>
            <div className="mt-3 flex items-center gap-3">
              <div className="text-3xl font-semibold text-white">+18%</div>
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                Up
              </span>
            </div>
            <p className="text-zinc-500 text-sm mt-1">Average score vs last month</p>
            <div className="mt-4 grid grid-cols-5 gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className={`h-10 rounded-lg ${i < 4 ? "bg-white/10" : "bg-[#bde7ff]/30"}`} />
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/8 bg-zinc-950/80 p-5">
            <p className="text-[11px] tracking-[0.08em] normal-case text-zinc-500">Style affinity</p>
            <div className="mt-3 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-200">Minimal</span>
                <span className="text-zinc-400">64%</span>
              </div>
              <div className="h-2 rounded-full bg-white/10">
                <div className="h-2 w-[64%] rounded-full bg-[#bde7ff]/60" />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-200">Editorial</span>
                <span className="text-zinc-400">22%</span>
              </div>
              <div className="h-2 rounded-full bg-white/10">
                <div className="h-2 w-[22%] rounded-full bg-white/25" />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr,1fr]">
          <div className="rounded-2xl border border-white/8 bg-zinc-950/80 overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <h2 className="text-white font-semibold">Recent projects</h2>
              <button className="text-xs text-zinc-500 hover:text-zinc-300">Manage</button>
            </div>
            <div className="divide-y divide-white/10">
              {[
                { name: "Launch teaser", score: "78", status: "Improved", time: "2h ago" },
                { name: "Product offer", score: "64", status: "Needs work", time: "Yesterday" },
                { name: "Event invite", score: "71", status: "Improved", time: "Jan 21" },
              ].map((row) => (
                <div key={row.name} className="grid gap-3 px-5 py-4 text-sm sm:grid-cols-[1.4fr,0.6fr,0.6fr,0.4fr]">
                  <div className="text-zinc-200">{row.name}</div>
                  <div className="text-zinc-400">Score {row.score}</div>
                  <div className={`text-xs font-semibold ${row.status === "Improved" ? "text-emerald-300" : "text-zinc-400"}`}>
                    {row.status}
                  </div>
                  <div className="text-xs text-zinc-500">{row.time}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/8 bg-zinc-950/80 p-5 space-y-4">
            <h2 className="text-white font-semibold">In progress</h2>
            {[
              { name: "Holiday sale poster", progress: "65%", eta: "2 min" },
              { name: "Mobile app ad", progress: "30%", eta: "5 min" },
            ].map((item) => (
              <div key={item.name} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-200">{item.name}</span>
                  <span className="text-zinc-400">{item.progress}</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-white/10">
                  <div className="h-2 w-[65%] rounded-full bg-[#bde7ff]/70" />
                </div>
                <p className="mt-2 text-xs text-zinc-500">ETA {item.eta}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/8 bg-zinc-950/80 p-5 space-y-4">
            <h2 className="text-white font-semibold">Exports</h2>
            {[
              { name: "Launch teaser", format: "PNG · 2048", time: "2h ago" },
              { name: "Product offer", format: "PDF · A4", time: "Yesterday" },
              { name: "Event invite", format: "PNG · 1080", time: "Jan 21" },
            ].map((item) => (
              <div key={item.name} className="flex items-center justify-between text-sm">
                <span className="text-zinc-200">{item.name}</span>
                <span className="text-zinc-500">{item.format}</span>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-white/8 bg-zinc-950/80 p-5 space-y-4">
            <h2 className="text-white font-semibold">Brand kit</h2>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-400">
              Active: {siteName} Studio (Fonts, colors, logo)
            </div>
            <button className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/15">
              Manage brand kits
            </button>
          </div>

          <div className="rounded-2xl border border-white/8 bg-zinc-950/80 p-5 space-y-4">
            <h2 className="text-white font-semibold">Багц & хэрэглээ</h2>
            {quota ? (
              <>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    quota.tier === "premium"
                      ? "bg-amber-500/15 text-amber-300"
                      : "bg-zinc-700/50 text-zinc-400"
                  }`}>
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
                    <span className="text-zinc-400">{quota.limit} удаа / {quota.tier === "premium" ? "сар" : "7 хоног"}</span>
                  </div>
                  {quota.tier === "premium" && quota.premiumExpiresAt && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-200">Хугацаа дуусах</span>
                      <span className="text-zinc-400">{new Date(quota.premiumExpiresAt).toLocaleDateString("mn-MN")}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-200">Дараагийн шинэчлэл</span>
                    <span className="text-zinc-400">
                      {new Date(new Date(quota.quotaResetAt).getTime() + (quota.tier === "premium" ? 30 : 7) * 86400000).toLocaleDateString("mn-MN")}
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
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr,1fr]">
          <div className="rounded-2xl border border-white/8 bg-zinc-950/80 p-5">
            <h2 className="text-white font-semibold">Insights</h2>
            <div className="mt-4 grid gap-3 text-sm text-zinc-400">
              <div className="flex items-center justify-between">
                <span>Average score (last 7)</span>
                <span className="text-zinc-200">76</span>
              </div>
              <div className="flex items-center justify-between">
                <span>CTR improvement</span>
                <span className="text-emerald-300">+12%</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Top fix</span>
                <span className="text-zinc-200">Hierarchy + spacing</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/8 bg-zinc-950/80 p-5">
            <h2 className="text-white font-semibold">Suggestions</h2>
            <div className="mt-4 space-y-3">
              {[
                "Try a minimal variant for higher clarity.",
                "Export 1080x1350 for paid socials.",
                "Save this layout as a reusable template.",
              ].map((tip) => (
                <div key={tip} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-300">
                  {tip}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

    </main>
  );
}
