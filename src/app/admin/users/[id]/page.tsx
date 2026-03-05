"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";

interface GeneratedImageRow {
  id: string;
  filePath: string;
  variationName: string;
  requestId: string;
  aspectRatio: string;
  source: string;
  createdAt: string;
}

interface UserDetail {
  id: string;
  email: string | null;
  role: "admin" | "client";
  tier: "free" | "premium";
  createdAt: string;
  updatedAt: string;
  quotaResetAt: string;
  tokenBalance: number;
  premiumExpiresAt: string | null;
  generatedImages: GeneratedImageRow[];
}

function getImageUrl(filePath: string) {
  const filename = filePath.split(/[/\\]/).pop() || "";
  return `/api/admin/images?file=${encodeURIComponent(filename)}`;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("mn-MN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminUserDetailPage() {
  const { profile } = useAuth();
  const params = useParams<{ id: string }>();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<GeneratedImageRow | null>(
    null,
  );
  const [imageLoaded, setImageLoaded] = useState(false);
  const [generationLimit, setGenerationLimit] = useState<{
    free: number;
    paid: number;
  } | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showRenewModal, setShowRenewModal] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenAmount, setTokenAmount] = useState(1);
  const [upgrading, setUpgrading] = useState(false);

  const closeModal = useCallback(() => {
    setSelectedImage(null);
    setImageLoaded(false);
  }, []);

  useEffect(() => {
    if (profile?.role === "admin" && params.id) {
      fetchUser(params.id);
      fetchLimits();
    }
  }, [profile, params.id]);

  async function fetchLimits() {
    try {
      const res = await fetch("/api/admin/settings");
      if (res.ok) {
        const data = await res.json();
        setGenerationLimit({
          free: data.freeGenerationLimit,
          paid: data.paidGenerationLimit,
        });
      }
    } catch {}
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeModal();
    }
    if (selectedImage) {
      document.addEventListener("keydown", handleKey);
      return () => document.removeEventListener("keydown", handleKey);
    }
  }, [selectedImage, closeModal]);

  async function handleUpgrade() {
    if (!params.id) return;
    setUpgrading(true);
    try {
      const res = await fetch(`/api/admin/users/${params.id}/reset-quota`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upgrade: true }),
      });
      if (!res.ok) throw new Error("Ахиулахад алдаа гарлаа");
      const updated = await res.json();
      setUser((prev) =>
        prev
          ? {
              ...prev,
              tier: updated.tier,
              quotaResetAt: updated.quotaResetAt,
              premiumExpiresAt: updated.premiumExpiresAt,
            }
          : prev,
      );
      setShowUpgradeModal(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Алдаа гарлаа");
    } finally {
      setUpgrading(false);
    }
  }

  async function handleRenew() {
    if (!params.id) return;
    setUpgrading(true);
    try {
      const res = await fetch(`/api/admin/users/${params.id}/reset-quota`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upgrade: false }),
      });
      if (!res.ok) throw new Error("Эрх шинэчлэхэд алдаа гарлаа");
      const updated = await res.json();
      setUser((prev) =>
        prev
          ? {
              ...prev,
              tier: updated.tier,
              quotaResetAt: updated.quotaResetAt,
              premiumExpiresAt: updated.premiumExpiresAt,
            }
          : prev,
      );
      setShowRenewModal(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Алдаа гарлаа");
    } finally {
      setUpgrading(false);
    }
  }

  async function handleAddTokens() {
    if (!params.id || tokenAmount <= 0) return;
    setUpgrading(true);
    try {
      const res = await fetch(`/api/admin/users/${params.id}/add-tokens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: tokenAmount }),
      });
      if (!res.ok) throw new Error("Token нэмэхэд алдаа гарлаа");
      const updated = await res.json();
      setUser((prev) =>
        prev ? { ...prev, tokenBalance: updated.tokenBalance } : prev,
      );
      setShowTokenModal(false);
      setTokenAmount(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Алдаа гарлаа");
    } finally {
      setUpgrading(false);
    }
  }

  async function fetchUser(id: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("Хэрэглэгч олдсонгүй");
        throw new Error("Мэдээлэл авахад алдаа гарлаа");
      }
      const data = await res.json();
      setUser(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Алдаа гарлаа");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-sm text-zinc-500">Ачаалж байна...</p>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <p className="text-sm text-red-400">{error ?? "Хэрэглэгч олдсонгүй"}</p>
        <Link
          href="/admin/users"
          className="text-sm text-zinc-400 hover:text-zinc-200 transition"
        >
          Буцах
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* Back + Header */}
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition mb-6"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 19.5 8.25 12l7.5-7.5"
          />
        </svg>
        Хэрэглэгчид
      </Link>

      <div className="rounded-2xl border border-white/8 bg-zinc-950/80 p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/10 text-xl font-semibold text-zinc-300">
            {user.email?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-semibold text-white tracking-tight truncate">
              {user.email ?? "—"}
            </h1>
            <div className="mt-1.5 flex flex-col gap-2">
              <span className="text-xs text-zinc-500">
                Бүртгүүлсэн: {formatDate(user.createdAt)}
              </span>
              <span className="text-xs text-zinc-600">
                Эрх сунгагдсан: {formatDate(user.quotaResetAt)}
              </span>
              <span className="text-xs text-zinc-600">
                Эрх шинэчлэгдэлт:{" "}
                {formatDate(
                  new Date(
                    new Date(user.quotaResetAt).getTime() +
                      (user.tier === "premium" ? 30 : 7) * 24 * 60 * 60 * 1000,
                  ).toISOString(),
                )}{" "}
                ({user.tier === "premium" ? "30 хоног" : "7 хоног"})
              </span>
              {user.premiumExpiresAt && (
                <span
                  className={`text-xs ${new Date(user.premiumExpiresAt) > new Date() ? "text-emerald-400" : "text-red-400"}`}
                >
                  Premium:{" "}
                  {new Date(user.premiumExpiresAt) > new Date()
                    ? `${formatDate(user.premiumExpiresAt)} хүртэл`
                    : "хугацаа дууссан"}
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  user.role === "admin"
                    ? "bg-[#bde7ff]/15 text-[#bde7ff]"
                    : "bg-white/10 text-zinc-400"
                }`}
              >
                {user.role === "admin" ? "Admin" : "Client"}
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  user.tier === "premium"
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-white/10 text-zinc-400"
                }`}
              >
                {user.tier === "premium" ? "Premium" : "Free"}
              </span>
              <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
                Token: {user.tokenBalance}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {user.tier === "free" && (
              <button
                onClick={() => setShowUpgradeModal(true)}
                className="rounded-xl bg-emerald-500/90 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition"
              >
                Upgrade to Pro
              </button>
            )}
            <button
              onClick={() => setShowTokenModal(true)}
              className="rounded-xl bg-amber-500/90 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-500 transition"
            >
              Token нэмэх
            </button>
            <button
              onClick={() => setShowRenewModal(true)}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-white/10 transition"
            >
              Эрх шинэчлэх
            </button>
          </div>
        </div>
      </div>

      {/* Generated Images */}
      <div className="rounded-2xl border border-white/8 bg-zinc-950/80 overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-white font-semibold">Үүсгэсэн зургууд</h2>
          {(() => {
            const resetDate = new Date(user.quotaResetAt);
            const imagesAfterReset = user.generatedImages.filter(
              (img) => new Date(img.createdAt) >= resetDate,
            );
            const usedCount = new Set(
              imagesAfterReset.map((img) => img.requestId),
            ).size;
            const limit = generationLimit
              ? user.tier === "premium"
                ? generationLimit.paid
                : generationLimit.free
              : null;
            return (
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-500">
                  Эрх: {usedCount}
                  {limit !== null ? `/${limit}` : ""}
                </span>
                {limit !== null && (
                  <span
                    className={`text-xs font-medium ${usedCount >= limit ? "text-red-400" : "text-emerald-400"}`}
                  >
                    {usedCount >= limit
                      ? "Дууссан"
                      : `${limit - usedCount} үлдсэн`}
                  </span>
                )}
              </div>
            );
          })()}
        </div>

        {user.generatedImages.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-zinc-500">Зураг үүсгээгүй байна</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-[11px] tracking-[0.08em] uppercase text-zinc-500">
                <th className="px-5 py-3 text-left font-medium">Нэр</th>
                <th className="px-5 py-3 text-left font-medium">Эх сурвалж</th>
                <th className="px-5 py-3 text-left font-medium">Хэмжээ</th>
                <th className="px-5 py-3 text-left font-medium">Огноо</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {user.generatedImages.map((img) => (
                <tr
                  key={img.id}
                  onClick={() => setSelectedImage(img)}
                  className="hover:bg-white/2 transition cursor-pointer"
                >
                  <td className="px-5 py-4 text-zinc-200">
                    {img.variationName}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        img.source === "studio"
                          ? "bg-[#bde7ff]/15 text-[#bde7ff]"
                          : "bg-amber-500/15 text-amber-300"
                      }`}
                    >
                      {img.source === "studio" ? "Studio" : "API"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-zinc-400">{img.aspectRatio}</td>
                  <td className="px-5 py-4 text-zinc-500 text-xs">
                    {formatDate(img.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setShowUpgradeModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-white">Эрх ахиулах</h3>
            <p className="mt-1 text-sm text-zinc-400">
              {user.email} хэрэглэгчийн эрхийг Premium болгож, зураг үүсгэх
              лимитийг шинэчилнэ.
            </p>

            <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">Одоогийн эрх</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    user.tier === "premium"
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "bg-white/10 text-zinc-400"
                  }`}
                >
                  {user.tier === "premium" ? "Premium" : "Free"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">Ахиулах эрх</span>
                <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-500/15 text-emerald-300">
                  Premium
                </span>
              </div>
              {generationLimit && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Зургийн лимит</span>
                  <span className="text-sm text-zinc-300">
                    {user.tier === "premium"
                      ? generationLimit.paid
                      : generationLimit.free}{" "}
                    → {generationLimit.paid} удаа/сар
                  </span>
                </div>
              )}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-white/10 transition"
              >
                Болих
              </button>
              <button
                onClick={handleUpgrade}
                disabled={upgrading}
                className="flex-1 rounded-xl bg-emerald-500/90 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {upgrading ? "Ахиулж байна..." : "Баталгаажуулах"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Renew Quota Modal */}
      {showRenewModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setShowRenewModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-950 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-white">Эрх шинэчлэх</h3>
            <p className="mt-2 text-sm text-zinc-400">
              {user.email} хэрэглэгчийн зураг үүсгэх эрхийг шинэчилнэ.
            </p>

            {generationLimit && (
              <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Лимит</span>
                  <span className="text-sm font-semibold text-white">
                    {user.tier === "premium"
                      ? generationLimit.paid
                      : generationLimit.free}{" "}
                    удаа
                  </span>
                </div>
                <p className="text-xs text-zinc-500">
                  Эрх сэргээгдсэний дараа ашигласан тоо 0 болно.
                </p>
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowRenewModal(false)}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-white/10 transition"
              >
                Болих
              </button>
              <button
                onClick={handleRenew}
                disabled={upgrading}
                className="flex-1 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {upgrading ? "Сэргээж байна..." : "Сэргээх"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Tokens Modal */}
      {showTokenModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setShowTokenModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-950 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-white">Token нэмэх</h3>
            <p className="mt-2 text-sm text-zinc-400">
              {user.email} хэрэглэгчид token нэмнэ. 1 token = 1 удаа generate (4
              зураг).
            </p>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4">
                <span className="text-xs text-zinc-500">Одоогийн token</span>
                <span className="text-sm font-semibold text-amber-300">
                  {user.tokenBalance}
                </span>
              </div>
              <div>
                <label className="block text-[11px] tracking-[0.08em] uppercase text-zinc-500 mb-2">
                  Нэмэх тоо
                </label>
                <input
                  type="number"
                  min={1}
                  value={tokenAmount}
                  onChange={(e) =>
                    setTokenAmount(Math.max(1, parseInt(e.target.value) || 1))
                  }
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-200 outline-none focus:border-white/20 transition"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowTokenModal(false)}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-white/10 transition"
              >
                Болих
              </button>
              <button
                onClick={handleAddTokens}
                disabled={upgrading}
                className="flex-1 rounded-xl bg-amber-500/90 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {upgrading ? "Нэмж байна..." : `${tokenAmount} token нэмэх`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="relative mx-4 flex max-h-[90vh] max-w-3xl flex-col rounded-2xl border border-white/10 bg-zinc-950 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {selectedImage.variationName}
                </p>
                <p className="text-xs text-zinc-500">
                  {selectedImage.aspectRatio} &middot;{" "}
                  {selectedImage.source === "studio" ? "Studio" : "API"}{" "}
                  &middot; {formatDate(selectedImage.createdAt)}
                </p>
              </div>
              <button
                onClick={closeModal}
                className="ml-4 shrink-0 rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white transition"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18 18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Image */}
            <div className="flex items-center justify-center overflow-auto p-4 min-h-50">
              {!imageLoaded && (
                <p className="absolute text-sm text-zinc-500">
                  Ачаалж байна...
                </p>
              )}
              <Image
                src={getImageUrl(selectedImage.filePath)}
                alt={selectedImage.variationName}
                width={800}
                height={800}
                className={`max-h-[70vh] w-auto rounded-lg object-contain transition-opacity ${imageLoaded ? "opacity-100" : "opacity-0"}`}
                unoptimized
                onLoad={() => setImageLoaded(true)}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
