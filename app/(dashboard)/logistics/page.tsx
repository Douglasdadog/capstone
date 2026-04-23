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
  order_items?: Array<{ item_name: string; quantity: number }>;
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
  const [rowEmailingId, setRowEmailingId] = useState<string | null>(null);
  const [rowDeletingId, setRowDeletingId] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | ShipmentStatus>("All");
  const [sortBy, setSortBy] = useState<"updated_desc" | "updated_asc" | "tracking_asc" | "tracking_desc" | "client_asc">(
    "updated_desc"
  );
  const [search, setSearch] = useState("");

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

  async function resendConfirmationEmail(shipmentId: string) {
    try {
      setError(null);
      setMessage(null);
      setRowEmailingId(shipmentId);
      const response = await fetch("/api/logistics/resend-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipmentId })
      });
      const data = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to resend confirmation email.");
      }
      setMessage(data.message ?? "Confirmation email resent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend confirmation email.");
    } finally {
      setRowEmailingId(null);
    }
  }

  async function deleteOrder(shipment: Shipment) {
    const ok = window.confirm(
      `Delete order ${shipment.tracking_number} for ${shipment.client_name}? This cannot be undone.`
    );
    if (!ok) return;

    try {
      setError(null);
      setMessage(null);
      setRowDeletingId(shipment.id);
      const response = await fetch("/api/logistics/delete-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipmentId: shipment.id })
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to delete order.");
      }
      setShipments((prev) => prev.filter((row) => row.id !== shipment.id));
      setMessage(`Order ${shipment.tracking_number} deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete order.");
    } finally {
      setRowDeletingId(null);
    }
  }

  const visibleShipments = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const filtered = shipments.filter((row) => {
      const statusOk = statusFilter === "All" ? true : row.status === statusFilter;
      if (!statusOk) return false;
      if (!keyword) return true;
      return (
        row.tracking_number.toLowerCase().includes(keyword) ||
        row.client_name.toLowerCase().includes(keyword) ||
        row.client_email.toLowerCase().includes(keyword) ||
        row.origin.toLowerCase().includes(keyword) ||
        row.destination.toLowerCase().includes(keyword)
      );
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "updated_desc") return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      if (sortBy === "updated_asc") return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
      if (sortBy === "tracking_asc") return a.tracking_number.localeCompare(b.tracking_number);
      if (sortBy === "tracking_desc") return b.tracking_number.localeCompare(a.tracking_number);
      return a.client_name.localeCompare(b.client_name);
    });
  }, [search, shipments, sortBy, statusFilter]);

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

      <div className="grid gap-2 rounded-md border border-slate-200 bg-white p-2 md:grid-cols-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search tracking/client/route"
          className="rounded-md border border-slate-300 px-2 py-1.5 text-xs"
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as "All" | ShipmentStatus)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-xs"
        >
          <option value="All">All Status</option>
          <option value="Pending">Pending</option>
          <option value="In Transit">In Transit</option>
          <option value="Delivered">Delivered</option>
        </select>
        <select
          value={sortBy}
          onChange={(event) =>
            setSortBy(
              event.target.value as "updated_desc" | "updated_asc" | "tracking_asc" | "tracking_desc" | "client_asc"
            )
          }
          className="rounded-md border border-slate-300 px-2 py-1.5 text-xs"
        >
          <option value="updated_desc">Sort: Updated (Newest)</option>
          <option value="updated_asc">Sort: Updated (Oldest)</option>
          <option value="tracking_asc">Sort: Tracking (A-Z)</option>
          <option value="tracking_desc">Sort: Tracking (Z-A)</option>
          <option value="client_asc">Sort: Client (A-Z)</option>
        </select>
      </div>

      <div className="space-y-2.5">
        {visibleShipments.map((shipment) => {
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
                {shipment.order_items && shipment.order_items.length > 0 ? (
                  <div className="mb-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Order Details</p>
                    <p className="mt-1 text-xs text-slate-700">
                      {shipment.order_items.map((item) => `${item.item_name} x${item.quantity}`).join(" | ")}
                    </p>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => void copyTrackingLink(trackingUrl)}
                    disabled={!trackingUrl}
                    className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Copy Link
                  </button>
                  <button
                    type="button"
                    onClick={() => void resendConfirmationEmail(shipment.id)}
                    disabled={rowEmailingId === shipment.id}
                    className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-60"
                  >
                    {rowEmailingId === shipment.id ? "Resending..." : "Resend Confirmation Email"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteOrder(shipment)}
                    disabled={rowDeletingId === shipment.id}
                    className="rounded-md border border-red-300 bg-white px-2 py-0.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >
                    {rowDeletingId === shipment.id ? "Deleting..." : "Delete Order"}
                  </button>
                </div>
                {trackingUrl ? <p className="mt-1 break-all text-[11px] text-slate-500">{trackingUrl}</p> : null}
              </div>
            </article>
          );
        })}

        {!loading && visibleShipments.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">No shipments found.</div>
        ) : null}
      </div>
    </section>
  );
}


