"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Нууц үг таарахгүй байна.");
      return;
    }

    if (password.length < 6) {
      setError("Нууц үг хамгийн багадаа 6 тэмдэгт байх ёстой.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen gradient-bg px-6 py-10">
      <div className="max-w-md mx-auto">
        <Link href="/" className="text-xs uppercase tracking-[0.3em] text-zinc-500 hover:text-zinc-300">
          Back
        </Link>
        <div className="mt-6 rounded-3xl border border-white/10 bg-zinc-950/80 p-6">
          <h1 className="text-2xl font-semibold text-white font-[var(--font-display)] tracking-tight">
            Бүртгүүлэх
          </h1>
          <p className="text-zinc-500 text-sm mt-2">Шинэ хаяг үүсгэж үйлчилгээ авч эхлээрэй.</p>

          {success ? (
            <div className="mt-6 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
              <p className="text-sm text-emerald-300">
                Амжилттай бүртгүүллээ!
              </p>
              <Link
                href="/login"
                className="mt-3 inline-block text-sm text-[#bde7ff] hover:underline"
              >
                Нэвтрэх
              </Link>
            </div>
          ) : (
            <>
              <form onSubmit={handleRegister} className="mt-6 space-y-4">
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

                <label className="block text-xs uppercase tracking-[0.2em] text-zinc-500">
                  Нууц үг давтах
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
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
                  {loading ? "Бүртгүүлж байна..." : "Бүртгүүлэх"}
                </button>
              </form>

              <p className="mt-4 text-center text-sm text-zinc-500">
                Бүртгэлтэй юу?{" "}
                <Link href="/login" className="text-[#bde7ff] hover:underline">
                  Нэвтрэх
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
