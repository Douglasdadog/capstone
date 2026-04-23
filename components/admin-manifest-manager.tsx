"use client";

import { DragEvent, useCallback, useEffect, useMemo, useState } from "react";

type ManifestRow = {
  id: string;
  file_name: string;
  uploaded_by: string;
  status: "Pending Verification" | "Completed" | "Discrepancies";
  discrepancy_notes?: string | null;
  created_at: string;
};

const statusOptions: ManifestRow["status"][] = ["Pending Verification", "Completed", "Discrepancies"];

function statusBadgeClass(status: ManifestRow["status"]) {
  if (status === "Completed") return "border-green-200 bg-green-50 text-green-700";
  if (status === "Discrepancies") return "border-red-200 bg-red-50 text-red-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function nextStepText(status: ManifestRow["status"]) {
  if (status === "Pending Verification") return "Next: Open scanner and verify all items from this manifest.";
  if (status === "Completed") return "Done: Verification completed and shipment can be received into stock.";
  return "Action: Review discrepancy report and decide whether to re-verify or resolve.";
}

export default function AdminManifestManager() {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manifests, setManifests] = useState<ManifestRow[]>([]);
  const [pendingDiscrepancyRow, setPendingDiscrepancyRow] = useState<ManifestRow | null>(null);
  const [discrepancyReasonInput, setDiscrepancyReasonInput] = useState("Short Shipment");
  const [discrepancyCommentInput, setDiscrepancyCommentInput] = useState("");

  const loadManifests = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/admin/manifests");
    const payload = (await response.json()) as { error?: string; manifests?: ManifestRow[] };
    if (!response.ok) {
      setError(payload.error ?? "Unable to load manifests.");
      setLoading(false);
      return;
    }
    setError(null);
    setManifests(payload.manifests ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadManifests();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadManifests]);

  async function uploadFile(file: File) {
    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/admin/manifests", {
      method: "POST",
      body: formData
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Manifest upload failed.");
      setUploading(false);
      return;
    }

    await loadManifests();
    setUploading(false);
  }

  async function onStatusChange(row: ManifestRow, status: ManifestRow["status"]) {
    let discrepancyNotes: string | null = null;
    let discrepancyReason: string | null = null;
    let discrepancyComments: string | null = null;
    if (status === "Discrepancies") {
      setError(null);
      setPendingDiscrepancyRow(row);
      setDiscrepancyReasonInput("Short Shipment");
      setDiscrepancyCommentInput(row.discrepancy_notes?.trim() || "");
      return;
    }

    const response = await fetch(`/api/admin/manifests/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        discrepancy_reason: null,
        discrepancy_comments: null,
        discrepancy_notes: null
      })
    });
    const payload = (await response.json()) as { error?: string; manifest?: ManifestRow };
    if (!response.ok) {
      setError(payload.error ?? "Unable to update status.");
      return;
    }
    setError(null);
    setManifests((prev) =>
      prev.map((entry) => (entry.id === row.id ? payload.manifest ?? { ...entry, status, discrepancy_notes: discrepancyNotes } : entry))
    );
  }

  async function submitDiscrepancyStatus() {
    if (!pendingDiscrepancyRow) return;
    const discrepancyReason = discrepancyReasonInput.trim();
    const discrepancyComments = discrepancyCommentInput.trim();
    if (!discrepancyReason) {
      setError("Discrepancy reason is required.");
      return;
    }
    if (!discrepancyComments) {
      setError("Discrepancy comment is required.");
      return;
    }

    const discrepancyNotes = `${discrepancyReason}: ${discrepancyComments}`;
    const response = await fetch(`/api/admin/manifests/${pendingDiscrepancyRow.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "Discrepancies",
        discrepancy_reason: discrepancyReason,
        discrepancy_comments: discrepancyComments,
        discrepancy_notes: discrepancyNotes
      })
    });
    const payload = (await response.json()) as { error?: string; manifest?: ManifestRow };
    if (!response.ok) {
      setError(payload.error ?? "Unable to update status.");
      return;
    }

    setError(null);
    setManifests((prev) =>
      prev.map((entry) =>
        entry.id === pendingDiscrepancyRow.id
          ? payload.manifest ?? { ...entry, status: "Discrepancies", discrepancy_notes: discrepancyNotes }
          : entry
      )
    );
    setPendingDiscrepancyRow(null);
    setDiscrepancyReasonInput("Short Shipment");
    setDiscrepancyCommentInput("");
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void uploadFile(file);
  }

  const counts = useMemo(() => {
    return manifests.reduce(
      (acc, row) => {
        if (row.status === "Completed") acc.completed += 1;
        else if (row.status === "Discrepancies") acc.discrepancies += 1;
        else acc.pending += 1;
        return acc;
      },
      { pending: 0, completed: 0, discrepancies: 0 }
    );
  }, [manifests]);

  return (
    <section className="space-y-5 rounded-2xl border border-white/60 bg-white/90 p-6 shadow-sm backdrop-blur">
      <div>
        <h2 className="text-xl font-black text-slate-900">Excel Manifest Upload</h2>
        <p className="mt-1 text-sm text-slate-600">
          Upload `.xlsx` or `.csv` with either (Part Number, Quantity, Batch ID) or (Product, Brand, Battery Type,
          Product Serial ID, Quantity).
        </p>
      </div>

      <label
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`block cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition ${
          isDragging ? "border-amber-500 bg-amber-50" : "border-slate-300 bg-slate-50 hover:bg-slate-100"
        }`}
      >
        <input
          type="file"
          accept=".xlsx,.csv"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadFile(file);
          }}
        />
        <p className="text-sm font-semibold text-slate-700">
          {uploading ? "Uploading and parsing manifest..." : "Drop manifest here or click to browse"}
        </p>
      </label>

      {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs uppercase tracking-wide text-amber-700">Pending</p>
          <p className="text-2xl font-black text-amber-800">{counts.pending}</p>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-3">
          <p className="text-xs uppercase tracking-wide text-green-700">Completed</p>
          <p className="text-2xl font-black text-green-800">{counts.completed}</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-xs uppercase tracking-wide text-red-700">Discrepancies</p>
          <p className="text-2xl font-black text-red-800">{counts.discrepancies}</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-3 py-2">Uploaded</th>
              <th className="px-3 py-2">File</th>
              <th className="px-3 py-2">By</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Details</th>
              <th className="px-3 py-2">Set Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-4 text-slate-500" colSpan={6}>
                  Loading manifests...
                </td>
              </tr>
            ) : manifests.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-slate-500" colSpan={6}>
                  No manifests uploaded yet.
                </td>
              </tr>
            ) : (
              manifests.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-600">{new Date(row.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2 font-medium text-slate-800">{row.file_name}</td>
                  <td className="px-3 py-2 text-slate-700">{row.uploaded_by}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusBadgeClass(row.status)}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <details className="group max-w-sm rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
                      <summary className="cursor-pointer list-none text-xs font-semibold text-slate-700">
                        View Details
                      </summary>
                      <div className="mt-2 space-y-1 text-xs text-slate-600">
                        <p>
                          <span className="font-semibold text-slate-700">File:</span> {row.file_name}
                        </p>
                        <p>
                          <span className="font-semibold text-slate-700">Uploaded by:</span> {row.uploaded_by}
                        </p>
                        <p>
                          <span className="font-semibold text-slate-700">Uploaded at:</span>{" "}
                          {new Date(row.created_at).toLocaleString()}
                        </p>
                        {row.discrepancy_notes ? (
                          <p>
                            <span className="font-semibold text-slate-700">Notes:</span> {row.discrepancy_notes}
                          </p>
                        ) : null}
                        <p className="pt-1 font-medium text-slate-700">{nextStepText(row.status)}</p>
                      </div>
                    </details>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={row.status}
                      onChange={(event) => void onStatusChange(row, event.target.value as ManifestRow["status"])}
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                    >
                      {statusOptions.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pendingDiscrepancyRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-black text-slate-900">Mark as Discrepancy</h3>
            <p className="mt-1 text-sm text-slate-600">
              Add reason and details for <span className="font-semibold">{pendingDiscrepancyRow.file_name}</span>.
            </p>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Reason</span>
                <select
                  value={discrepancyReasonInput}
                  onChange={(event) => setDiscrepancyReasonInput(event.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="Short Shipment">Short Shipment</option>
                  <option value="Damaged on Arrival">Damaged on Arrival</option>
                  <option value="Mismatched Part">Mismatched Part</option>
                  <option value="Over-shipment">Over-shipment</option>
                  <option value="Other">Other</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Comment / Details
                </span>
                <textarea
                  rows={4}
                  value={discrepancyCommentInput}
                  onChange={(event) => setDiscrepancyCommentInput(event.target.value)}
                  placeholder="Describe what was found during verification..."
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPendingDiscrepancyRow(null);
                  setDiscrepancyReasonInput("Short Shipment");
                  setDiscrepancyCommentInput("");
                }}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitDiscrepancyStatus()}
                className="rounded-md bg-gradient-to-r from-red-600 to-amber-600 px-3 py-2 text-sm font-semibold text-white hover:from-red-700 hover:to-amber-700"
              >
                Save Discrepancy
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
