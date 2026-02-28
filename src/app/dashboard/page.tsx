"use client";

import Link from "next/link";

export default function DashboardPage() {
  return (
    <main className="relative z-10 flex-1 px-6 pb-16 pt-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] tracking-[0.08em] normal-case text-zinc-500">Your workspace</p>
            <h1 className="text-3xl md:text-4xl font-semibold text-white font-[var(--font-display)] tracking-tight">
              User dashboard
            </h1>
          </div>
          <div className="flex gap-2">
            <Link
              href="/studio"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/10"
            >
              Go to Studio
            </Link>
            <button className="rounded-full bg-[#bde7ff] px-4 py-2 text-sm font-semibold text-black shadow-[0_12px_30px_-20px_rgba(140,215,255,0.6)]">
              Upgrade plan
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
            <p className="text-[11px] tracking-[0.08em] normal-case text-zinc-500">This month</p>
            <div className="mt-3 text-3xl font-semibold text-white">12</div>
            <p className="mt-1 text-sm text-zinc-500">Posters generated</p>
            <div className="mt-4 h-2 w-full rounded-full bg-white/10">
              <div className="h-2 w-2/3 rounded-full bg-[#bde7ff]/70" />
            </div>
            <p className="mt-2 text-xs text-zinc-500">8 remaining on Starter</p>
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
              Active: Reko Studio (Fonts, colors, logo)
            </div>
            <button className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/15">
              Manage brand kits
            </button>
          </div>

          <div className="rounded-2xl border border-white/8 bg-zinc-950/80 p-5 space-y-4">
            <h2 className="text-white font-semibold">Plan & usage</h2>
            <p className="text-sm text-zinc-500">Pro — $39 / month</p>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-200">Monthly limit</span>
                <span className="text-zinc-400">Unlimited</span>
              </div>
              <p className="mt-2 text-xs text-zinc-500">Next bill: Feb 28</p>
            </div>
            <button className="w-full rounded-xl bg-[#bde7ff] py-2.5 text-sm font-semibold text-black">
              Manage subscription
            </button>
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
