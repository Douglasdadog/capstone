"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { UserRole } from "@/lib/auth/roles";
import {
  createLocalWriteBackupSnapshot,
  clearLocalWriteBackups,
  getLocalWriteBackupCount,
  getLocalWriteBackups,
  getLocalWriteBackupSnapshots,
  installLocalWriteBackupInterceptor,
  onLocalWriteBackupUpdated,
  type LocalWriteBackupEntry,
  type LocalWriteBackupSnapshot
} from "@/lib/offline/local-write-backup";

const REDACTED = "***REDACTED***";
const SENSITIVE_KEYS = new Set([
  "password",
  "newpassword",
  "currentpassword",
  "confirmpassword",
  "secret",
  "device_secret",
  "token",
  "access_token",
  "refresh_token",
  "otp",
  "otpcode",
  "authorization",
  "apikey",
  "api_key"
]);

function sanitizeForExport(value: unknown, parentKey = ""): unknown {
  const normalizedKey = parentKey.toLowerCase();
  if (normalizedKey && SENSITIVE_KEYS.has(normalizedKey)) {
    return REDACTED;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForExport(item));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
      key,
      sanitizeForExport(nestedValue, key)
    ]);
    return Object.fromEntries(entries);
  }
  return value;
}

export default function TopNavbar() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [backupCount, setBackupCount] = useState(0);
  const [showBackups, setShowBackups] = useState(false);
  const [backups, setBackups] = useState<LocalWriteBackupEntry[]>([]);
  const [snapshots, setSnapshots] = useState<LocalWriteBackupSnapshot[]>([]);
  const [backupFilter, setBackupFilter] = useState<"today" | "7d" | "all">("all");
  const [backupSearch, setBackupSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [backupNotice, setBackupNotice] = useState<string | null>(null);
  const [backupNowSaving, setBackupNowSaving] = useState(false);
  const [restoreDryRunLoading, setRestoreDryRunLoading] = useState(false);
  const [restoreApplyLoading, setRestoreApplyLoading] = useState(false);
  const [restoreConfirmationText, setRestoreConfirmationText] = useState("");
  const isSuperAdmin = role === "SuperAdmin";

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
    if (!isSuperAdmin) return;
    setBackups(getLocalWriteBackups().slice().reverse());
    setSnapshots(getLocalWriteBackupSnapshots().slice().reverse());
    setBackupNotice(null);
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

  function exportDataAsJson(data: unknown, filenamePrefix: string) {
    const sanitized = sanitizeForExport(data);
    const blob = new Blob([JSON.stringify(sanitized, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${filenamePrefix}-${timestamp}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function handleExportSnapshot(snapshot: LocalWriteBackupSnapshot) {
    exportDataAsJson(snapshot, `wis-local-write-backup-snapshot-${snapshot.id}`);
  }

  async function handleExportFullBackupExcel() {
    const latest = getLocalWriteBackupSnapshots().slice().reverse()[0];
    const payload = latest?.serverData?.fullBackupPayload as
      | {
          backupVersion?: string;
          capturedAt?: string;
          warnings?: string[];
          counts?: Record<string, number>;
          modules?: {
            auth?: Record<string, unknown>;
            inventory?: Record<string, unknown>;
            logistics?: Record<string, unknown>;
            iot?: Record<string, unknown>;
            system?: Record<string, unknown>;
          };
        }
      | undefined;

    if (!payload) {
      setBackupNotice("No full backup payload found yet. Click 'Backup now' first.");
      return;
    }

    try {
      const safePayload = sanitizeForExport(payload) as typeof payload;
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      const MAX_COLUMN_WIDTH = 50;
      const MIN_COLUMN_WIDTH = 10;

      const normalizeCellValue = (value: unknown): string | number | boolean => {
        if (value === null || value === undefined) return "";
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
        return JSON.stringify(value);
      };

      const normalizeRows = (rows: unknown[]): Record<string, string | number | boolean>[] => {
        return rows.map((row) => {
          if (!row || typeof row !== "object" || Array.isArray(row)) {
            return { value: normalizeCellValue(row) };
          }
          const obj = row as Record<string, unknown>;
          return Object.fromEntries(
            Object.entries(obj).map(([key, value]) => [key, normalizeCellValue(value)])
          ) as Record<string, string | number | boolean>;
        });
      };

      const appendSheet = (sheetName: string, rows: unknown[]) => {
        const normalizedRows =
          rows.length > 0 ? normalizeRows(rows) : ([{ notice: "No data" }] as Record<string, string | number | boolean>[]);
        const worksheet = XLSX.utils.json_to_sheet(normalizedRows);
        const headers = Object.keys(normalizedRows[0] ?? {});
        if (headers.length > 0) {
          worksheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: headers.length - 1, r: 0 } }) };
          worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };
          worksheet["!cols"] = headers.map((header) => {
            const longestCell = normalizedRows.reduce((max, row) => {
              const text = String(row[header] ?? "");
              return Math.max(max, text.length);
            }, header.length);
            return { wch: Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, longestCell + 2)) };
          });
        }
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      };

      const summaryRows = [
        { field: "backupVersion", value: safePayload.backupVersion ?? "unknown" },
        { field: "capturedAt", value: safePayload.capturedAt ?? "unknown" },
        { field: "warningsCount", value: String(safePayload.warnings?.length ?? 0) }
      ];
      appendSheet("Summary", summaryRows);

      const countRows = Object.entries(safePayload.counts ?? {}).map(([key, value]) => ({
        metric: key,
        value
      }));
      appendSheet("Counts", countRows.length > 0 ? countRows : [{ metric: "none", value: 0 }]);

      const warningsRows = (safePayload.warnings ?? []).map((warning) => ({ warning }));
      appendSheet("Warnings", warningsRows.length > 0 ? warningsRows : [{ warning: "none" }]);

      const modules = safePayload.modules ?? {};
      const toRows = (value: unknown): unknown[] =>
        Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];

      const sheets: Array<{ name: string; rows: unknown[] }> = [
        { name: "Auth_SupabaseUsers", rows: toRows(modules.auth?.supabaseUsers) },
        { name: "Auth_SampleUsers", rows: toRows(modules.auth?.sampleUsers) },
        { name: "Auth_RegisteredUsers", rows: toRows(modules.auth?.registeredUsers) },
        { name: "Auth_MFARequests", rows: toRows(modules.auth?.mfaResetRequests) },
        { name: "Inventory", rows: toRows(modules.inventory?.inventory) },
        { name: "Manifests", rows: toRows(modules.inventory?.manifests) },
        { name: "Manifest_Items", rows: toRows(modules.inventory?.manifestItems) },
        { name: "Manifest_Reports", rows: toRows(modules.inventory?.manifestReports) },
        { name: "Manifest_ScanEvents", rows: toRows(modules.inventory?.manifestScanEvents) },
        { name: "Alerts", rows: toRows(modules.inventory?.alerts) },
        { name: "Sales_Orders", rows: toRows(modules.logistics?.salesOrders) },
        { name: "Shipments", rows: toRows(modules.logistics?.shipments) },
        { name: "Shipment_Items", rows: toRows(modules.logistics?.shipmentItems) },
        { name: "Tracking_Issues", rows: toRows(modules.logistics?.trackingIssues) },
        { name: "Sensor_Logs", rows: toRows(modules.iot?.sensorLogs) },
        { name: "Sensor_Alerts", rows: toRows(modules.iot?.sensorAlertNotifications) },
        { name: "Sensor_Config", rows: toRows(modules.iot?.sensorAlertConfig) },
        { name: "Idempotency_Keys", rows: toRows(modules.system?.idempotencyKeys) },
        {
          name: "Auth_Permissions",
          rows:
            modules.auth?.permissions && typeof modules.auth.permissions === "object"
              ? Object.entries(modules.auth.permissions as Record<string, unknown>).map(([email, routes]) => ({
                  email,
                  routes: JSON.stringify(routes)
                }))
              : []
        }
      ];

      for (const sheet of sheets) {
        appendSheet(sheet.name, sheet.rows);
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      XLSX.writeFile(workbook, `wis-full-backup-${timestamp}.xlsx`);
      setBackupNotice("Full backup Excel exported successfully.");
    } catch {
      setBackupNotice("Unable to export Excel backup. Please try again.");
    }
  }

  function handleClearBackups() {
    clearLocalWriteBackups();
    setBackups([]);
    setBackupCount(0);
    setBackupNotice("Local write backups cleared.");
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

  async function handleBackupNowAndExport() {
    setBackupNowSaving(true);
    try {
      const fullBackupRes = await fetch("/api/admin/backup/full");
      if (!fullBackupRes.ok) {
        const snapshot = createLocalWriteBackupSnapshot();
        setSnapshots(getLocalWriteBackupSnapshots().slice().reverse());
        setBackupNotice(
          `Backup saved locally at ${new Date(snapshot.createdAt).toLocaleString()} (${snapshot.entries.length} local write entries). Server snapshot unavailable.`
        );
        return;
      }
      const fullBackup = (await fullBackupRes.json()) as {
        capturedAt?: string;
        modules?: {
          inventory?: {
            inventory?: unknown[];
            alerts?: unknown[];
            manifestReports?: unknown[];
          };
          logistics?: {
            shipments?: unknown[];
            salesOrders?: unknown[];
            trackingIssues?: unknown[];
          };
          iot?: {
            sensorLogs?: unknown[];
          };
        };
      };
      const capturedAt = fullBackup.capturedAt ?? new Date().toISOString();
      const inventory = fullBackup.modules?.inventory?.inventory ?? [];
      const alerts = fullBackup.modules?.inventory?.alerts ?? [];
      const manifestReports = fullBackup.modules?.inventory?.manifestReports ?? [];
      const shipments = fullBackup.modules?.logistics?.shipments ?? [];
      const salesOrders = fullBackup.modules?.logistics?.salesOrders ?? [];
      const trackingIssues = fullBackup.modules?.logistics?.trackingIssues ?? [];
      const sensorLogs = fullBackup.modules?.iot?.sensorLogs ?? [];

      const snapshot = createLocalWriteBackupSnapshot({
        capturedAt,
        inventory,
        shipments,
        salesOrders,
        alerts,
        sensorLogs,
        manifestReports,
        trackingIssues,
        fullBackupPayload: fullBackup
      });
      setSnapshots(getLocalWriteBackupSnapshots().slice().reverse());
      exportDataAsJson(fullBackup, "wis-full-backup");
      setBackupNotice(
        `Backup saved and exported: ${snapshot.entries.length} local writes, ${snapshot.serverData?.salesOrders?.length ?? 0} sales orders, ${snapshot.serverData?.inventory?.length ?? 0} inventory rows, ${snapshot.serverData?.manifestReports?.length ?? 0} reports.`
      );
    } catch {
      const snapshot = createLocalWriteBackupSnapshot();
      setSnapshots(getLocalWriteBackupSnapshots().slice().reverse());
      setBackupNotice(
        `Backup saved locally at ${new Date(snapshot.createdAt).toLocaleString()} (${snapshot.entries.length} local write entries). Server snapshot failed.`
      );
    } finally {
      setBackupNowSaving(false);
    }
  }

  async function handleRestoreDryRun() {
    const latest = getLocalWriteBackupSnapshots().slice().reverse()[0];
    const payload = latest?.serverData?.fullBackupPayload;
    if (!payload) {
      setBackupNotice("No full backup payload found yet. Click 'Backup now' first.");
      return;
    }
    setRestoreDryRunLoading(true);
    try {
      const response = await fetch("/api/admin/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload,
          dryRun: true
        })
      });
      const data = (await response.json()) as { error?: string; validation?: { inventoryRows?: number; sensorConfigRows?: number } };
      if (!response.ok) {
        setBackupNotice(data.error ?? "Restore dry-run failed.");
        return;
      }
      setBackupNotice(
        `Restore dry-run OK. Inventory rows: ${data.validation?.inventoryRows ?? 0}, sensor config rows: ${data.validation?.sensorConfigRows ?? 0}.`
      );
    } catch {
      setBackupNotice("Restore dry-run failed. Please try again.");
    } finally {
      setRestoreDryRunLoading(false);
    }
  }

  async function handleRestoreApply() {
    const latest = getLocalWriteBackupSnapshots().slice().reverse()[0];
    const payload = latest?.serverData?.fullBackupPayload;
    if (!payload) {
      setBackupNotice("No full backup payload found yet. Click 'Backup now' first.");
      return;
    }
    setRestoreApplyLoading(true);
    try {
      const response = await fetch("/api/admin/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload,
          apply: true,
          confirmationText: restoreConfirmationText
        })
      });
      const data = (await response.json()) as {
        error?: string;
        result?: { restoredInventory?: number; restoredSensorConfig?: number };
      };
      if (!response.ok) {
        setBackupNotice(data.error ?? "Restore apply failed.");
        return;
      }
      setBackupNotice(
        `Restore applied. Inventory rows restored: ${data.result?.restoredInventory ?? 0}, sensor config rows: ${data.result?.restoredSensorConfig ?? 0}.`
      );
      setRestoreConfirmationText("");
    } catch {
      setBackupNotice("Restore apply failed. Please try again.");
    } finally {
      setRestoreApplyLoading(false);
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
          {isSuperAdmin ? (
            <button
              type="button"
              onClick={openBackups}
              className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm transition-colors hover:bg-emerald-100"
              title="View local write backups"
            >
              Backups ({backupCount})
            </button>
          ) : null}
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
      {showBackups && isSuperAdmin && typeof window !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/50 px-4 py-8"
              onClick={() => setShowBackups(false)}
            >
              <div className="flex min-h-full items-center justify-center">
                <div
                  className="relative w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
                  onClick={(event) => event.stopPropagation()}
                >
                <button
                  type="button"
                  onClick={() => setShowBackups(false)}
                  className="absolute right-3 top-3 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  aria-label="Close local backups modal"
                >
                  X
                </button>
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
                      onClick={() => void handleBackupNowAndExport()}
                      disabled={backupNowSaving}
                      className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-800 hover:bg-indigo-100"
                    >
                      {backupNowSaving ? "Backing up..." : "Backup + Export JSON"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleExportFullBackupExcel()}
                      className="rounded-md border border-green-300 bg-green-50 px-3 py-1.5 text-sm font-semibold text-green-800 hover:bg-green-100"
                    >
                      Export Excel
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRestoreDryRun()}
                      disabled={restoreDryRunLoading}
                      className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-60"
                    >
                      {restoreDryRunLoading ? "Validating..." : "Restore Dry-Run"}
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
                {backupNotice ? <p className="mt-2 text-xs text-indigo-700">{backupNotice}</p> : null}
                {role === "SuperAdmin" ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                    <p className="text-xs text-amber-800">Type RESTORE to enable apply:</p>
                    <input
                      value={restoreConfirmationText}
                      onChange={(event) => setRestoreConfirmationText(event.target.value)}
                      placeholder="RESTORE"
                      className="rounded-md border border-amber-300 bg-white px-2 py-1 text-xs text-slate-700"
                    />
                    <button
                      type="button"
                      onClick={() => void handleRestoreApply()}
                      disabled={restoreApplyLoading || restoreConfirmationText.trim() !== "RESTORE"}
                      className="rounded-md border border-amber-300 bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-200 disabled:opacity-60"
                    >
                      {restoreApplyLoading ? "Applying..." : "Apply Restore"}
                    </button>
                  </div>
                ) : null}
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-slate-800">Manual snapshots</h4>
                    <span className="text-xs text-slate-600">{snapshots.length} saved</span>
                  </div>
                  <div className="mt-2 max-h-28 overflow-auto">
                    {snapshots.length === 0 ? (
                      <p className="text-xs text-slate-500">No snapshots yet. Click &quot;Backup now&quot; to create one.</p>
                    ) : (
                      <ul className="space-y-1">
                        {snapshots.slice(0, 20).map((snapshot) => (
                          <li
                            key={snapshot.id}
                            className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2 py-1"
                          >
                            <span className="text-xs text-slate-700">
                          {new Date(snapshot.createdAt).toLocaleString()} ({snapshot.entries.length} local,{" "}
                          {snapshot.serverData?.salesOrders?.length ?? 0} sales,{" "}
                          {snapshot.serverData?.inventory?.length ?? 0} inventory,{" "}
                          {snapshot.serverData?.manifestReports?.length ?? 0} reports)
                            </span>
                            <button
                              type="button"
                              onClick={() => handleExportSnapshot(snapshot)}
                              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                            >
                              Export snapshot
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
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
                    Showing latest 200 entries in viewer.
                  </p>
                ) : null}
                </div>
              </div>
            </div>
          , document.body)
        : null}
    </header>
  );
}

