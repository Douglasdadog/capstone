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
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="flex items-center justify-between px-6 py-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Warehouse Information System</h1>
          {email ? <p className="text-xs text-slate-500">{email}</p> : null}
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
            Role: {role ?? "Unknown"}
          </span>
          <button
            onClick={handleLogout}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
            type="button"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
