"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";

interface UserRow {
  id: string;
  email: string | null;
  role: "admin" | "client";
  tier: "free" | "premium";
  createdAt: string;
  updatedAt: string;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("mn-MN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function AdminUsersPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (profile?.role === "admin") {
      fetchUsers();
    }
  }, [profile]);

  async function fetchUsers() {
    setFetchLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) {
        throw new Error("Хэрэглэгчдийн мэдээлэл авахад алдаа гарлаа");
      }
      const data = await res.json();
      setUsers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Алдаа гарлаа");
    } finally {
      setFetchLoading(false);
    }
  }

  const filteredUsers = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.email?.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q) ||
      u.tier.toLowerCase().includes(q)
    );
  });

  const stats = {
    total: users.length,
    admins: users.filter((u) => u.role === "admin").length,
    premium: users.filter((u) => u.tier === "premium").length,
  };

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <p className="text-[11px] tracking-[0.08em] uppercase text-zinc-500">
          Удирдлагын самбар
        </p>
        <h1 className="text-3xl md:text-4xl font-semibold text-white font-[var(--font-display)] tracking-tight">
          Хэрэглэгчид
        </h1>
      </div>

      {/* Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/8 bg-zinc-950/80 p-5">
          <p className="text-[11px] tracking-[0.08em] uppercase text-zinc-500">
            Нийт хэрэглэгч
          </p>
          <div className="mt-2 text-3xl font-semibold text-white">
            {stats.total}
          </div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-zinc-950/80 p-5">
          <p className="text-[11px] tracking-[0.08em] uppercase text-zinc-500">
            Админ
          </p>
          <div className="mt-2 text-3xl font-semibold text-white">
            {stats.admins}
          </div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-zinc-950/80 p-5">
          <p className="text-[11px] tracking-[0.08em] uppercase text-zinc-500">
            Premium
          </p>
          <div className="mt-2 text-3xl font-semibold text-white">
            {stats.premium}
          </div>
        </div>
      </div>

      {/* Search + table */}
      <div className="rounded-2xl border border-white/8 bg-zinc-950/80 overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-white font-semibold">Бүх хэрэглэгчид</h2>
          <input
            type="text"
            placeholder="Хайх..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-white/20 w-56"
          />
        </div>

        {fetchLoading ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-zinc-500">Ачааллаж байна...</p>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-zinc-500">Хэрэглэгч олдсонгүй</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-[11px] tracking-[0.08em] uppercase text-zinc-500">
                <th className="px-5 py-3 text-left font-medium">Имэйл</th>
                <th className="px-5 py-3 text-left font-medium">Эрх</th>
                <th className="px-5 py-3 text-left font-medium">Төлбөр</th>
                <th className="px-5 py-3 text-left font-medium">Бүртгүүлсэн</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredUsers.map((u) => (
                <tr key={u.id} onClick={() => router.push(`/admin/users/${u.id}`)} className="hover:bg-white/2 transition cursor-pointer">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-zinc-300">
                        {u.email?.[0]?.toUpperCase() ?? "?"}
                      </div>
                      <span className="truncate text-zinc-200">
                        {u.email ?? "—"}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        u.role === "admin"
                          ? "bg-[#bde7ff]/15 text-[#bde7ff]"
                          : "bg-white/10 text-zinc-400"
                      }`}
                    >
                      {u.role === "admin" ? "Admin" : "Client"}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        u.tier === "premium"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-white/10 text-zinc-400"
                      }`}
                    >
                      {u.tier === "premium" ? "Premium" : "Free"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-zinc-500 text-xs">
                    {formatDate(u.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
