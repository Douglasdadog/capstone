"use client";

import { useCallback, useEffect, useState } from "react";

type ManifestReportRow = {
  id: string;
  manifest_id: string;
  reason: string;
  comments: string | null;
  reported_by: string;
  created_at: string;
  file_name: string | null;
};

export default function AdminReportsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [reports, setReports] = useState<ManifestReportRow[]>([]);

  const loadReports = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/admin/manifests/reports");
    const payload = (await response.json()) as {
      error?: string;
      warning?: string;
      reports?: ManifestReportRow[];
    };
    if (!response.ok) {
      setError(payload.error ?? "Unable to load discrepancy reports.");
      setLoading(false);
      return;
    }
    setError(null);
    setWarning(payload.warning ?? null);
    setReports(payload.reports ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  return (
    <section className="space-y-4 rounded-2xl border border-white/60 bg-white/90 p-6 shadow-sm backdrop-blur">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900">Discrepancy Reports</h1>
          <p className="mt-1 text-sm text-slate-600">
            Reports submitted by scanning teams for Admin and SuperAdmin review.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadReports()}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {warning ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">{warning}</p>
      ) : null}
      {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-3 py-2">Reported At</th>
              <th className="px-3 py-2">Manifest File</th>
              <th className="px-3 py-2">Reason</th>
              <th className="px-3 py-2">Comments</th>
              <th className="px-3 py-2">Reported By</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-4 text-slate-500" colSpan={5}>
                  Loading reports...
                </td>
              </tr>
            ) : reports.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-slate-500" colSpan={5}>
                  No discrepancy reports yet.
                </td>
              </tr>
            ) : (
              reports.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-600">{new Date(row.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2 font-medium text-slate-800">{row.file_name || row.manifest_id}</td>
                  <td className="px-3 py-2 text-red-700">{row.reason}</td>
                  <td className="px-3 py-2 text-slate-700">{row.comments || "-"}</td>
                  <td className="px-3 py-2 text-slate-600">{row.reported_by}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
