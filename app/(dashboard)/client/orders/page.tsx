"use client";

import { useEffect, useMemo, useState } from "react";

type Shipment = {
  id: string;
  tracking_number: string;
  status: "Pending" | "In Transit" | "Delivered";
  payment_status?: "Awaiting Payment" | "Submitted" | "Verified" | "Rejected";
  payment_proof_url?: string | null;
  payment_rejection_reason?: string | null;
  tracking_token?: string | null;
  updated_at: string;
  destination?: string;
  origin?: string;
};

export default function ClientOrdersPage() {
  const [orders, setOrders] = useState<Shipment[]>([]);
  const [selected, setSelected] = useState<Shipment | null>(null);
  const [statusFilter, setStatusFilter] = useState<"All" | "Pending" | "In Transit" | "Completed">("All");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadOrders() {
    const response = await fetch("/api/portal/shipments");
    const payload = (await response.json()) as { shipments?: Shipment[]; error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Unable to load orders.");
    const rows = payload.shipments ?? [];
    setOrders(rows);
    setSelected((prev) => prev ?? rows[0] ?? null);
  }

  useEffect(() => {
    void loadOrders().catch((err) => {
      setError(err instanceof Error ? err.message : "Unable to load orders.");
    });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("created") !== "1") return;
    const token = params.get("token");
    const message = token
      ? `Order submitted successfully. It is now linked to your account and visible below. Tracking token: ${token}`
      : "Order submitted successfully. It is now linked to your account and visible below.";
    setNotice(message);
  }, []);

  const visibleOrders = useMemo(
    () =>
      orders.filter((row) => {
        if (statusFilter === "All") return true;
        if (statusFilter === "Completed") return row.status === "Delivered";
        return row.status === statusFilter;
      }),
    [orders, statusFilter]
  );

  async function uploadPaymentProof() {
    if (!selected) return;
    if (!proofFile) {
      setError("Please choose an image file.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("shipmentId", selected.id);
      formData.set("paymentProof", proofFile);
      const response = await fetch("/api/portal/shipments/payment-proof", { method: "POST", body: formData });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to upload payment proof.");
      setNotice("Payment proof uploaded successfully.");
      setProofFile(null);
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to upload payment proof.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h1 className="text-2xl font-bold text-slate-900">Orders</h1>
        <p className="text-sm text-slate-600">
          View your own account orders, filter by status, and upload payment proof for pending requests.
        </p>
      </div>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-2">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Filter</label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "All" | "Pending" | "In Transit" | "Completed")}
              className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="All">All</option>
              <option value="Pending">Pending</option>
              <option value="In Transit">In Transit</option>
              <option value="Completed">Completed</option>
            </select>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            {visibleOrders.length === 0 ? (
              <p className="text-sm text-slate-500">No orders found.</p>
            ) : (
              <div className="space-y-2">
                {visibleOrders.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setSelected(row)}
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                      selected?.id === row.id
                        ? "border-amber-300 bg-amber-50 text-amber-800"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <p className="font-semibold">{row.tracking_number}</p>
                    <p className="text-xs">{row.status} • {row.payment_status ?? "Awaiting Payment"}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
          {!selected ? (
            <p className="text-sm text-slate-500">Select an order to view details.</p>
          ) : (
            <div className="space-y-3">
              <p className="text-lg font-semibold text-slate-900">{selected.tracking_number}</p>
              <p className="text-sm text-slate-700">
                Status: <span className="font-semibold">{selected.status}</span> • Payment:{" "}
                <span className="font-semibold">{selected.payment_status ?? "Awaiting Payment"}</span>
              </p>
              <p className="text-sm text-slate-600">
                Route: {selected.origin ?? "-"} → {selected.destination ?? "-"}
              </p>
              <p className="text-sm text-slate-600">Updated: {new Date(selected.updated_at).toLocaleString()}</p>
              {selected.tracking_token ? (
                <a
                  href={`/api/logistics/invoice/${selected.tracking_token}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block rounded-md border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                >
                  View Digital Invoice
                </a>
              ) : null}
              {selected.status === "Pending" ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-700">Upload Screenshot of Payment</p>
                  {selected.payment_status === "Rejected" ? (
                    <p className="mt-1 text-xs text-red-700">
                      Rejected: {selected.payment_rejection_reason?.trim() || "Please upload a clearer payment proof."}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => setProofFile(event.target.files?.[0] ?? null)}
                      className="text-xs"
                    />
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => void uploadPaymentProof()}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {uploading ? "Uploading..." : "Submit Payment Proof"}
                    </button>
                  </div>
                  {selected.payment_proof_url ? (
                    <a
                      href={selected.payment_proof_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-xs font-semibold text-emerald-700 hover:underline"
                    >
                      View Current Uploaded Proof
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
