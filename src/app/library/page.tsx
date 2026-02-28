import Link from "next/link";

const items = [
  { name: "Launch teaser", score: 78, date: "Jan 24" },
  { name: "Product offer", score: 64, date: "Jan 22" },
  { name: "Event invite", score: 71, date: "Jan 21" },
];

export default function LibraryPage() {
  return (
    <div className="min-h-screen gradient-bg px-6 py-10">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] tracking-[0.08em] normal-case text-zinc-500">Library</p>
            <h1 className="text-2xl md:text-3xl font-semibold text-white font-[var(--font-display)] tracking-tight">
              Poster history
            </h1>
          </div>
          <Link href="/dashboard" className="text-xs uppercase tracking-[0.3em] text-zinc-500 hover:text-zinc-300">
            Back to dashboard
          </Link>
        </div>

        <div className="mt-6 rounded-3xl border border-white/10 bg-zinc-950/80 overflow-hidden">
          <div className="grid gap-3 px-5 py-4 border-b border-white/10 text-xs uppercase tracking-[0.2em] text-zinc-500 sm:grid-cols-[1.4fr,0.5fr,0.5fr]">
            <span>Poster</span>
            <span>Score</span>
            <span>Date</span>
          </div>
          {items.map((item) => (
            <div key={item.name} className="grid gap-3 px-5 py-4 text-sm text-zinc-300 sm:grid-cols-[1.4fr,0.5fr,0.5fr] border-b border-white/5">
              <span className="text-zinc-200">{item.name}</span>
              <span>{item.score}</span>
              <span className="text-zinc-500">{item.date}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
