"use client";

import { useCallback, useEffect, useState } from "react";
import { queueOfflineTransaction } from "@/lib/offline/transaction-queue";

type Shipment = {
  id: string;
  tracking_number: string;
  item_name?: string;
  quantity?: number;
  estimated_arrival?: string;
  eta?: string;
  origin: string;
  destination: string;
  status: "Pending" | "In Transit" | "Delivered";
  milestone_status?: "Pending" | "In Transit" | "Delivered";
  payment_status?: "Awaiting Payment" | "Submitted" | "Verified" | "Rejected";
  payment_proof_url?: string | null;
  payment_proof_uploaded_at?: string | null;
  payment_rejection_reason?: string | null;
  tracking_token?: string | null;
  updated_at: string;
};

const timelineSteps = ["Order Confirmed", "Packed", "In Transit", "Delivered"] as const;
const issueTypes = ["Delayed Shipment", "Incorrect Status", "Order Inquiry", "Damaged Item"] as const;

function normalizeTrackingValue(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

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
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [history, setHistory] = useState<Shipment[]>([]);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueType, setIssueType] = useState<(typeof issueTypes)[number]>("Delayed Shipment");
  const [issueMessage, setIssueMessage] = useState("");
  const [issueSubmitting, setIssueSubmitting] = useState(false);
  const [issueResult, setIssueResult] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofUploading, setProofUploading] = useState(false);
  const selectedShipment = shipment;

  const loadOrderHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/portal/shipments");
      const data = (await response.json()) as { shipments?: Shipment[]; shipment?: Shipment | null };
      if (!response.ok) return;
      const rows = data.shipments ?? [];
      setHistory(rows);
      if (rows.length > 0) {
        setShipment((previous) => previous ?? rows[0]);
      }
    } catch {
      // Keep UI usable even if history fetch fails.
    }
  }, []);

  async function searchShipment() {
    const normalizedInput = normalizeTrackingValue(trackingNumber);
    if (!normalizedInput) {
      setError("Enter a tracking number first.");
      setHasSearched(false);
      setShipment(null);
      return;
    }
    setSearching(true);
    setError(null);
    setIssueResult(null);
    setHasSearched(true);
    try {
      const response = await fetch(`/api/portal/shipments?trackingNumber=${encodeURIComponent(trackingNumber)}`);
      const data = (await response.json()) as { shipment?: Shipment | null; shipments?: Shipment[]; error?: string };
      if (!response.ok) {
        setShipment(null);
        setError(data.error ?? "Shipment not found.");
        return;
      }
      setShipment((data.shipment as Shipment | null) ?? null);
      if (Array.isArray(data.shipments)) setHistory(data.shipments);
    } catch {
      setShipment(null);
      setError("Unable to search shipment right now.");
    } finally {
      setSearching(false);
    }
  }

  async function uploadPaymentProof() {
    if (!selectedShipment) return;
    if (!proofFile) {
      setError("Please choose an image file first.");
      return;
    }
    setProofUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("shipmentId", selectedShipment.id);
      formData.set("paymentProof", proofFile);
      const response = await fetch("/api/portal/shipments/payment-proof", {
        method: "POST",
        body: formData
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to upload payment proof.");
      setIssueResult("Payment proof uploaded successfully. Awaiting Sales verification.");
      setProofFile(null);
      await loadOrderHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to upload payment proof.");
    } finally {
      setProofUploading(false);
    }
  }

  useEffect(() => {
    void loadOrderHistory();
  }, [loadOrderHistory]);

  async function handleSubmitIssue() {
    if (!selectedShipment) return;
    setIssueSubmitting(true);
    setIssueResult(null);
    setError(null);
    const payloadBody = {
      shipmentId: selectedShipment.id,
      issueType,
      message: issueMessage
    };
    if (!window.navigator.onLine) {
      queueOfflineTransaction({
        path: "/api/portal/shipments/issue",
        method: "POST",
        body: payloadBody
      });
      setIssueResult("Offline: issue report queued. Sync when online.");
      setIssueMessage("");
      setShowIssueModal(false);
      setIssueSubmitting(false);
      return;
    }
    try {
      const response = await fetch("/api/portal/shipments/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadBody)
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
    } catch {
      queueOfflineTransaction({
        path: "/api/portal/shipments/issue",
        method: "POST",
        body: payloadBody
      });
      setError(null);
      setIssueResult("Network issue: issue report queued. Sync when online.");
      setIssueMessage("");
      setShowIssueModal(false);
      setIssueSubmitting(false);
    }
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
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href="/client/products"
              className="rounded-md bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-100"
            >
              Products / Order Now
            </a>
            <a
              href="/client/orders"
              className="rounded-md border border-white/40 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20"
            >
              My Orders
            </a>
          </div>
        </div>
      </header>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="space-y-6 rounded-2xl border border-white/60 bg-white/85 p-6 shadow-sm backdrop-blur">
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Tracking number</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={trackingNumber}
              onChange={(event) => setTrackingNumber(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void searchShipment();
                }
              }}
              placeholder="e.g. WIS-1001"
              className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-lg shadow-sm"
            />
            <button
              type="button"
              onClick={() => void searchShipment()}
              disabled={searching}
              className="rounded-md bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {searching ? "Searching..." : "Search"}
            </button>
          </div>
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
                const active = idx <= getActiveStepIndex(selectedShipment.milestone_status ?? selectedShipment.status);
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
                  {selectedShipment.estimated_arrival || selectedShipment.eta
                    ? new Date(selectedShipment.estimated_arrival ?? selectedShipment.eta ?? "").toLocaleDateString()
                    : "Within 2-4 days"}
                </p>
                <p>
                  <span className="font-medium">Payment status:</span> {selectedShipment.payment_status ?? "Awaiting Payment"}
                </p>
                <p>
                  <span className="font-medium">Last updated:</span>{" "}
                  {new Date(selectedShipment.updated_at).toLocaleString()}
                </p>
              </div>
              <p className="mt-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-700">
                <span className="font-medium">Route:</span> {selectedShipment.origin} &rarr; {selectedShipment.destination}
              </p>
              {selectedShipment.payment_status === "Rejected" ? (
                <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <p className="font-semibold">Payment proof was rejected.</p>
                  <p className="mt-1">
                    {selectedShipment.payment_rejection_reason?.trim() || "Please upload a clearer/valid payment screenshot."}
                  </p>
                  <p className="mt-1">You may re-upload a new payment proof below while order is still pending.</p>
                </div>
              ) : null}
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
              {selectedShipment.tracking_token ? (
                <a
                  href={`/api/logistics/invoice/${selectedShipment.tracking_token}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 ml-2 inline-block rounded-md border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                >
                  Download Digital Invoice
                </a>
              ) : null}
              {selectedShipment.status === "Pending" ? (
                <div className="mt-3 rounded-md border border-slate-200 bg-white px-3 py-3">
                  <p className="text-xs font-semibold text-slate-700">Upload Payment Proof (GCash/Bank)</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => setProofFile(event.target.files?.[0] ?? null)}
                      className="text-xs"
                    />
                    <button
                      type="button"
                      disabled={proofUploading}
                      onClick={() => void uploadPaymentProof()}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {proofUploading ? "Uploading..." : "Submit Payment Proof"}
                    </button>
                  </div>
                  {selectedShipment.payment_proof_url ? (
                    <a
                      href={selectedShipment.payment_proof_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-xs font-semibold text-emerald-700 hover:underline"
                    >
                      View current uploaded proof
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
            <p className="font-medium text-slate-800">
              {hasSearched ? "No matching shipment yet." : "Search a tracking number to view shipment details."}
            </p>
            <p className="mt-1">
              {hasSearched
                ? "Enter a valid tracking number (example: WIS-3133). If you need help, contact customer support."
                : "Only the shipment that matches your tracking number will be displayed here."}
            </p>
          </div>
        )}
      </div>

      {issueResult ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {issueResult}
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/60 bg-white/85 p-6 shadow-sm backdrop-blur">
        <h2 className="text-lg font-semibold text-slate-900">Order History</h2>
        <p className="mt-1 text-sm text-slate-600">All orders assigned to your client account.</p>
        <div className="mt-3 space-y-2">
          {history.length === 0 ? (
            <p className="text-sm text-slate-500">No order history yet.</p>
          ) : (
            history.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setShipment(row)}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                  selectedShipment?.id === row.id
                    ? "border-amber-300 bg-amber-50 text-amber-800"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <p className="font-semibold">{row.tracking_number}</p>
                <p className="text-xs">
                  {row.status} • {row.payment_status ?? "Awaiting Payment"} • {new Date(row.updated_at).toLocaleString()}
                </p>
              </button>
            ))
          )}
        </div>
      </div>

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


