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
type InventoryItem = {
  id: string;
  name: string;
  quantity: number;
};
type OrderLine = {
  id: string;
  item_name: string;
  quantity: string;
};

const PROVIDER_OPTIONS = ["LBC", "J&T Express", "2GO", "DHL", "Ninja Van", "Flash Express", "Local Trucking"] as const;
const DEFAULT_ORIGIN = "Imarflex Battery Mfg. Corp. F10, 118 Mercedes Ave, Pasig, Metro Manila";

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </article>
  );
}

export default function SalesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [orderLines, setOrderLines] = useState<OrderLine[]>([{ id: crypto.randomUUID(), item_name: "", quantity: "1" }]);
  const [newClientName, setNewClientName] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newOrigin, setNewOrigin] = useState(DEFAULT_ORIGIN);
  const [newDestination, setNewDestination] = useState("");
  const [newProviderName, setNewProviderName] = useState<(typeof PROVIDER_OPTIONS)[number] | "">("");
  const [newWaybillNumber, setNewWaybillNumber] = useState("");
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

  async function fetchInventoryOptions() {
    const response = await fetch("/api/inventory");
    const data = (await response.json()) as { items?: InventoryItem[]; error?: string };
    if (!response.ok) throw new Error(data.error ?? "Unable to load inventory options.");
    const sorted = [...(data.items ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    setInventoryItems(sorted);
  }

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        await Promise.all([fetchShipments(), fetchInventoryOptions()]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load sales module.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("sales-shipments-realtime")
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

  async function createOrder() {
    if (!newClientName.trim() || !newClientEmail.trim() || !newOrigin.trim() || !newDestination.trim()) {
      setError("Client name, email, origin, and destination are required.");
      return;
    }
    if (newDestination.trim().length < 20) {
      setError("Please provide a detailed destination address (house/building, street, city, province).");
      return;
    }

    const normalizedLines = orderLines
      .map((line) => ({
        ...line,
        item_name: line.item_name.trim(),
        quantityNum: Number.parseInt(line.quantity, 10)
      }))
      .filter((line) => line.item_name.length > 0);

    if (normalizedLines.length === 0) {
      setError("Add at least one item before creating an order.");
      return;
    }
    for (const line of normalizedLines) {
      const inventoryMatch = inventoryItems.find((item) => item.name === line.item_name);
      if (!Number.isFinite(line.quantityNum) || line.quantityNum <= 0) {
        setError(`Quantity for ${line.item_name} must be greater than zero.`);
        return;
      }
      if (!inventoryMatch) {
        setError(`Item not found in inventory: ${line.item_name}`);
        return;
      }
      if (line.quantityNum > inventoryMatch.quantity) {
        setError(`Quantity for ${line.item_name} exceeds stock (${inventoryMatch.quantity}).`);
        return;
      }
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
          provider_name: newProviderName || null,
          waybill_number: newWaybillNumber.trim() || null,
          items: normalizedLines.map((line) => ({
            item_name: line.item_name,
            quantity: line.quantityNum
          })),
          eta: newEta ? new Date(newEta).toISOString() : null
        })
      });
      const data = (await response.json()) as {
        error?: string;
        shipment?: Shipment;
        communication?: { sent: boolean; message: string } | null;
      };
      if (!response.ok) throw new Error(data.error ?? "Unable to create order.");

      const emailNote = data.communication?.sent
        ? " Confirmation email sent."
        : data.communication
          ? ` Email not sent: ${data.communication.message}`
          : "";
      setMessage(`Order created: ${data.shipment?.tracking_number ?? "Tracking assigned"}.${emailNote}`);
      setNewClientName("");
      setNewClientEmail("");
      setNewOrigin(DEFAULT_ORIGIN);
      setNewDestination("");
      setNewProviderName("");
      setNewWaybillNumber("");
      setOrderLines([{ id: crypto.randomUUID(), item_name: "", quantity: "1" }]);
      setNewEta("");
      await Promise.all([fetchShipments(), fetchInventoryOptions()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create order.");
    } finally {
      setCreatingOrder(false);
    }
  }

  function addOrderLine() {
    setOrderLines((prev) => [...prev, { id: crypto.randomUUID(), item_name: "", quantity: "1" }]);
  }

  function removeOrderLine(lineId: string) {
    setOrderLines((prev) => (prev.length > 1 ? prev.filter((line) => line.id !== lineId) : prev));
  }

  function updateOrderLine(lineId: string, patch: Partial<OrderLine>) {
    setOrderLines((prev) => prev.map((line) => (line.id === lineId ? { ...line, ...patch } : line)));
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

  function hoursBetween(dateIso: string): number {
    return Math.max(0, Math.floor((Date.now() - new Date(dateIso).getTime()) / (1000 * 60 * 60)));
  }
  const orderableItems = useMemo(
    () => inventoryItems.filter((item) => Number(item.quantity) > 0),
    [inventoryItems]
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

      <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Create Order</h2>
          <span className="text-xs text-slate-500">Auto appears in Logistics/Sales</span>
        </div>
        <div className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Client Name</span>
            <input
              value={newClientName}
              onChange={(event) => setNewClientName(event.target.value)}
              placeholder="Client Name"
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Client Email</span>
            <input
              type="email"
              value={newClientEmail}
              onChange={(event) => setNewClientEmail(event.target.value)}
              placeholder="Client Email"
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Origin</span>
            <input
              value={newOrigin}
              readOnly
              title="Default origin route for all orders"
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Client Delivery Address
            </span>
            <textarea
              value={newDestination}
              onChange={(event) => setNewDestination(event.target.value)}
              placeholder="House/Building, Street, Barangay, City, Province, ZIP"
              rows={2}
              className="w-full resize-y rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              ETA (Estimated Arrival)
            </span>
            <input
              type="datetime-local"
              value={newEta}
              onChange={(event) => setNewEta(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => void createOrder()}
            disabled={creatingOrder}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {creatingOrder ? "Creating..." : "Create Order"}
          </button>
        </div>
        <div className="mt-1 grid gap-1.5 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">3PL Provider</span>
            <select
              value={newProviderName}
              onChange={(event) => setNewProviderName(event.target.value as (typeof PROVIDER_OPTIONS)[number] | "")}
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
            >
              <option value="">Select provider (optional)</option>
              {PROVIDER_OPTIONS.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Waybill / Trucker #
            </span>
            <input
              value={newWaybillNumber}
              onChange={(event) => setNewWaybillNumber(event.target.value)}
              placeholder="Enter waybill or trucker reference (optional)"
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
            />
          </label>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          Route default: origin is fixed to Imarflex. Destination should be the client&apos;s complete delivery address.
        </p>
        <p className="mt-1 text-[11px] text-slate-500">
          Orders are linked by email. If client email matches an existing account, that shipment appears in that
          account&apos;s dashboard.
        </p>
        <div className="mt-2 space-y-1.5">
          {orderLines.map((line, index) => {
            const selectedInventory = inventoryItems.find((item) => item.name === line.item_name);
            const maxQty = selectedInventory?.quantity ?? 0;
            const selectedElsewhere = new Set(
              orderLines
                .filter((candidate) => candidate.id !== line.id && candidate.item_name.trim().length > 0)
                .map((candidate) => candidate.item_name)
            );
            const optionsForLine = orderableItems.filter(
              (item) => item.name === line.item_name || !selectedElsewhere.has(item.name)
            );
            return (
              <div key={line.id} className="grid gap-1.5 rounded-md border border-slate-200 bg-slate-50 p-1.5 md:grid-cols-[1fr,120px,auto]">
                <select
                  value={line.item_name}
                  onChange={(event) =>
                    updateOrderLine(line.id, {
                      item_name: event.target.value,
                      quantity: "1"
                    })
                  }
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
                >
                  <option value="">Select item #{index + 1}</option>
                  {optionsForLine.map((item) => (
                    <option key={item.id} value={item.name}>
                      {item.name} (Stock: {item.quantity})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, maxQty)}
                  step={1}
                  value={line.quantity}
                  onChange={(event) => {
                    const raw = event.target.value;
                    const parsed = Number.parseInt(raw, 10);
                    const capped =
                      Number.isFinite(parsed) && parsed > 0
                        ? String(Math.min(parsed, Math.max(1, maxQty)))
                        : raw;
                    updateOrderLine(line.id, { quantity: capped });
                  }}
                  placeholder="Qty"
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => addOrderLine()}
                    className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => removeOrderLine(line.id)}
                    disabled={orderLines.length === 1}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    -
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </article>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Pending Orders" value={stats.pending} />
        <StatCard label="In Transit" value={stats.transit} />
        <StatCard label="Delivered Today" value={stats.deliveredToday} />
        <StatCard label="Delayed Follow-ups" value={stats.delayed} />
      </div>

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
                    {row.order_items && row.order_items.length > 0 ? (
                      <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Order Details</p>
                        <p className="mt-1 text-xs text-slate-700">
                          {row.order_items.map((item) => `${item.item_name} x${item.quantity}`).join(" | ")}
                        </p>
                      </div>
                    ) : null}
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
              followUps.slice(0, 8).map((row) => {
                const stagnantHours = hoursBetween(row.updated_at);
                const overdueHours = row.eta ? hoursBetween(row.eta) : 0;
                const overdue = Boolean(row.eta && new Date(row.eta).getTime() < Date.now());
                return (
                  <div key={row.id} className="rounded-md border border-amber-200 bg-amber-50 p-2">
                    <p className="text-xs font-semibold text-amber-900">{row.tracking_number}</p>
                    <p className="text-xs text-amber-800">
                      {row.client_name} - {row.destination}
                    </p>
                    <p className="text-[11px] text-amber-700">Status: {row.status}</p>
                    <p className="mt-1 text-[11px] text-amber-800">
                      Stagnant: <span className="font-semibold">{stagnantHours}h</span> since last update
                    </p>
                    <p className="text-[11px] text-amber-800">
                      ETA:{" "}
                      {overdue ? (
                        <>
                          overdue by <span className="font-semibold">{overdueHours}h</span>
                        </>
                      ) : row.eta ? (
                        `set (${new Date(row.eta).toLocaleString()})`
                      ) : (
                        "not set"
                      )}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </article>
      </div>
    </section>
  );
}


