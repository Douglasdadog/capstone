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
  provider_name?: string | null;
  waybill_number?: string | null;
  eta?: string | null;
  tracking_token?: string | null;
  updated_at: string;
};

const PROVIDER_OPTIONS = ["LBC", "J&T Express", "2GO", "DHL", "Ninja Van", "Flash Express", "Local Trucking"] as const;

export default function LogisticsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [rowSavingId, setRowSavingId] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

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
    setOrigin(window.location.origin);
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

  async function saveDetails(shipment: Shipment) {
    try {
      setError(null);
      setMessage(null);
      setRowSavingId(shipment.id);
      const response = await fetch("/api/logistics/update-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipmentId: shipment.id,
          providerName: shipment.provider_name ?? "",
          waybillNumber: shipment.waybill_number ?? "",
          eta: shipment.eta ?? null
        })
      });
      const data = (await response.json()) as { error?: string; shipment?: Shipment };
      if (!response.ok) throw new Error(data.error ?? "Unable to save logistics details.");
      setShipments((prev) => prev.map((row) => (row.id === shipment.id ? { ...row, ...(data.shipment ?? {}) } : row)));
      setMessage("Logistics details saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save logistics details.");
    } finally {
      setRowSavingId(null);
    }
  }

  async function generateTrackingLink(shipmentId: string) {
    const response = await fetch("/api/logistics/generate-tracking-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shipmentId })
    });
    const data = (await response.json()) as { error?: string; trackingLink?: string; token?: string };
    if (!response.ok) {
      setError(data.error ?? "Unable to generate tracking link.");
      return;
    }
    setShipments((prev) =>
      prev.map((row) => (row.id === shipmentId ? { ...row, tracking_token: data.token ?? row.tracking_token } : row))
    );
    if (data.trackingLink && navigator.clipboard) {
      await navigator.clipboard.writeText(data.trackingLink);
      setMessage("Tracking link generated and copied.");
    } else {
      setMessage(`Tracking link: ${data.trackingLink ?? "generated"}`);
    }
  }

  async function copyTrackingLink(trackingUrl: string | null) {
    if (!trackingUrl) {
      setError("Generate tracking link first.");
      return;
    }
    try {
      setError(null);
      await navigator.clipboard.writeText(trackingUrl);
      setMessage("Tracking link copied.");
    } catch {
      setError("Unable to copy link.");
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Logistics Module</h1>
        <p className="text-sm text-slate-600">
          Manage shipment statuses. Setting status to In Transit triggers the Communication Module.
        </p>
      </div>

      {message ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="space-y-2.5">
        {shipments.map((shipment) => {
          const trackingUrl = shipment.tracking_token && origin ? `${origin}/track/${shipment.tracking_token}` : null;
          return (
            <article key={shipment.id} className="rounded-md border border-slate-200 bg-white p-2.5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
                <div>
                  <p className="text-xs text-slate-500">Tracking #</p>
                  <p className="text-xs font-semibold text-slate-800">{shipment.tracking_number}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Updated</p>
                  <p className="text-[11px] text-slate-700">{new Date(shipment.updated_at).toLocaleString()}</p>
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                <div>
                  <p className="text-xs text-slate-500">Client</p>
                  <p className="text-xs text-slate-800">{shipment.client_name}</p>
                  <p className="break-all text-[11px] text-slate-500">{shipment.client_email}</p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">Route</p>
                  <p className="text-xs text-slate-800">
                    {shipment.origin} &rarr; {shipment.destination}
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-slate-500">Status</label>
                  <select
                    value={shipment.status}
                    onChange={(event) => void updateStatus(shipment.id, event.target.value as ShipmentStatus)}
                    className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                  >
                    <option value="Pending">Pending</option>
                    <option value="In Transit">In Transit</option>
                    <option value="Delivered">Delivered</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-slate-500">3PL Provider</label>
                  <select
                    value={shipment.provider_name ?? ""}
                    onChange={(event) =>
                      setShipments((prev) =>
                        prev.map((row) =>
                          row.id === shipment.id ? { ...row, provider_name: event.target.value } : row
                        )
                      )
                    }
                    className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                  >
                    <option value="">Select provider</option>
                    {PROVIDER_OPTIONS.map((provider) => (
                      <option key={provider} value={provider}>
                        {provider}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-slate-500">Waybill / Trucker #</label>
                  <input
                    value={shipment.waybill_number ?? ""}
                    onChange={(event) =>
                      setShipments((prev) =>
                        prev.map((row) =>
                          row.id === shipment.id ? { ...row, waybill_number: event.target.value } : row
                        )
                      )
                    }
                    placeholder="Waybill / Trucker #"
                    className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-slate-500">ETA</label>
                  <div className="flex gap-1.5">
                    <input
                      type="datetime-local"
                      value={shipment.eta ? new Date(shipment.eta).toISOString().slice(0, 16) : ""}
                      onChange={(event) =>
                        setShipments((prev) =>
                          prev.map((row) =>
                            row.id === shipment.id
                              ? { ...row, eta: event.target.value ? new Date(event.target.value).toISOString() : null }
                              : row
                          )
                        )
                      }
                      className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => void saveDetails(shipment)}
                      disabled={rowSavingId === shipment.id}
                      className="shrink-0 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      {rowSavingId === shipment.id ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-2 border-t border-slate-100 pt-2">
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => void generateTrackingLink(shipment.id)}
                    className="rounded-md border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                  >
                    Generate Link
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyTrackingLink(trackingUrl)}
                    disabled={!trackingUrl}
                    className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Copy Link
                  </button>
                </div>
                {trackingUrl ? <p className="mt-1 break-all text-[11px] text-slate-500">{trackingUrl}</p> : null}
              </div>
            </article>
          );
        })}

        {!loading && shipments.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">No shipments found.</div>
        ) : null}
      </div>
    </section>
  );
}


