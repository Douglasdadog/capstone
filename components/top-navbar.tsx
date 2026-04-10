"use client";

import { useEffect, useState } from "react";
import type { UserRole } from "@/lib/auth/roles";

export default function TopNavbar() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    async function loadSession() {
      const response = await fetch("/api/auth/session");
      if (!response.ok) return;
      const data = (await response.json()) as { role?: UserRole; email?: string };
      setRole(data.role ?? null);
      setEmail(data.email ?? null);
    }
    void loadSession();
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/demo-logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <header className="sticky top-0 z-20 border-b border-white/50 bg-white/70 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1500px] items-center justify-between px-6 py-3">
        <div className="flex items-center gap-3">
          <p className="text-xl font-black italic leading-none text-red-600">imarflex.</p>
          <div>
          <h1 className="bg-gradient-to-r from-slate-900 via-blue-900 to-red-700 bg-clip-text text-lg font-bold text-transparent">
            Warehouse Information System
          </h1>
          {email ? <p className="text-xs text-slate-500">{email}</p> : null}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
            Role: {role ?? "Unknown"}
          </span>
          <button
            onClick={handleLogout}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-100"
            type="button"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
