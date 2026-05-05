"use client";

import { useEffect, useMemo, useState } from "react";
import AuditActionBadge from "@/components/audit-action-badge";
import { queueOfflineTransaction } from "@/lib/offline/transaction-queue";

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
  actor_name: string;
  actor_email: string;
  actor_ip: string;
  target_module: string;
};

type SecurityRequestRow = {
  id: number;
  user_name?: string | null;
  email: string;
  role: string;
  status: string;
  created_at: string;
};

function parseMfaApprovalMessage(message: string | undefined) {
  const text = message ?? "";
  const approvedFor = text.match(/MFA reset approved for (.+?) by /i)?.[1] ?? "—";
  const approvedBy = text.match(/ by (.+?)\. Reason:/i)?.[1] ?? "—";
  const reason = text.match(/Reason:\s*(.+)$/i)?.[1] ?? "—";
  return { approvedFor, approvedBy, reason };
}

function parseMfaDenialMessage(message: string | undefined) {
  const text = message ?? "";
  const deniedFor = text.match(/MFA reset denied for (.+?) by /i)?.[1] ?? "—";
  const deniedBy = text.match(/ by (.+?)\. Reason:/i)?.[1] ?? "—";
  const reason = text.match(/Reason:\s*(.+?)(?:\sEmail warning:|$)/i)?.[1] ?? "—";
  return { deniedFor, deniedBy, reason };
}

function formatRoleLabel(role: string) {
  return role === "SuperAdmin" ? "Super Admin" : role;
}

export default function SuperAdminGovernancePanel() {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [requests, setRequests] = useState<SecurityRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<number | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<SecurityRequestRow | null>(null);
  const [selectedDenyRequest, setSelectedDenyRequest] = useState<SecurityRequestRow | null>(null);
  const [reason, setReason] = useState("");
  const [confirmationText, setConfirmationText] = useState("");
  const [denyReason, setDenyReason] = useState("");
  const [denyConfirmationText, setDenyConfirmationText] = useState("");
  const [modalError, setModalError] = useState<string | null>(null);

  async function loadGovernanceData() {
    setLoading(true);
    setError(null);
    try {
      const [auditRes, requestRes] = await Promise.all([
        fetch("/api/dashboard/audit-log"),
        fetch("/api/admin/security-requests")
      ]);

      const auditData = (await auditRes.json()) as {
        alerts?: AlertRow[];
        activities?: ActivityRow[];
        error?: string;
      };
      const requestData = (await requestRes.json()) as { requests?: SecurityRequestRow[]; error?: string };

      if (!auditRes.ok) throw new Error(auditData.error ?? "Unable to load audit entries.");
      if (!requestRes.ok) throw new Error(requestData.error ?? "Unable to load security requests.");

      setAlerts(auditData.alerts ?? []);
      setActivities(auditData.activities ?? []);
      setRequests(requestData.requests ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load governance data.");
    } finally {
      setLoading(false);
    }
  }

  async function approveRequest() {
    if (!selectedRequest) return;
    setActionId(selectedRequest.id);
    setError(null);
    setModalError(null);
    try {
      const payloadBody = {
        requestId: selectedRequest.id,
        reason,
        confirmationText
      };
      if (!window.navigator.onLine) {
        queueOfflineTransaction({
          path: "/api/admin/security-requests/approve",
          method: "POST",
          body: payloadBody
        });
        setSelectedRequest(null);
        setReason("");
        setConfirmationText("");
        setError(null);
        setModalError("Offline: approval queued. Sync when online.");
        return;
      }
      const response = await fetch("/api/admin/security-requests/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadBody)
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to approve request.");
      }
      setSelectedRequest(null);
      setReason("");
      setConfirmationText("");
      await loadGovernanceData();
    } catch (err) {
      if (err instanceof TypeError || !window.navigator.onLine) {
        queueOfflineTransaction({
          path: "/api/admin/security-requests/approve",
          method: "POST",
          body: {
            requestId: selectedRequest.id,
            reason,
            confirmationText
          }
        });
        setSelectedRequest(null);
        setReason("");
        setConfirmationText("");
        setModalError("Network issue: approval queued. Sync when online.");
        return;
      }
      setModalError(err instanceof Error ? err.message : "Unable to approve request.");
    } finally {
      setActionId(null);
    }
  }

  async function denyRequest() {
    if (!selectedDenyRequest) return;
    setActionId(selectedDenyRequest.id);
    setError(null);
    setModalError(null);
    try {
      const payloadBody = {
        requestId: selectedDenyRequest.id,
        reason: denyReason,
        confirmationText: denyConfirmationText
      };
      if (!window.navigator.onLine) {
        queueOfflineTransaction({
          path: "/api/admin/security-requests/deny",
          method: "POST",
          body: payloadBody
        });
        setSelectedDenyRequest(null);
        setDenyReason("");
        setDenyConfirmationText("");
        setError(null);
        setModalError("Offline: deny action queued. Sync when online.");
        return;
      }
      const response = await fetch("/api/admin/security-requests/deny", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadBody)
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to deny request.");
      }
      setSelectedDenyRequest(null);
      setDenyReason("");
      setDenyConfirmationText("");
      await loadGovernanceData();
    } catch (err) {
      if (err instanceof TypeError || !window.navigator.onLine) {
        queueOfflineTransaction({
          path: "/api/admin/security-requests/deny",
          method: "POST",
          body: {
            requestId: selectedDenyRequest.id,
            reason: denyReason,
            confirmationText: denyConfirmationText
          }
        });
        setSelectedDenyRequest(null);
        setDenyReason("");
        setDenyConfirmationText("");
        setModalError("Network issue: deny action queued. Sync when online.");
        return;
      }
      setModalError(err instanceof Error ? err.message : "Unable to deny request.");
    } finally {
      setActionId(null);
    }
  }

  const mfaApprovalEntries = useMemo(
    () =>
      alerts.filter((row) => (row.message ?? "").toLowerCase().includes("mfa reset approved")).slice(0, 10),
    [alerts]
  );
  const mfaDenialEntries = useMemo(
    () => alerts.filter((row) => (row.message ?? "").toLowerCase().includes("mfa reset denied")).slice(0, 10),
    [alerts]
  );
  const confirmationValid = confirmationText.trim() === "APPROVE";
  const reasonLength = reason.trim().length;
  const reasonValid = reasonLength >= 8 && reasonLength <= 240;
  const denyConfirmationValid = denyConfirmationText.trim() === "DENY";
  const denyReasonLength = denyReason.trim().length;
  const denyReasonValid = denyReasonLength >= 8 && denyReasonLength <= 240;
  const canConfirmApproval = Boolean(selectedRequest) && confirmationValid && reasonValid;
  const canConfirmDeny = Boolean(selectedDenyRequest) && denyConfirmationValid && denyReasonValid;

  useEffect(() => {
    void loadGovernanceData();
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur">
        <h2 className="text-lg font-semibold text-slate-900">Privileged security requests</h2>
        <p className="mt-1 text-sm text-slate-600">
          Review pending MFA reset requests. Each approval requires typed confirmation and a documented reason.
        </p>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Requested At</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{row.user_name || row.email}</td>
                  <td className="px-4 py-3">{formatRoleLabel(row.role)}</td>
                  <td className="px-4 py-3">{new Date(row.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={actionId === row.id}
                        onClick={() => {
                          setSelectedRequest(row);
                          setReason("");
                          setConfirmationText("");
                          setModalError(null);
                        }}
                        className="rounded-md bg-gradient-to-r from-amber-700 to-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:from-amber-800 hover:to-red-700 disabled:opacity-60"
                      >
                        {actionId === row.id ? "Processing..." : "Approve & Reset"}
                      </button>
                      <button
                        type="button"
                        disabled={actionId === row.id}
                        onClick={() => {
                          setSelectedDenyRequest(row);
                          setDenyReason("");
                          setDenyConfirmationText("");
                          setModalError(null);
                        }}
                        className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 shadow-sm hover:bg-red-100 disabled:opacity-60"
                      >
                        {actionId === row.id ? "Processing..." : "Deny"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && requests.length === 0 ? (
                <tr>
                  <td className="px-4 py-5 text-slate-500" colSpan={4}>
                    No pending MFA reset requests.
                  </td>
                </tr>
              ) : null}
              {loading ? (
                <tr>
                  <td className="px-4 py-5 text-slate-500" colSpan={4}>
                    Loading security requests...
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur">
        <h2 className="text-lg font-semibold text-slate-900">Privileged action audit trail</h2>
        <p className="mt-1 text-sm text-slate-600">
          Recent system-wide actions used for governance monitoring.
        </p>
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">IP Address</th>
                <th className="px-4 py-3">Module</th>
              </tr>
            </thead>
            <tbody>
              {activities.slice(0, 12).map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{new Date(row.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <AuditActionBadge status="Logged" message={row.action} />
                  </td>
                  <td className="px-4 py-3">{row.actor_name || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.actor_email || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.actor_ip || "—"}</td>
                  <td className="px-4 py-3">{row.target_module || "—"}</td>
                </tr>
              ))}
              {!loading && activities.length === 0 && alerts.slice(0, 12).map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{new Date(row.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <AuditActionBadge status={row.status} message={row.message} />
                  </td>
                  <td className="px-4 py-3">—</td>
                  <td className="px-4 py-3">—</td>
                  <td className="px-4 py-3">—</td>
                  <td className="px-4 py-3">{row.item_name ?? "—"}</td>
                </tr>
              ))}
              {!loading && activities.length === 0 && alerts.length === 0 ? (
                <tr>
                  <td className="px-4 py-5 text-slate-500" colSpan={6}>
                    No privileged actions yet.
                  </td>
                </tr>
              ) : null}
              {loading ? (
                <tr>
                  <td className="px-4 py-5 text-slate-500" colSpan={6}>
                    Loading audit trail...
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div id="mfa-approval-history" className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur">
        <h2 className="text-lg font-semibold text-slate-900">MFA approval history</h2>
        <p className="mt-1 text-sm text-slate-600">
          Focused trail showing who approved MFA resets and why.
        </p>
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Approved For</th>
                <th className="px-4 py-3">Approved By</th>
                <th className="px-4 py-3">Reason</th>
              </tr>
            </thead>
            <tbody>
              {mfaApprovalEntries.map((row) => {
                const parsed = parseMfaApprovalMessage(row.message);
                return (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">{new Date(row.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3">{parsed.approvedFor}</td>
                    <td className="px-4 py-3">{parsed.approvedBy}</td>
                    <td className="px-4 py-3">{parsed.reason}</td>
                  </tr>
                );
              })}
              {!loading && mfaApprovalEntries.length === 0 ? (
                <tr>
                  <td className="px-4 py-5 text-slate-500" colSpan={4}>
                    No MFA approvals logged yet.
                  </td>
                </tr>
              ) : null}
              {loading ? (
                <tr>
                  <td className="px-4 py-5 text-slate-500" colSpan={4}>
                    Loading MFA approval history...
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div id="mfa-denial-history" className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur">
        <h2 className="text-lg font-semibold text-slate-900">MFA denial history</h2>
        <p className="mt-1 text-sm text-slate-600">
          Focused trail showing who denied MFA reset requests and why.
        </p>
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Denied For</th>
                <th className="px-4 py-3">Denied By</th>
                <th className="px-4 py-3">Reason</th>
              </tr>
            </thead>
            <tbody>
              {mfaDenialEntries.map((row) => {
                const parsed = parseMfaDenialMessage(row.message);
                return (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">{new Date(row.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3">{parsed.deniedFor}</td>
                    <td className="px-4 py-3">{parsed.deniedBy}</td>
                    <td className="px-4 py-3">{parsed.reason}</td>
                  </tr>
                );
              })}
              {!loading && mfaDenialEntries.length === 0 ? (
                <tr>
                  <td className="px-4 py-5 text-slate-500" colSpan={4}>
                    No MFA denials logged yet.
                  </td>
                </tr>
              ) : null}
              {loading ? (
                <tr>
                  <td className="px-4 py-5 text-slate-500" colSpan={4}>
                    Loading MFA denial history...
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {selectedRequest ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">Confirm MFA reset approval</h3>
            <p className="mt-2 text-sm text-slate-600">
              This action resets MFA for <span className="font-semibold">{selectedRequest.email}</span>. Type
              <span className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 font-semibold">APPROVE</span> and provide a reason.
            </p>
            <div className="mt-4 space-y-3">
              <input
                value={confirmationText}
                onChange={(event) => setConfirmationText(event.target.value)}
                placeholder="Type APPROVE"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <p className="text-xs text-slate-500">Confirmation is case-sensitive.</p>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Reason for approval (min 8 characters)"
                rows={3}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <p className="text-xs text-slate-500">{reasonLength}/240 characters</p>
              {modalError ? <p className="text-sm text-red-600">{modalError}</p> : null}
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedRequest(null);
                  setReason("");
                  setConfirmationText("");
                  setModalError(null);
                }}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionId === selectedRequest.id || !canConfirmApproval}
                onClick={() => {
                  void approveRequest();
                }}
                className="rounded-md bg-gradient-to-r from-amber-700 to-red-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:from-amber-800 hover:to-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionId === selectedRequest.id ? "Processing..." : "Confirm approval"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedDenyRequest ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">Confirm MFA reset denial</h3>
            <p className="mt-2 text-sm text-slate-600">
              This action denies MFA reset for <span className="font-semibold">{selectedDenyRequest.email}</span> and
              sends a formal email notice. Type
              <span className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 font-semibold">DENY</span> and provide a reason.
            </p>
            <div className="mt-4 space-y-3">
              <input
                value={denyConfirmationText}
                onChange={(event) => setDenyConfirmationText(event.target.value)}
                placeholder="Type DENY"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <p className="text-xs text-slate-500">Confirmation is case-sensitive.</p>
              <textarea
                value={denyReason}
                onChange={(event) => setDenyReason(event.target.value)}
                placeholder="Reason for denial (min 8 characters)"
                rows={3}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <p className="text-xs text-slate-500">{denyReasonLength}/240 characters</p>
              {modalError ? <p className="text-sm text-red-600">{modalError}</p> : null}
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedDenyRequest(null);
                  setDenyReason("");
                  setDenyConfirmationText("");
                  setModalError(null);
                }}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionId === selectedDenyRequest.id || !canConfirmDeny}
                onClick={() => {
                  void denyRequest();
                }}
                className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700 shadow-sm hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionId === selectedDenyRequest.id ? "Processing..." : "Confirm denial"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
