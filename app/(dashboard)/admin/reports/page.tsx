"use client";

import { useCallback, useEffect, useState } from "react";
import { Mail } from "lucide-react";
import TrackingIssueEmailModal, {
  type TrackingIssueEmailContext
} from "@/components/tracking-issue-email-modal";

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
  status?: "open" | "resolved";
  resolved_at?: string | null;
  resolved_by?: string | null;
  tracking_number: string | null;
  client_name: string | null;
  client_email: string | null;
  destination: string | null;
};

export default function AdminReportsPage() {
  const LOCAL_RESOLVED_KEY = "wis_resolved_tracking_issue_ids";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reports, setReports] = useState<ManifestReportRow[]>([]);
  const [issues, setIssues] = useState<TrackingIssueRow[]>([]);
  const [emailIssue, setEmailIssue] = useState<TrackingIssueEmailContext | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [resolvingIssueId, setResolvingIssueId] = useState<number | null>(null);
  const [localResolvedIds, setLocalResolvedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LOCAL_RESOLVED_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as number[];
      if (!Array.isArray(parsed)) return;
      setLocalResolvedIds(new Set(parsed.filter((value) => Number.isFinite(value))));
    } catch {
      setLocalResolvedIds(new Set());
    }
  }, []);

  const persistLocalResolved = useCallback(
    (next: Set<number>) => {
      setLocalResolvedIds(next);
      try {
        window.localStorage.setItem(LOCAL_RESOLVED_KEY, JSON.stringify(Array.from(next)));
      } catch {
        // Ignore storage failures; UI state is still updated for this session.
      }
    },
    [LOCAL_RESOLVED_KEY]
  );

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
    const timeoutId = window.setTimeout(() => {
      void loadReports();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadReports]);

  function openEmailModal(row: TrackingIssueRow) {
    setEmailIssue({
      id: row.id,
      tracking_number: row.tracking_number,
      issue_type: row.issue_type,
      message: row.message,
      contact_email: row.contact_email,
      client_name: row.client_name
    });
    setEmailOpen(true);
  }

  async function markIssueResolved(issueId: number) {
    try {
      setResolvingIssueId(issueId);
      setError(null);
      const response = await fetch("/api/admin/tracking-issues/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId })
      });
      const payload = (await response.json()) as { error?: string; warning?: string };
      if (!response.ok) {
        setError(payload.error ?? "Unable to mark report as resolved.");
        return;
      }
      const next = new Set(localResolvedIds);
      next.add(issueId);
      persistLocalResolved(next);
      if (payload.warning) {
        setError(payload.warning);
      }
      await loadReports();
    } catch {
      setError("Unable to mark report as resolved.");
    } finally {
      setResolvingIssueId(null);
    }
  }

  const openIssues = issues.filter((row) => row.status !== "resolved" && !localResolvedIds.has(row.id));
  const resolvedIssues = issues.filter((row) => row.status === "resolved" || localResolvedIds.has(row.id));

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
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Open Customer Tracking Reports</h2>
        <p className="mt-1 text-xs text-slate-500">
          Reports submitted by customers from direct tracking links.
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
              <th className="px-3 py-2 w-[1%] whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-4 text-slate-500" colSpan={7}>
                  Loading customer tracking reports...
                </td>
              </tr>
            ) : openIssues.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-slate-500" colSpan={7}>
                  No open customer tracking reports.
                </td>
              </tr>
            ) : (
              openIssues.map((row) => (
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
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEmailModal(row)}
                        disabled={!row.contact_email?.trim()}
                        title={row.contact_email?.trim() ? "Compose email to customer" : "No contact email on file"}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <Mail className="h-3.5 w-3.5" aria-hidden />
                        Email
                      </button>
                      <button
                        type="button"
                        onClick={() => void markIssueResolved(row.id)}
                        disabled={resolvingIssueId === row.id}
                        className="inline-flex items-center rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {resolvingIssueId === row.id ? "Resolving..." : "Mark Resolved"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Resolved Customer Reports</h2>
        <p className="mt-1 text-xs text-slate-500">
          Reports moved here after support response is sent.
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
              <th className="px-3 py-2">Resolved At</th>
              <th className="px-3 py-2">Resolved By</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-4 text-slate-500" colSpan={7}>
                  Loading resolved reports...
                </td>
              </tr>
            ) : resolvedIssues.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-slate-500" colSpan={7}>
                  No resolved reports yet.
                </td>
              </tr>
            ) : (
              resolvedIssues.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-600">{new Date(row.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2 font-medium text-slate-800">{row.tracking_number || row.shipment_id}</td>
                  <td className="px-3 py-2 text-slate-700">
                    {row.client_name || "-"}
                    {row.client_email ? ` (${row.client_email})` : ""}
                  </td>
                  <td className="px-3 py-2 text-emerald-700">{row.issue_type}</td>
                  <td className="px-3 py-2 text-slate-700">{row.message || "-"}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {row.resolved_at ? new Date(row.resolved_at).toLocaleString() : "-"}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{row.resolved_by || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <TrackingIssueEmailModal
        issue={emailIssue}
        open={emailOpen}
        onSent={() => {
          void loadReports();
        }}
        onClose={() => {
          setEmailOpen(false);
          setEmailIssue(null);
        }}
      />
    </section>
  );
}
