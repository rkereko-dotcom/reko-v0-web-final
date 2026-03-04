"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";

interface SiteSettings {
  siteName: string;
  tabTitle: string;
  freeGenerationLimit: number;
  paidGenerationLimit: number;
  premiumMonthlyPrice: number;
}

export default function AdminSettingsPage() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [siteName, setSiteName] = useState("");
  const [tabTitle, setTabTitle] = useState("");
  const [freeLimit, setFreeLimit] = useState(0);
  const [paidLimit, setPaidLimit] = useState(0);
  const [monthlyPrice, setMonthlyPrice] = useState(0);

  useEffect(() => {
    if (profile?.role === "admin") {
      fetchSettings();
    }
  }, [profile]);

  async function fetchSettings() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings");
      if (!res.ok) throw new Error("Тохиргоо ачаалахад алдаа гарлаа");
      const data: SiteSettings = await res.json();
      setSiteName(data.siteName);
      setTabTitle(data.tabTitle);
      setFreeLimit(data.freeGenerationLimit);
      setPaidLimit(data.paidGenerationLimit);
      setMonthlyPrice(data.premiumMonthlyPrice);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Алдаа гарлаа");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteName,
          tabTitle,
          freeGenerationLimit: freeLimit,
          paidGenerationLimit: paidLimit,
          premiumMonthlyPrice: monthlyPrice,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Хадгалахад алдаа гарлаа");
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Алдаа гарлаа");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <p className="text-[11px] tracking-[0.08em] uppercase text-zinc-500">
          Удирдлагын самбар
        </p>
        <h1 className="text-3xl md:text-4xl font-semibold text-white font-[var(--font-display)] tracking-tight">
          Тохиргоо
        </h1>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <p className="text-sm text-zinc-500">Ачаалж байна...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Site Info */}
          <div className="rounded-2xl border border-white/8 bg-zinc-950/80 overflow-hidden">
            <div className="border-b border-white/10 px-5 py-4">
              <h2 className="text-white font-semibold">Вэбсайтын мэдээлэл</h2>
              <p className="text-xs text-zinc-500 mt-1">
                Вэбсайтын нэр болон browser tab дээр харагдах нэрийг тохируулна
              </p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[11px] tracking-[0.08em] uppercase text-zinc-500 mb-2">
                  Вэбийн нэр
                </label>
                <input
                  type="text"
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-white/20 transition"
                  placeholder="Reko"
                />
              </div>
              <div>
                <label className="block text-[11px] tracking-[0.08em] uppercase text-zinc-500 mb-2">
                  Tab bar нэр
                </label>
                <input
                  type="text"
                  value={tabTitle}
                  onChange={(e) => setTabTitle(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-white/20 transition"
                  placeholder="Reko - AI Poster Generator"
                />
              </div>
            </div>
          </div>

          {/* Generation Limits */}
          <div className="rounded-2xl border border-white/8 bg-zinc-950/80 overflow-hidden">
            <div className="border-b border-white/10 px-5 py-4">
              <h2 className="text-white font-semibold">Зураг үүсгэх лимит</h2>
              <p className="text-xs text-zinc-500 mt-1">
                Хэрэглэгчийн төрөл бүрт зураг үүсгэх хязгаарыг тохируулна
              </p>
            </div>
            <div className="p-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-[11px] tracking-[0.08em] uppercase text-zinc-500 mb-2">
                  Үнэгүй хэрэглэгчийн лимит
                </label>
                <input
                  type="number"
                  min={0}
                  value={freeLimit}
                  onChange={(e) => setFreeLimit(parseInt(e.target.value) || 0)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-white/20 transition"
                />
                <p className="text-[11px] text-zinc-600 mt-1.5">Нийт generate хийх боломжтой удаа (1 удаа = 4 зураг)</p>
              </div>
              <div>
                <label className="block text-[11px] tracking-[0.08em] uppercase text-zinc-500 mb-2">
                  Төлбөртэй хэрэглэгчийн лимит
                </label>
                <input
                  type="number"
                  min={0}
                  value={paidLimit}
                  onChange={(e) => setPaidLimit(parseInt(e.target.value) || 0)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-white/20 transition"
                />
                <p className="text-[11px] text-zinc-600 mt-1.5">Сард generate хийх боломжтой удаа (1 удаа = 4 зураг)</p>
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="rounded-2xl border border-white/8 bg-zinc-950/80 overflow-hidden">
            <div className="border-b border-white/10 px-5 py-4">
              <h2 className="text-white font-semibold">Үнийн тохиргоо</h2>
              <p className="text-xs text-zinc-500 mt-1">
                Premium эрхийн сарын төлбөрийг тохируулна
              </p>
            </div>
            <div className="p-5">
              <div>
                <label className="block text-[11px] tracking-[0.08em] uppercase text-zinc-500 mb-2">
                  Сарын төлбөр (₮)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    value={monthlyPrice}
                    onChange={(e) => setMonthlyPrice(parseInt(e.target.value) || 0)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 pr-10 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-white/20 transition"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">₮</span>
                </div>
                <p className="text-[11px] text-zinc-600 mt-1.5">
                  {monthlyPrice.toLocaleString("mn-MN")}₮ / сар
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Хадгалж байна..." : "Хадгалах"}
            </button>

            {success && (
              <p className="text-sm text-emerald-400">Амжилттай хадгалагдлаа</p>
            )}
            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
