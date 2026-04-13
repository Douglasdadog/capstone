"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

type Shipment = {
  tracking_number: string;
  client_name: string;
  origin: string;
  destination: string;
  status: "Pending" | "In Transit" | "Delivered";
  updated_at: string;
  eta?: string | null;
  provider_name?: string | null;
  waybill_number?: string | null;
};

type ShipmentItem = {
  part_number: string;
  quantity: number;
  batch_id?: string | null;
};

export default function ShipmentTrackingPage() {
  const [trackingNumber, setTrackingNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [items, setItems] = useState<ShipmentItem[]>([]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setShipment(null);
    setItems([]);

    const response = await fetch(
      `/api/public/tracking/search?trackingNumber=${encodeURIComponent(trackingNumber.trim())}`
    );
    const payload = (await response.json()) as {
      error?: string;
      shipment?: Shipment;
      items?: ShipmentItem[];
    };
    if (!response.ok) {
      setError(payload.error ?? "Shipment not found.");
      setLoading(false);
      return;
    }

    setShipment(payload.shipment ?? null);
    setItems(payload.items ?? []);
    setLoading(false);
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl space-y-5 px-6 py-10">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-black text-slate-900">Shipment Tracking</h1>
        <p className="mt-1 text-sm text-slate-600">
          Track a shipment using its tracking number. This page is for tracking only.
        </p>
        <form onSubmit={handleSearch} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            value={trackingNumber}
            onChange={(event) => setTrackingNumber(event.target.value)}
            placeholder="Enter tracking number (e.g. WIS-1001)"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading ? "Searching..." : "Track"}
          </button>
        </form>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </section>

      {shipment ? (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Shipment Details</h2>
            <div className="mt-3 space-y-1 text-sm text-slate-700">
              <p>
                <span className="font-semibold">Tracking #:</span> {shipment.tracking_number}
              </p>
              <p>
                <span className="font-semibold">Client:</span> {shipment.client_name}
              </p>
              <p>
                <span className="font-semibold">Route:</span> {shipment.origin} &rarr; {shipment.destination}
              </p>
              <p>
                <span className="font-semibold">Status:</span> {shipment.status}
              </p>
              <p>
                <span className="font-semibold">ETA:</span>{" "}
                {shipment.eta ? new Date(shipment.eta).toLocaleString() : "-"}
              </p>
              <p>
                <span className="font-semibold">3PL Provider:</span> {shipment.provider_name ?? "-"}
              </p>
              <p>
                <span className="font-semibold">Waybill/Trucker #:</span> {shipment.waybill_number ?? "-"}
              </p>
              <p>
                <span className="font-semibold">Last Updated:</span>{" "}
                {new Date(shipment.updated_at).toLocaleString()}
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Order Summary</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-3 py-2">Battery Part</th>
                    <th className="px-3 py-2">Qty</th>
                    <th className="px-3 py-2">Batch</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={`${item.part_number}-${idx}`} className="border-t border-slate-100">
                      <td className="px-3 py-2">{item.part_number}</td>
                      <td className="px-3 py-2">{item.quantity}</td>
                      <td className="px-3 py-2">{item.batch_id ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      <div className="text-center text-xs text-slate-500">
        <Link href="/" className="text-red-600 hover:underline">
          Back to home
        </Link>
      </div>
    </main>
  );
}
