"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AuditActionBadge from "@/components/audit-action-badge";

type AlertRow = {
  id: string;
  created_at: string;
  status?: string;
  message?: string;
  item_name?: string;
};

type ActivityRow = {
  id: string;
  created_at: string;
  action: string;
  actor_email: string;
  actor_name: string;
  actor_ip: string;
  target_module: string;
  target_id?: string | null;
};

export default function AuditLogsPage() {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("/api/dashboard/audit-log");
        const data = (await response.json()) as { alerts?: AlertRow[]; activities?: ActivityRow[]; error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? "Unable to load audit log.");
        }
        setAlerts(data.alerts ?? []);
        setActivities(data.activities ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unable to load audit log.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  if (loading) {
    return (
      <section className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
        <div className="h-96 animate-pulse rounded-xl border border-slate-100 bg-white shadow-sm" />
      </section>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
        {error}
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">System-wide audit log</h1>
          <p className="mt-1 text-sm text-slate-600">Full history of replenishment and system events.</p>
        </div>
        <Link
          href="/dashboard"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Back to dashboard
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-4 py-3 font-semibold">Timestamp</th>
                <th className="px-4 py-3 font-semibold">Action</th>
                <th className="px-4 py-3 font-semibold">Actor</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">IP Address</th>
                <th className="px-4 py-3 font-semibold">Module</th>
              </tr>
            </thead>
            <tbody>
              {(activities.length > 0
                ? activities.map((row) => ({
                    ...row,
                    status: "Logged",
                    message: row.action
                  }))
                : alerts
              ).map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5">
                    <AuditActionBadge status={row.status} message={row.message} />
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">{("actor_name" in row ? row.actor_name : "—") || "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-700">
                    {"actor_email" in row ? row.actor_email : "—"}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-700">
                    {"actor_ip" in row ? row.actor_ip : "—"}
                  </td>
                  <td className="max-w-xs px-4 py-2.5 text-slate-700 break-words whitespace-normal">
                    {"target_module" in row ? row.target_module : row.item_name ?? "—"}
                  </td>
                </tr>
              ))}
              {alerts.length === 0 && activities.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={7}>
                    No log entries yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
