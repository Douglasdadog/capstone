"use client";

import { useEffect, useMemo, useState } from "react";

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

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </article>
  );
}

export default function SalesPage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newOrigin, setNewOrigin] = useState("");
  const [newDestination, setNewDestination] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [newQuantity, setNewQuantity] = useState("1");
  const [newEta, setNewEta] = useState("");
  const [origin, setOrigin] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | ShipmentStatus>("All");
  const [search, setSearch] = useState("");

  async function fetchShipments() {
    const response = await fetch("/api/logistics/shipments");
    const data = (await response.json()) as { shipments?: Shipment[]; error?: string };
    if (!response.ok) throw new Error(data.error ?? "Unable to fetch sales shipments.");
    setShipments(data.shipments ?? []);
  }

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        await fetchShipments();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load sales module.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

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
      if (!response.ok) throw new Error(data.error ?? "Failed to update shipment status.");
      await fetchShipments();
      if (status === "In Transit" && data.communication && !data.communication.sent) {
        setMessage(`Status updated. Notification note: ${data.communication.message}`);
      } else {
        setMessage(`Status updated to ${status}.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update shipment status.");
    }
  }

  async function generateTrackingLink(shipmentId: string) {
    try {
      setError(null);
      setMessage(null);
      const response = await fetch("/api/logistics/generate-tracking-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipmentId })
      });
      const data = (await response.json()) as { error?: string; trackingLink?: string; token?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to generate tracking link.");
      setShipments((prev) =>
        prev.map((row) => (row.id === shipmentId ? { ...row, tracking_token: data.token ?? row.tracking_token } : row))
      );
      if (data.trackingLink && navigator.clipboard) {
        await navigator.clipboard.writeText(data.trackingLink);
        setMessage("Tracking link generated and copied.");
      } else {
        setMessage("Tracking link generated.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate tracking link.");
    }
  }

  async function createOrder() {
    const quantity = Number.parseInt(newQuantity, 10);
    if (!newClientName.trim() || !newClientEmail.trim() || !newOrigin.trim() || !newDestination.trim()) {
      setError("Client name, email, origin, and destination are required.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Quantity must be a whole number greater than zero.");
      return;
    }

    try {
      setCreatingOrder(true);
      setError(null);
      setMessage(null);
      const response = await fetch("/api/logistics/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: newClientName,
          client_email: newClientEmail,
          origin: newOrigin,
          destination: newDestination,
          item_name: newItemName || null,
          quantity,
          eta: newEta ? new Date(newEta).toISOString() : null
        })
      });
      const data = (await response.json()) as { error?: string; shipment?: Shipment };
      if (!response.ok) throw new Error(data.error ?? "Unable to create order.");

      setMessage(`Order created: ${data.shipment?.tracking_number ?? "Tracking assigned"}.`);
      setNewClientName("");
      setNewClientEmail("");
      setNewOrigin("");
      setNewDestination("");
      setNewItemName("");
      setNewQuantity("1");
      setNewEta("");
      await fetchShipments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create order.");
    } finally {
      setCreatingOrder(false);
    }
  }

  const today = new Date().toDateString();
  const stats = useMemo(() => {
    const pending = shipments.filter((row) => row.status === "Pending").length;
    const transit = shipments.filter((row) => row.status === "In Transit").length;
    const deliveredToday = shipments.filter(
      (row) => row.status === "Delivered" && new Date(row.updated_at).toDateString() === today
    ).length;
    const delayed = shipments.filter(
      (row) => row.status === "In Transit" && Date.now() - new Date(row.updated_at).getTime() > 1000 * 60 * 60 * 48
    ).length;
    return { pending, transit, deliveredToday, delayed };
  }, [shipments, today]);

  const visibleShipments = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return shipments.filter((row) => {
      const statusOk = statusFilter === "All" ? true : row.status === statusFilter;
      if (!statusOk) return false;
      if (!keyword) return true;
      return (
        row.tracking_number.toLowerCase().includes(keyword) ||
        row.client_name.toLowerCase().includes(keyword) ||
        row.destination.toLowerCase().includes(keyword)
      );
    });
  }, [shipments, search, statusFilter]);

  const followUps = useMemo(
    () =>
      shipments.filter(
        (row) =>
          row.status !== "Delivered" &&
          ((row.eta ? new Date(row.eta).getTime() < Date.now() : false) ||
            Date.now() - new Date(row.updated_at).getTime() > 1000 * 60 * 60 * 48)
      ),
    [shipments]
  );

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur">
        <h1 className="bg-gradient-to-r from-slate-900 via-amber-900 to-red-700 bg-clip-text text-3xl font-black text-transparent">
          Sales Module
        </h1>
        <p className="mt-2 text-slate-600">
          Track shipment pipeline, update statuses, and follow up delayed deliveries.
        </p>
      </div>

      {message ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{message}</div>
      ) : null}
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Pending Orders" value={stats.pending} />
        <StatCard label="In Transit" value={stats.transit} />
        <StatCard label="Delivered Today" value={stats.deliveredToday} />
        <StatCard label="Delayed Follow-ups" value={stats.delayed} />
      </div>

      <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Create Order</h2>
          <span className="text-xs text-slate-500">Auto appears in Logistics/Sales</span>
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <input
            value={newClientName}
            onChange={(event) => setNewClientName(event.target.value)}
            placeholder="Client Name"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="email"
            value={newClientEmail}
            onChange={(event) => setNewClientEmail(event.target.value)}
            placeholder="Client Email"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            value={newOrigin}
            onChange={(event) => setNewOrigin(event.target.value)}
            placeholder="Origin"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            value={newDestination}
            onChange={(event) => setNewDestination(event.target.value)}
            placeholder="Destination"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            value={newItemName}
            onChange={(event) => setNewItemName(event.target.value)}
            placeholder="Item Name (optional)"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="number"
            min={1}
            step={1}
            value={newQuantity}
            onChange={(event) => setNewQuantity(event.target.value)}
            placeholder="Quantity"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="datetime-local"
            value={newEta}
            onChange={(event) => setNewEta(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void createOrder()}
            disabled={creatingOrder}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {creatingOrder ? "Creating..." : "Create Order"}
          </button>
        </div>
      </article>

      <div className="grid gap-4 xl:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Shipment Queue</h2>
            <div className="flex w-full flex-wrap gap-2 md:w-auto">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search tracking/client/destination"
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm md:w-64"
              />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "All" | ShipmentStatus)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              >
                <option value="All">All Status</option>
                <option value="Pending">Pending</option>
                <option value="In Transit">In Transit</option>
                <option value="Delivered">Delivered</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            {loading ? (
              <p className="text-sm text-slate-500">Loading shipments...</p>
            ) : visibleShipments.length === 0 ? (
              <p className="text-sm text-slate-500">No shipments found for current filters.</p>
            ) : (
              visibleShipments.map((row) => {
                const trackingUrl = row.tracking_token && origin ? `${origin}/track/${row.tracking_token}` : null;
                return (
                  <div key={row.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs text-slate-500">Tracking #</p>
                        <p className="text-sm font-semibold text-slate-900">{row.tracking_number}</p>
                        <p className="text-xs text-slate-500">
                          {row.client_name} - {row.destination}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <select
                          value={row.status}
                          onChange={(event) => void updateStatus(row.id, event.target.value as ShipmentStatus)}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                        >
                          <option value="Pending">Pending</option>
                          <option value="In Transit">In Transit</option>
                          <option value="Delivered">Delivered</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => void generateTrackingLink(row.id)}
                          className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                        >
                          Generate Link
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 grid gap-1 text-xs text-slate-600 md:grid-cols-3">
                      <p>
                        <span className="font-medium">Route:</span> {row.origin} to {row.destination}
                      </p>
                      <p>
                        <span className="font-medium">ETA:</span>{" "}
                        {row.eta ? new Date(row.eta).toLocaleString() : "Not set"}
                      </p>
                      <p>
                        <span className="font-medium">Updated:</span> {new Date(row.updated_at).toLocaleString()}
                      </p>
                    </div>
                    {trackingUrl ? <p className="mt-1 break-all text-[11px] text-slate-500">{trackingUrl}</p> : null}
                  </div>
                );
              })
            )}
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Priority Follow-ups</h2>
          <p className="mt-1 text-xs text-slate-500">Shipments overdue ETA or stagnant for 48+ hours.</p>
          <div className="mt-3 space-y-2">
            {followUps.length === 0 ? (
              <p className="text-sm text-slate-500">No urgent follow-ups right now.</p>
            ) : (
              followUps.slice(0, 8).map((row) => (
                <div key={row.id} className="rounded-md border border-amber-200 bg-amber-50 p-2">
                  <p className="text-xs font-semibold text-amber-900">{row.tracking_number}</p>
                  <p className="text-xs text-amber-800">
                    {row.client_name} - {row.destination}
                  </p>
                  <p className="text-[11px] text-amber-700">Status: {row.status}</p>
                </div>
              ))
            )}
          </div>
        </article>
      </div>
    </section>
  );
}


