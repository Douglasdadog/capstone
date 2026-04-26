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
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="h-1.5 w-full bg-gradient-to-r from-red-700 via-red-600 to-amber-500" />

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-5">
          <p className="text-3xl font-black italic leading-none text-red-600">imarflex.</p>
          <Link
            href="/"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
          >
            Back to Home
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-4xl space-y-5 px-6 py-8 md:py-10">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-red-700 px-6 py-3">
            <h1 className="text-lg font-bold text-white md:text-xl">Shipment Tracking Portal</h1>
          </div>
          <div className="p-6">
            <p className="text-sm text-slate-600">
              Enter a tracking number to view the latest shipment status, ETA, route, and order details.
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
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
              >
                {loading ? "Searching..." : "Track Shipment"}
              </button>
            </form>
            {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          </div>
        </section>

        {shipment ? (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">Shipment Details</h2>
              <div className="mt-3 grid gap-3 text-sm text-slate-700 md:grid-cols-2">
                <p>
                  <span className="font-semibold">Tracking #:</span> {shipment.tracking_number}
                </p>
                <p>
                  <span className="font-semibold">Status:</span> {shipment.status}
                </p>
                <p>
                  <span className="font-semibold">Client:</span> {shipment.client_name}
                </p>
                <p>
                  <span className="font-semibold">ETA:</span>{" "}
                  {shipment.eta ? new Date(shipment.eta).toLocaleString() : "-"}
                </p>
                <p className="md:col-span-2">
                  <span className="font-semibold">Route:</span> {shipment.origin} &rarr; {shipment.destination}
                </p>
                <p>
                  <span className="font-semibold">3PL Provider:</span> {shipment.provider_name ?? "-"}
                </p>
                <p>
                  <span className="font-semibold">Waybill/Trucker #:</span> {shipment.waybill_number ?? "-"}
                </p>
                <p className="md:col-span-2">
                  <span className="font-semibold">Last Updated:</span>{" "}
                  {new Date(shipment.updated_at).toLocaleString()}
                </p>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">Order Summary</h2>
              <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
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
      </div>
    </main>
  );
}
