"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type InventoryItem = {
  id: string;
  name: string;
  quantity: number;
  threshold_limit: number;
  updated_at: string;
};

type ReplenishmentAlert = {
  id: string;
  item_name: string;
  reading_quantity: number;
  threshold_limit: number;
  status: string;
  message: string;
  created_at: string;
};

export default function InventoryPage() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [alerts, setAlerts] = useState<ReplenishmentAlert[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftQuantity, setDraftQuantity] = useState("");
  const [draftThreshold, setDraftThreshold] = useState("");
  const [rowSavingId, setRowSavingId] = useState<string | null>(null);

  const fetchInventory = useCallback(async () => {
    const response = await fetch("/api/inventory");
    const data = (await response.json()) as { items?: InventoryItem[]; error?: string };
    if (!response.ok) {
      throw new Error(data.error ?? "Unable to fetch inventory.");
    }
    setItems(data.items ?? []);
  }, []);

  const fetchAlerts = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from("auto_replenishment_alerts")
      .select("id, item_name, reading_quantity, threshold_limit, status, message, created_at")
      .order("created_at", { ascending: false })
      .limit(6);

    if (queryError) {
      throw new Error(queryError.message);
    }

    setAlerts((data ?? []) as ReplenishmentAlert[]);
  }, [supabase]);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchInventory(), fetchAlerts()]);
  }, [fetchAlerts, fetchInventory]);

  useEffect(() => {
    async function initialLoad() {
      try {
        setLoading(true);
        setError(null);
        await refreshAll();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load inventory module.");
      } finally {
        setLoading(false);
      }
    }

    void initialLoad();
  }, [refreshAll]);

  useEffect(() => {
    const channel = supabase
      .channel("inventory-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory" },
        () => {
          void fetchInventory();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "auto_replenishment_alerts" },
        () => {
          void fetchAlerts();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchAlerts, fetchInventory, supabase]);

  async function handleSensorSimulation() {
    try {
      setError(null);
      setMessage(null);
      setSimulating(true);

      const response = await fetch("/api/inventory/simulate-sensor", {
        method: "POST"
      });
      const data = (await response.json()) as {
        error?: string;
        item?: { name: string; newQuantity: number; thresholdLimit: number };
        alertTriggered?: boolean;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Sensor simulation failed.");
      }

      if (data.alertTriggered) {
        setMessage(
          `Auto replenishment alert triggered for ${data.item?.name} (qty ${data.item?.newQuantity}, threshold ${data.item?.thresholdLimit}).`
        );
      } else {
        setMessage(
          `Sensor updated ${data.item?.name}. Quantity is now ${data.item?.newQuantity}. No replenishment needed.`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sensor simulation failed.");
    } finally {
      setSimulating(false);
    }
  }

  function startOverride(item: InventoryItem) {
    setMessage(null);
    setError(null);
    setEditingId(item.id);
    setDraftQuantity(String(item.quantity));
    setDraftThreshold(String(item.threshold_limit));
  }

  function cancelOverride() {
    setEditingId(null);
    setDraftQuantity("");
    setDraftThreshold("");
  }

  async function saveOverride(itemId: string) {
    const qty = Number.parseInt(draftQuantity, 10);
    const thresh = Number.parseInt(draftThreshold, 10);
    if (!Number.isFinite(qty) || qty < 0 || !Number.isFinite(thresh) || thresh < 0) {
      setError("Enter non-negative whole numbers for quantity and threshold.");
      return;
    }

    try {
      setError(null);
      setMessage(null);
      setRowSavingId(itemId);
      const response = await fetch("/api/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: itemId,
          quantity: qty,
          threshold_limit: thresh
        })
      });
      const data = (await response.json()) as { error?: string; item?: InventoryItem };
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to save manual override.");
      }
      setMessage(
        `Updated ${data.item?.name ?? "item"}: quantity ${data.item?.quantity}, threshold ${data.item?.threshold_limit}.`
      );
      cancelOverride();
      await fetchInventory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save manual override.");
    } finally {
      setRowSavingId(null);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Inventory Module</h1>
          <p className="text-slate-600">
            Live warehouse stock with sensor simulation, manual quantity/threshold overrides, and auto
            replenishment alerts.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSensorSimulation}
          disabled={simulating}
          className="rounded-md bg-gradient-to-r from-yellow-500 to-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:from-yellow-400 hover:to-amber-400 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {simulating ? "Simulating..." : "Sensor Simulation"}
        </button>
        <Link
          href="/inventory/scanning"
          className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
        >
          Open Mobile Scanner
        </Link>
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

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                Inventory Table
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3">Quantity</th>
                    <th className="px-4 py-3">Threshold</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Updated</th>
                    <th className="px-4 py-3">Manual override</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const lowStock = item.quantity < item.threshold_limit;
                    const isEditing = editingId === item.id;
                    const rowBusy = rowSavingId === item.id;
                    return (
                      <tr key={item.id} className="border-t border-slate-100">
                        <td className="px-4 py-3">{item.name}</td>
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={draftQuantity}
                              onChange={(e) => setDraftQuantity(e.target.value)}
                              disabled={rowBusy}
                              className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
                            />
                          ) : (
                            item.quantity
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={draftThreshold}
                              onChange={(e) => setDraftThreshold(e.target.value)}
                              disabled={rowBusy}
                              className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
                            />
                          ) : (
                            item.threshold_limit
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-1 text-xs ${
                              lowStock
                                ? "bg-red-100 text-red-700"
                                : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {lowStock ? "Below threshold" : "Healthy"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {new Date(item.updated_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={rowBusy}
                                onClick={() => void saveOverride(item.id)}
                                className="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {rowBusy ? "Saving..." : "Save"}
                              </button>
                              <button
                                type="button"
                                disabled={rowBusy}
                                onClick={cancelOverride}
                                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={editingId !== null && editingId !== item.id}
                              onClick={() => startOverride(item)}
                              className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Override
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!loading && items.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-slate-500" colSpan={6}>
                        No inventory items found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div>
          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                Auto Replenishment Alerts
              </h2>
            </div>
            <div className="space-y-3 p-4">
              {alerts.map((alert) => (
                <article key={alert.id} className="rounded-md border border-red-200 bg-red-50 p-3">
                  <p className="text-sm font-medium text-red-800">{alert.item_name}</p>
                  <p className="mt-1 text-xs text-red-700">
                    Qty {alert.reading_quantity} | Threshold {alert.threshold_limit}
                  </p>
                  <p className="mt-1 text-xs text-red-700">{alert.message}</p>
                  <p className="mt-2 text-[11px] text-red-600">
                    {new Date(alert.created_at).toLocaleString()}
                  </p>
                </article>
              ))}
              {!loading && alerts.length === 0 ? (
                <p className="text-sm text-slate-500">No alerts logged yet.</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


