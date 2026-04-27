"use client";

import { useCallback, useEffect, useState } from "react";
import type { UserRole } from "@/lib/auth/roles";
import {
  flushQueuedTransactions,
  getQueuedTransactionCount,
  onOfflineQueueUpdated
} from "@/lib/offline/transaction-queue";

export default function TopNavbar() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);

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

  const handleSyncPending = useCallback(async () => {
    setSyncMessage(null);
    setSyncing(true);
    try {
      const result = await flushQueuedTransactions();
      setQueuedCount(getQueuedTransactionCount());
      if (result.total === 0) {
        setSyncMessage("No pending sync.");
      } else if (result.failed > 0) {
        setSyncMessage(`Synced ${result.synced}; ${result.failed} still pending.`);
      } else {
        setSyncMessage(`Synced all ${result.synced} pending change(s).`);
      }
    } catch {
      setSyncMessage("Sync failed. Try again.");
    } finally {
      setSyncing(false);
      window.setTimeout(() => setSyncMessage(null), 3500);
    }
  }, []);

  useEffect(() => {
    setQueuedCount(getQueuedTransactionCount());
    setIsOnline(window.navigator.onLine);
    const offQueueListener = onOfflineQueueUpdated(() => {
      setQueuedCount(getQueuedTransactionCount());
    });
    const onOnline = () => {
      setIsOnline(true);
      if (!syncing && getQueuedTransactionCount() > 0) {
        void handleSyncPending();
      }
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      offQueueListener();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [handleSyncPending, syncing]);

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
            onClick={() => void handleSyncPending()}
            disabled={syncing || queuedCount === 0 || !isOnline}
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 shadow-sm transition-colors hover:bg-amber-100 disabled:opacity-50"
            type="button"
            title={queuedCount > 0 ? `${queuedCount} pending offline changes` : "No pending offline changes"}
          >
            {syncing ? "Syncing..." : `Sync (${queuedCount})`}
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
      {syncMessage ? (
        <div className="mx-auto w-full max-w-[1500px] px-6 pb-2">
          <p className="text-xs text-amber-800">{syncMessage}</p>
        </div>
      ) : null}
    </header>
  );
}

