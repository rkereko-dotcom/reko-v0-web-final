import Link from "next/link";

export default function LoginPage() {
  return (
    <div className="min-h-screen gradient-bg px-6 py-10">
      <div className="max-w-md mx-auto">
        <Link href="/" className="text-xs uppercase tracking-[0.3em] text-zinc-500 hover:text-zinc-300">
          Back
        </Link>
        <div className="mt-6 rounded-3xl border border-white/10 bg-zinc-950/80 p-6">
          <h1 className="text-2xl font-semibold text-white font-[var(--font-display)] tracking-tight">
            Login to Reko
          </h1>
          <p className="text-zinc-500 text-sm mt-2">Access your dashboard and poster library.</p>

          <div className="mt-6 space-y-4">
            <button className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-white/10">
              Continue with Google
            </button>
            <button className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-white/10">
              Continue with Apple
            </button>
          </div>

          <div className="my-6 h-px bg-white/10" />

          <label className="block text-xs uppercase tracking-[0.2em] text-zinc-500">
            Email
            <input
              type="email"
              placeholder="you@email.com"
              className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
            />
          </label>
          <button className="mt-4 w-full rounded-xl bg-[#bde7ff] py-2.5 text-sm font-semibold text-black">
            Send magic link
          </button>
        </div>
      </div>
    </div>
  );
}
