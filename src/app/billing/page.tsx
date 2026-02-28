import Link from "next/link";

export default function BillingPage() {
  return (
    <div className="min-h-screen gradient-bg px-6 py-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] tracking-[0.08em] normal-case text-zinc-500">Billing</p>
            <h1 className="text-2xl md:text-3xl font-semibold text-white font-[var(--font-display)] tracking-tight">
              Plan and usage
            </h1>
          </div>
          <Link href="/dashboard" className="text-xs uppercase tracking-[0.3em] text-zinc-500 hover:text-zinc-300">
            Back to dashboard
          </Link>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-zinc-950/80 p-6">
            <h2 className="text-white font-semibold text-lg">Current plan</h2>
            <p className="text-zinc-500 text-sm mt-2">Starter</p>
            <div className="mt-4 h-2 rounded-full bg-white/10">
              <div className="h-2 w-[60%] rounded-full bg-[#bde7ff]/70" />
            </div>
            <p className="text-xs text-zinc-500 mt-2">12 used, 8 remaining</p>
          </div>
          <div className="rounded-2xl border border-[#bde7ff]/40 bg-[#bde7ff]/10 p-6">
            <h2 className="text-white font-semibold text-lg">Upgrade</h2>
            <p className="text-zinc-300 text-sm mt-2">Unlock unlimited posters and team access.</p>
            <button className="mt-5 w-full rounded-xl bg-[#bde7ff] py-2.5 text-sm font-semibold text-black">
              Upgrade to Pro
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
