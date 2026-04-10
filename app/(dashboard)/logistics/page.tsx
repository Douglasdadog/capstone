"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ShipmentStatus = "Pending" | "In Transit" | "Delivered";
type Shipment = {
  id: string;
  tracking_number: string;
  client_name: string;
  client_email: string;
  origin: string;
  destination: string;
  status: ShipmentStatus;
  updated_at: string;
};

export default function LogisticsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function fetchShipments() {
    const response = await fetch("/api/logistics/shipments");
    const data = (await response.json()) as { shipments?: Shipment[]; error?: string };
    if (!response.ok) throw new Error(data.error ?? "Unable to fetch shipments.");
    setShipments(data.shipments ?? []);
  }

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        await fetchShipments();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load logistics module.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("shipments-realtime-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "shipments" }, () => {
        void fetchShipments();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase]);

  async function updateStatus(shipmentId: string, status: ShipmentStatus) {
    try {
      setError(null);
      setMessage(null);
      const response = await fetch("/api/logistics/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipmentId, status })
      });
      const data = (await response.json()) as {
        error?: string;
        communication?: { sent: boolean; message: string } | null;
      };
      if (!response.ok) throw new Error(data.error ?? "Failed to update shipment.");

      if (status === "In Transit") {
        if (data.communication?.sent) {
          setMessage("Status updated to In Transit and email notification sent.");
        } else if (data.communication) {
          setMessage(`Status updated. Email not sent: ${data.communication.message}`);
        } else {
          setMessage("Status updated to In Transit.");
        }
      } else {
        setMessage(`Status updated to ${status}.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status.");
    }
  }

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Logistics Module</h1>
        <p className="text-slate-600">
          Manage shipment statuses. Setting status to In Transit triggers the Communication Module.
        </p>
      </div>

      {message ? (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-4 py-3">Tracking #</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Route</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {shipments.map((shipment) => (
              <tr key={shipment.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-slate-800">{shipment.tracking_number}</td>
                <td className="px-4 py-3">
                  <p>{shipment.client_name}</p>
                  <p className="text-xs text-slate-500">{shipment.client_email}</p>
                </td>
                <td className="px-4 py-3">
                  {shipment.origin} &rarr; {shipment.destination}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={shipment.status}
                    onChange={(event) => void updateStatus(shipment.id, event.target.value as ShipmentStatus)}
                    className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                  >
                    <option value="Pending">Pending</option>
                    <option value="In Transit">In Transit</option>
                    <option value="Delivered">Delivered</option>
                  </select>
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {new Date(shipment.updated_at).toLocaleString()}
                </td>
              </tr>
            ))}
            {!loading && shipments.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={5}>
                  No shipments found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

