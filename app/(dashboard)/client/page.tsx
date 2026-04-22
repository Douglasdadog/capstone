"use client";

import { useEffect, useState } from "react";

type Shipment = {
  id: string;
  tracking_number: string;
  item_name?: string;
  quantity?: number;
  estimated_arrival?: string;
  origin: string;
  destination: string;
  status: "Pending" | "In Transit" | "Delivered";
  updated_at: string;
};

const timelineSteps = ["Order Confirmed", "Packed", "In Transit", "Delivered"] as const;
const issueTypes = ["Delayed Shipment", "Incorrect Status", "Order Inquiry", "Damaged Item"] as const;

function getActiveStepIndex(status: Shipment["status"]) {
  if (status === "Delivered") return 3;
  if (status === "In Transit") return 2;
  return 1;
}

function formatStatusBadge(status: Shipment["status"]) {
  if (status === "Delivered") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "In Transit") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-100 text-slate-700";
}

export default function ClientPage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedShipmentId, setSelectedShipmentId] = useState<string | null>(null);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueType, setIssueType] = useState<(typeof issueTypes)[number]>("Delayed Shipment");
  const [issueMessage, setIssueMessage] = useState("");
  const [issueSubmitting, setIssueSubmitting] = useState(false);
  const [issueResult, setIssueResult] = useState<string | null>(null);

  async function fetchShipments() {
    const response = await fetch("/api/portal/shipments");
    const data = (await response.json()) as { shipments?: Shipment[]; error?: string };
    if (!response.ok) throw new Error(data.error ?? "Unable to load shipments.");
    setShipments(data.shipments ?? []);
  }

  useEffect(() => {
    async function load() {
      try {
        setError(null);
        await fetchShipments();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data.");
      }
    }
    void load();
  }, []);

  const trackedShipment = shipments.find(
    (shipment) => shipment.tracking_number?.toLowerCase() === trackingNumber.trim().toLowerCase()
  );
  const latestShipment = shipments[0] ?? null;
  const selectedShipment = trackedShipment ?? shipments.find((item) => item.id === selectedShipmentId) ?? latestShipment;

  async function handleSubmitIssue() {
    if (!selectedShipment) return;
    setIssueSubmitting(true);
    setIssueResult(null);
    setError(null);
    const response = await fetch("/api/portal/shipments/issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shipmentId: selectedShipment.id,
        issueType,
        message: issueMessage
      })
    });
    const payload = (await response.json()) as { error?: string; ticketId?: string };
    if (!response.ok) {
      setError(payload.error ?? "Unable to submit issue.");
      setIssueSubmitting(false);
      return;
    }
    setIssueResult(`Issue submitted successfully. Ticket ${payload.ticketId ?? ""}`.trim());
    setIssueMessage("");
    setShowIssueModal(false);
    setIssueSubmitting(false);
  }

  return (
    <section className="space-y-6">
      <header className="overflow-hidden rounded-2xl border border-white/60 bg-white/90 p-0 shadow-sm backdrop-blur">
        <div className="bg-gradient-to-r from-slate-900 via-red-800 to-amber-700 px-6 py-7 text-white">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-200">Customer Shipment Portal</p>
          <h1 className="mt-2 text-3xl font-black md:text-4xl">Track your order in real time</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-100/90">
            Enter your tracking number below to view shipment progress, delivery details, and latest status updates.
          </p>
        </div>
        <div className="grid gap-3 px-6 py-4 text-sm text-slate-600 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Total shipments</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{shipments.length}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">In transit</p>
            <p className="mt-1 text-xl font-bold text-amber-700">
              {shipments.filter((s) => s.status === "In Transit").length}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Delivered</p>
            <p className="mt-1 text-xl font-bold text-emerald-700">
              {shipments.filter((s) => s.status === "Delivered").length}
            </p>
          </div>
        </div>
      </header>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="space-y-6 rounded-2xl border border-white/60 bg-white/85 p-6 shadow-sm backdrop-blur">
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Tracking number</label>
          <input
            value={trackingNumber}
            onChange={(event) => setTrackingNumber(event.target.value)}
            placeholder="e.g. WIS-1001"
            className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-lg shadow-sm"
          />
          <p className="text-xs text-slate-500">
            Tip: use the full tracking number exactly as shown in your shipment confirmation.
          </p>
        </div>

        {selectedShipment ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Tracking number</p>
                <p className="font-semibold text-slate-900">{selectedShipment.tracking_number}</p>
              </div>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${formatStatusBadge(selectedShipment.status)}`}
              >
                {selectedShipment.status}
              </span>
            </div>

            <div className="grid gap-2 text-center text-xs font-medium sm:grid-cols-4">
              {timelineSteps.map((step, idx) => {
                const active = idx <= getActiveStepIndex(selectedShipment.status);
                return (
                  <div
                    key={step}
                    className={`rounded-md border px-2 py-2 ${
                      active
                        ? "border-amber-300 bg-amber-50 text-amber-700"
                        : "border-slate-200 bg-slate-50 text-slate-500"
                    }`}
                  >
                    {step}
                  </div>
                );
              })}
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm shadow-inner">
              <div className="grid gap-3 sm:grid-cols-2">
                <p>
                  <span className="font-medium">Item:</span> {selectedShipment.item_name ?? "General Package"}
                </p>
                <p>
                  <span className="font-medium">Quantity:</span> {selectedShipment.quantity ?? 1}
                </p>
                <p>
                  <span className="font-medium">Estimated arrival:</span>{" "}
                  {selectedShipment.estimated_arrival
                    ? new Date(selectedShipment.estimated_arrival).toLocaleDateString()
                    : "Within 2-4 days"}
                </p>
                <p>
                  <span className="font-medium">Last updated:</span>{" "}
                  {new Date(selectedShipment.updated_at).toLocaleString()}
                </p>
              </div>
              <p className="mt-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-700">
                <span className="font-medium">Route:</span> {selectedShipment.origin} &rarr; {selectedShipment.destination}
              </p>
              <button
                type="button"
                onClick={() => {
                  setShowIssueModal(true);
                  setIssueResult(null);
                  setError(null);
                }}
                className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                Report issue with this shipment
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
            <p className="font-medium text-slate-800">No matching shipment yet.</p>
            <p className="mt-1">
              Enter a tracking number that matches one of your shipments. If you need help, contact customer support.
            </p>
          </div>
        )}

        {latestShipment ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Most recent shipment</p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
              <p className="font-semibold text-slate-900">{latestShipment.tracking_number}</p>
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${formatStatusBadge(latestShipment.status)}`}
              >
                {latestShipment.status}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {latestShipment.origin} &rarr; {latestShipment.destination}
            </p>
          </div>
        ) : null}

        {shipments.length > 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Shipment history</p>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-3 py-2">Tracking #</th>
                    <th className="px-3 py-2">Route</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Updated</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-medium text-slate-900">{row.tracking_number}</td>
                      <td className="px-3 py-2 text-slate-700">
                        {row.origin} &rarr; {row.destination}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${formatStatusBadge(row.status)}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{new Date(row.updated_at).toLocaleString()}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedShipmentId(row.id);
                            setTrackingNumber(row.tracking_number);
                            setIssueResult(null);
                          }}
                          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      {issueResult ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {issueResult}
        </div>
      ) : null}

      {showIssueModal && selectedShipment ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">Report shipment issue</h3>
            <p className="mt-1 text-sm text-slate-600">
              Tracking <span className="font-semibold">{selectedShipment.tracking_number}</span>
            </p>
            <div className="mt-4 space-y-3">
              <select
                value={issueType}
                onChange={(event) => setIssueType(event.target.value as (typeof issueTypes)[number])}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {issueTypes.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <textarea
                value={issueMessage}
                onChange={(event) => setIssueMessage(event.target.value)}
                rows={4}
                placeholder="Describe the issue (optional)."
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowIssueModal(false);
                }}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={issueSubmitting}
                onClick={() => {
                  void handleSubmitIssue();
                }}
                className="rounded-md bg-gradient-to-r from-amber-700 to-red-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:from-amber-800 hover:to-red-700 disabled:opacity-60"
              >
                {issueSubmitting ? "Submitting..." : "Submit issue"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}


