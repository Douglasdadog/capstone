"use client";

import { useEffect, useMemo, useState } from "react";
import type { UserRole } from "@/lib/auth/roles";
import {
  clearLocalWriteBackups,
  getLocalWriteBackupCount,
  getLocalWriteBackups,
  installLocalWriteBackupInterceptor,
  onLocalWriteBackupUpdated,
  type LocalWriteBackupEntry
} from "@/lib/offline/local-write-backup";

export default function TopNavbar() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [backupCount, setBackupCount] = useState(0);
  const [showBackups, setShowBackups] = useState(false);
  const [backups, setBackups] = useState<LocalWriteBackupEntry[]>([]);
  const [backupFilter, setBackupFilter] = useState<"today" | "7d" | "all">("all");
  const [backupSearch, setBackupSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  useEffect(() => {
    installLocalWriteBackupInterceptor();
    setBackupCount(getLocalWriteBackupCount());
    const unsubscribe = onLocalWriteBackupUpdated(() => {
      setBackupCount(getLocalWriteBackupCount());
    });
    return unsubscribe;
  }, []);

  function openBackups() {
    setBackups(getLocalWriteBackups().slice().reverse());
    setShowBackups(true);
  }

  const filteredBackups = useMemo(() => {
    const now = Date.now();
    const search = backupSearch.trim().toLowerCase();
    return backups
      .filter((entry) => {
        if (backupFilter === "all") return true;
        const createdAtMs = new Date(entry.createdAt).getTime();
        if (Number.isNaN(createdAtMs)) return false;
        if (backupFilter === "today") {
          const startOfToday = new Date();
          startOfToday.setHours(0, 0, 0, 0);
          return createdAtMs >= startOfToday.getTime();
        }
        return now - createdAtMs <= 7 * 24 * 60 * 60 * 1000;
      })
      .filter((entry) => {
        if (!search) return true;
        const payload = JSON.stringify(entry.body ?? "").toLowerCase();
        return (
          entry.method.toLowerCase().includes(search) ||
          entry.url.toLowerCase().includes(search) ||
          payload.includes(search)
        );
      });
  }, [backups, backupFilter, backupSearch]);

  function handleExportBackups() {
    const data = getLocalWriteBackups();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `wis-local-write-backups-${timestamp}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function handleClearBackups() {
    clearLocalWriteBackups();
    setBackups([]);
    setBackupCount(0);
  }

  async function handleCopyPayload(entry: LocalWriteBackupEntry) {
    try {
      const text = JSON.stringify(entry.body, null, 2);
      await navigator.clipboard.writeText(text);
      setCopiedId(entry.id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      setCopiedId(null);
    }
  }

  return (
    <header className="sticky top-0 z-20 border-b border-white/50 bg-white/70 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1500px] items-center justify-between px-6 py-3">
        <div className="flex items-center gap-3">
          <p className="text-xl font-black italic leading-none text-red-600">imarflex.</p>
          <div>
          <h1 className="bg-gradient-to-r from-slate-900 via-amber-900 to-red-700 bg-clip-text text-lg font-bold text-transparent">
            Warehouse Information System
          </h1>
          {email ? <p className="text-xs text-slate-500">{email}</p> : null}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={openBackups}
            className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm transition-colors hover:bg-emerald-100"
            title="View local write backups"
          >
            Backups ({backupCount})
          </button>
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
      {showBackups ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
          <div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Local write backups</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Saved API write payloads from this browser. Total entries: {backupCount}, filtered:{" "}
                  {filteredBackups.length}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportBackups}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Export JSON
                </button>
                <button
                  type="button"
                  onClick={handleClearBackups}
                  className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-100"
                >
                  Clear local
                </button>
                <button
                  type="button"
                  onClick={() => setShowBackups(false)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <label className="text-xs font-medium text-slate-700">Range</label>
              <select
                value={backupFilter}
                onChange={(event) => setBackupFilter(event.target.value as "today" | "7d" | "all")}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
              >
                <option value="all">All</option>
                <option value="7d">Last 7 days</option>
                <option value="today">Today</option>
              </select>
              <input
                value={backupSearch}
                onChange={(event) => setBackupSearch(event.target.value)}
                placeholder="Search endpoint/method/payload"
                className="min-w-[280px] flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700"
              />
            </div>
            <div className="mt-4 max-h-[60vh] overflow-auto rounded-xl border border-slate-200 bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">API</th>
                    <th className="px-4 py-3">Payload</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBackups.slice(0, 200).map((entry) => (
                    <tr key={entry.id} className="border-t border-slate-100 align-top">
                      <td className="px-4 py-3 whitespace-nowrap">{new Date(entry.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-3 font-semibold text-slate-700">{entry.method}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">{entry.url}</td>
                      <td className="px-4 py-3">
                        <pre className="max-w-[460px] overflow-auto rounded bg-slate-50 p-2 text-xs text-slate-700">
                          {JSON.stringify(entry.body, null, 2)}
                        </pre>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => void handleCopyPayload(entry)}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                        >
                          {copiedId === entry.id ? "Copied" : "Copy payload"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredBackups.length === 0 ? (
                    <tr>
                      <td className="px-4 py-5 text-slate-500" colSpan={5}>
                        No matching local backups.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {filteredBackups.length > 200 ? (
              <p className="mt-2 text-xs text-slate-500">
                Showing latest 200 entries in viewer. Export JSON includes all stored entries.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </header>
  );
}

