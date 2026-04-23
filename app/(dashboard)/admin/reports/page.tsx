"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ManifestReportRow = {
  id: string;
  manifest_id: string;
  reason: string;
  comments: string | null;
  reported_by: string;
  created_at: string;
  file_name: string | null;
};

type TrackingIssueRow = {
  id: number;
  shipment_id: string;
  issue_type: string;
  message: string | null;
  contact_email: string | null;
  created_at: string;
  tracking_number: string | null;
  client_name: string | null;
  client_email: string | null;
  destination: string | null;
};

export default function AdminReportsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reports, setReports] = useState<ManifestReportRow[]>([]);
  const [issues, setIssues] = useState<TrackingIssueRow[]>([]);

  const loadReports = useCallback(async () => {
    setLoading(true);
    const [manifestResponse, issueResponse] = await Promise.all([
      fetch("/api/admin/manifests/reports"),
      fetch("/api/admin/tracking-issues")
    ]);
    const manifestPayload = (await manifestResponse.json()) as {
      error?: string;
      reports?: ManifestReportRow[];
    };
    const issuePayload = (await issueResponse.json()) as {
      error?: string;
      issues?: TrackingIssueRow[];
    };
    if (!manifestResponse.ok) {
      setError(manifestPayload.error ?? "Unable to load discrepancy reports.");
      setLoading(false);
      return;
    }
    if (!issueResponse.ok) {
      setError(issuePayload.error ?? "Unable to load customer tracking reports.");
      setLoading(false);
      return;
    }
    setError(null);
    setReports(manifestPayload.reports ?? []);
    setIssues(issuePayload.issues ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  useEffect(() => {
    const channel = supabase
      .channel("tracking-issues-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "tracking_issues" }, () => {
        void loadReports();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadReports, supabase]);

  return (
    <section className="space-y-4 rounded-2xl border border-white/60 bg-white/90 p-6 shadow-sm backdrop-blur">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900">Discrepancy Reports</h1>
        </div>
        <button
          type="button"
          onClick={() => void loadReports()}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

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

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Customer Tracking Reports</h2>
        <p className="mt-1 text-xs text-slate-500">
          Reports submitted by customers from direct tracking links update here in real time.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-3 py-2">Reported At</th>
              <th className="px-3 py-2">Tracking #</th>
              <th className="px-3 py-2">Client</th>
              <th className="px-3 py-2">Issue</th>
              <th className="px-3 py-2">Message</th>
              <th className="px-3 py-2">Contact</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-4 text-slate-500" colSpan={6}>
                  Loading customer tracking reports...
                </td>
              </tr>
            ) : issues.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-slate-500" colSpan={6}>
                  No customer tracking reports yet.
                </td>
              </tr>
            ) : (
              issues.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-600">{new Date(row.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2 font-medium text-slate-800">{row.tracking_number || row.shipment_id}</td>
                  <td className="px-3 py-2 text-slate-700">
                    {row.client_name || "-"}
                    {row.client_email ? ` (${row.client_email})` : ""}
                  </td>
                  <td className="px-3 py-2 text-amber-700">{row.issue_type}</td>
                  <td className="px-3 py-2 text-slate-700">{row.message || "-"}</td>
                  <td className="px-3 py-2 text-slate-600">{row.contact_email || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
