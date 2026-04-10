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

export default function ClientPage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [error, setError] = useState<string | null>(null);

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

  return (
    <section className="space-y-6">
      <header className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur">
        <h1 className="bg-gradient-to-r from-slate-900 via-amber-900 to-red-700 bg-clip-text text-3xl font-black text-transparent">
          Client - Track shipment
        </h1>
        <p className="mt-2 text-slate-600">
          Enter a tracking number to see progress. Clients only see their own orders; admins can review all shipments
          for support.
        </p>
      </header>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="space-y-6 rounded-2xl border border-white/60 bg-white/85 p-6 shadow-sm backdrop-blur">
        <div className="space-y-2">
          <label className="text-sm text-slate-600">Tracking number</label>
          <input
            value={trackingNumber}
            onChange={(event) => setTrackingNumber(event.target.value)}
            placeholder="e.g. WIS-1001"
            className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-lg shadow-sm"
          />
        </div>

        {trackedShipment ? (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-2 text-center text-xs font-medium">
              {["Order Confirmed", "Packed", "In Transit", "Delivered"].map((step, idx) => {
                const active =
                  trackedShipment.status === "Delivered"
                    ? true
                    : trackedShipment.status === "In Transit"
                      ? idx <= 2
                      : idx <= 1;
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
              <p>
                <span className="font-medium">Item:</span> {trackedShipment.item_name ?? "General Package"}
              </p>
              <p>
                <span className="font-medium">Quantity:</span> {trackedShipment.quantity ?? 1}
              </p>
              <p>
                <span className="font-medium">Estimated arrival:</span>{" "}
                {trackedShipment.estimated_arrival
                  ? new Date(trackedShipment.estimated_arrival).toLocaleDateString()
                  : "Within 2-4 days"}
              </p>
              <p>
                <span className="font-medium">Route:</span> {trackedShipment.origin} &rarr;{" "}
                {trackedShipment.destination}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Enter a tracking number that matches one of your shipments.</p>
        )}
      </div>
    </section>
  );
}


