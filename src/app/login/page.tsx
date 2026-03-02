"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const { user, profile, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && user && profile) {
      router.push(profile.role === "admin" ? "/admin" : "/dashboard");
    }
  }, [authLoading, user, profile, router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Fetch profile to check role and redirect accordingly
    const res = await fetch("/api/profile");
    if (res.ok) {
      const profile = await res.json();
      router.push(profile.role === "admin" ? "/admin" : "/dashboard");
    } else {
      router.push("/dashboard");
    }
  }

  return (
    <div className="min-h-screen gradient-bg px-6 py-10">
      <div className="max-w-md mx-auto">
        <Link href="/" className="text-xs uppercase tracking-[0.3em] text-zinc-500 hover:text-zinc-300">
          Back
        </Link>
        <div className="mt-6 rounded-3xl border border-white/10 bg-zinc-950/80 p-6">
          <h1 className="text-2xl font-semibold text-white font-[var(--font-display)] tracking-tight">
            Нэвтрэх
          </h1>
          <p className="text-zinc-500 text-sm mt-2">Dashboard болон poster library-д хандах.</p>

          <div className="mt-6 space-y-4">
            <button className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-white/10">
              Continue with Google
            </button>
            <button className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-white/10">
              Continue with Apple
            </button>
          </div>

          <div className="my-6 h-px bg-white/10" />

          <form onSubmit={handleLogin} className="space-y-4">
            <label className="block text-xs uppercase tracking-[0.2em] text-zinc-500">
              Имэйл
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                required
                className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
              />
            </label>

            <label className="block text-xs uppercase tracking-[0.2em] text-zinc-500">
              Нууц үг
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
              />
            </label>

            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[#bde7ff] py-2.5 text-sm font-semibold text-black disabled:opacity-50"
            >
              {loading ? "Нэвтэрч байна..." : "Нэвтрэх"}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-zinc-500">
            Бүртгэлгүй юу?{" "}
            <Link href="/register" className="text-[#bde7ff] hover:underline">
              Бүртгүүлэх
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
