"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/auth-provider";

interface PaymentLogEntry {
  id: string;
  userId: string;
  action: string;
  prevTier: string;
  newTier: string;
  createdAt: string;
  profile: {
    email: string | null;
    tier: string;
  };
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

export default function PaymentHistoryPage() {
  const { profile } = useAuth();
  const [logs, setLogs] = useState<PaymentLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile || profile.role !== "admin") return;

    fetch("/api/admin/payment-history")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((data) => setLogs(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [profile]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-zinc-500 text-sm">Ачаалж байна...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-red-400 text-sm">Алдаа: {error}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white font-[var(--font-display)] tracking-tight">
          Төлбөрийн түүх
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Хэрэглэгчдийн эрх сунгасан болон ахиулсан бүртгэл
        </p>
      </div>

      {logs.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-zinc-950/80 p-12 text-center">
          <p className="text-zinc-500 text-sm">Түүх байхгүй байна</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/8 bg-zinc-950/80 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-left text-xs text-zinc-500 uppercase tracking-wider">
                <th className="px-5 py-3.5">Хэрэглэгч</th>
                <th className="px-5 py-3.5">Үйлдэл</th>
                <th className="px-5 py-3.5">Төлөв</th>
                <th className="px-5 py-3.5">Огноо</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-white/3 transition">
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/admin/users/${log.userId}`}
                      className="text-blue-400 hover:text-blue-300 transition"
                    >
                      {log.profile.email || "—"}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5">
                    {log.action === "upgrade" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
                        Ахиулсан
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-400">
                        Сунгасан
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    {log.action === "upgrade" ? (
                      <span className="text-xs font-medium">
                        <span className="text-zinc-400">{log.prevTier === "premium" ? "Premium" : "Free"}</span>
                        <span className="text-zinc-600 mx-1.5">→</span>
                        <span className="text-amber-400">Premium</span>
                      </span>
                    ) : (
                      <span className={`text-xs font-medium ${log.newTier === "premium" ? "text-amber-400" : "text-zinc-400"}`}>
                        {log.newTier === "premium" ? "Premium" : "Free"}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-zinc-400">
                    {formatDate(log.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
