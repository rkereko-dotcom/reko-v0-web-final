"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";

const sidebarLinks = [
  { label: "Dashboard", href: "/dashboard", icon: DashboardIcon },
  { label: "Хэрэглэгчид", href: "/admin/users", icon: UsersIcon },
];

function UsersIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
    </svg>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!loading && profile && profile.role !== "admin") {
      router.push("/dashboard");
    }
  }, [loading, profile, router]);

  if (loading || !user) {
    return (
      <main className="relative z-10 flex-1 px-6 pb-16 pt-8">
        <div className="mx-auto max-w-6xl flex items-center justify-center min-h-[50vh]">
          <p className="text-zinc-500 text-sm">Ачааллаж байна...</p>
        </div>
      </main>
    );
  }

  if (profile && profile.role !== "admin") {
    return null;
  }

  return (
    <div className="relative z-10 flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-white/8 bg-zinc-950/60">
        <div className="px-5 pt-6 pb-4">
          <p className="text-[11px] tracking-[0.08em] uppercase text-zinc-500">
            Admin panel
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white font-[var(--font-display)] tracking-tight">
            Reko
          </h2>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {sidebarLinks.map((link) => {
            const isActive = pathname.startsWith(link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? "bg-white/10 text-white"
                    : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                }`}
              >
                <Icon />
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/8 px-4 py-4">
          <p className="truncate text-xs text-zinc-500">{user?.email}</p>
          <button
            onClick={async () => {
              await signOut();
              router.push("/login");
            }}
            className="mt-2 text-xs text-zinc-500 hover:text-zinc-300 transition"
          >
            Гарах
          </button>
        </div>
      </aside>

      <main className="flex-1 px-8 pb-16 pt-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
