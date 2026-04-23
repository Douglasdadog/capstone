"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type InventoryItem = {
  id: string;
  category?: string | null;
  name: string;
  image_url?: string | null;
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

type MonitoringPayload = {
  source?: "live" | "preview";
  temperatureC?: number | null;
  humidityPct?: number | null;
  lastReadingAt?: string | null;
  uptimeSeconds?: number | null;
  isRunning?: boolean;
  connectionStatus?: "connected" | "disconnected";
  note?: string;
  error?: string;
};
type InventorySortKey = "name" | "category" | "quantity" | "threshold" | "status" | "updated";
type SortDirection = "asc" | "desc";

function formatUptime(seconds: number | null | undefined, showPlaceholder = false): string {
  if (!seconds || seconds <= 0) return showPlaceholder ? "--" : "0m";
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function InventoryPage() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<ReplenishmentAlert[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftQuantity, setDraftQuantity] = useState("");
  const [draftThreshold, setDraftThreshold] = useState("");
  const [rowSavingId, setRowSavingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<"Maintenance Free" | "Conventional">("Maintenance Free");
  const [newQuantity, setNewQuantity] = useState("0");
  const [newThreshold, setNewThreshold] = useState("5");
  const [newImageUrl, setNewImageUrl] = useState("");
  const [addingProduct, setAddingProduct] = useState(false);
  const [lastInventoryEventAt, setLastInventoryEventAt] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<"CONNECTING" | "CONNECTED" | "DISCONNECTED">("CONNECTING");
  const [temperatureC, setTemperatureC] = useState<number | null>(null);
  const [humidityPct, setHumidityPct] = useState<number | null>(null);
  const [iotUptimeSeconds, setIotUptimeSeconds] = useState<number>(0);
  const [iotRunning, setIotRunning] = useState(false);
  const [lastEnvironmentReadingAt, setLastEnvironmentReadingAt] = useState<string | null>(null);
  const [iotConnectionStatus, setIotConnectionStatus] = useState<"connected" | "disconnected">("disconnected");
  const [iotStatusNote, setIotStatusNote] = useState<string | null>(null);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [scannerUrl, setScannerUrl] = useState<string | null>(null);
  const [scannerQrDataUrl, setScannerQrDataUrl] = useState<string | null>(null);
  const [copyScannerLinkLabel, setCopyScannerLinkLabel] = useState("Copy Link");
  const [sortKey, setSortKey] = useState<InventorySortKey>("updated");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const canManageProducts = role === "SuperAdmin" || role === "Admin" || role === "Inventory";
  const lowStockCount = useMemo(
    () => items.filter((item) => item.quantity < item.threshold_limit).length,
    [items]
  );
  const effectiveAlerts = useMemo(() => {
    const existing = alerts.map((alert) => ({ ...alert, isSynthetic: false as const }));
    const lowStockFallback = items
      .filter((item) => item.quantity < item.threshold_limit)
      .filter((item) => !alerts.some((alert) => alert.item_name.toLowerCase() === item.name.toLowerCase()))
      .map((item) => ({
        id: `synthetic-${item.id}`,
        item_name: item.name,
        reading_quantity: item.quantity,
        threshold_limit: item.threshold_limit,
        status: "triggered",
        message: `Auto replenishment triggered for ${item.name}`,
        created_at: item.updated_at,
        isSynthetic: true as const
      }));

    return [...existing, ...lowStockFallback]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 6);
  }, [alerts, items]);
  const alertsTodayCount = useMemo(() => {
    const today = new Date();
    return effectiveAlerts.filter((alert) => {
      const created = new Date(alert.created_at);
      return (
        created.getFullYear() === today.getFullYear() &&
        created.getMonth() === today.getMonth() &&
        created.getDate() === today.getDate()
      );
    }).length;
  }, [effectiveAlerts]);
  const lastKnownInventoryEvent = useMemo(() => {
    if (lastInventoryEventAt) return new Date(lastInventoryEventAt);
    if (lastEnvironmentReadingAt) return new Date(lastEnvironmentReadingAt);
    if (effectiveAlerts.length > 0) return new Date(effectiveAlerts[0].created_at);
    return null;
  }, [effectiveAlerts, lastEnvironmentReadingAt, lastInventoryEventAt]);
  const sortedItems = useMemo(() => {
    const statusRank = (item: InventoryItem) => {
      if (item.quantity <= 0) return 0;
      if (item.quantity < item.threshold_limit) return 1;
      return 2;
    };

    const list = [...items];
    list.sort((a, b) => {
      let base = 0;
      if (sortKey === "name") base = a.name.localeCompare(b.name);
      else if (sortKey === "category") base = (a.category ?? "").localeCompare(b.category ?? "");
      else if (sortKey === "quantity") base = a.quantity - b.quantity;
      else if (sortKey === "threshold") base = a.threshold_limit - b.threshold_limit;
      else if (sortKey === "status") base = statusRank(a) - statusRank(b);
      else base = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
      return sortDirection === "asc" ? base : -base;
    });
    return list;
  }, [items, sortDirection, sortKey]);

  function toggleSort(nextKey: InventorySortKey) {
    if (sortKey === nextKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection("asc");
  }

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

  const fetchMonitoring = useCallback(async () => {
    const response = await fetch("/api/inventory/monitoring");
    const data = (await response.json()) as MonitoringPayload;
    if (!response.ok) {
      throw new Error(data.error ?? "Unable to fetch monitoring data.");
    }
    const connected = data.connectionStatus === "connected";
    const hasLiveReading = typeof data.lastReadingAt === "string";
    setTemperatureC(connected && hasLiveReading && typeof data.temperatureC === "number" ? data.temperatureC : null);
    setHumidityPct(connected && hasLiveReading && typeof data.humidityPct === "number" ? data.humidityPct : null);
    setIotUptimeSeconds(typeof data.uptimeSeconds === "number" ? data.uptimeSeconds : 0);
    setIotRunning(Boolean(data.isRunning));
    setLastEnvironmentReadingAt(typeof data.lastReadingAt === "string" ? data.lastReadingAt : null);
    setIotConnectionStatus(data.connectionStatus === "connected" ? "connected" : "disconnected");
    setIotStatusNote(typeof data.note === "string" && data.note.length > 0 ? data.note : null);
  }, []);

  async function refreshMonitoringStatus() {
    try {
      setRefreshingStatus(true);
      setError(null);
      await fetchMonitoring();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to refresh monitoring status.");
    } finally {
      setRefreshingStatus(false);
    }
  }

  async function copyScannerLink() {
    if (!scannerUrl) return;
    try {
      await navigator.clipboard.writeText(scannerUrl);
      setCopyScannerLinkLabel("Copied!");
      setTimeout(() => setCopyScannerLinkLabel("Copy Link"), 1500);
    } catch {
      setCopyScannerLinkLabel("Copy failed");
      setTimeout(() => setCopyScannerLinkLabel("Copy Link"), 1500);
    }
  }

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchInventory(), fetchAlerts(), fetchMonitoring()]);
  }, [fetchAlerts, fetchInventory, fetchMonitoring]);

  useEffect(() => {
    async function initialLoad() {
      try {
        setLoading(true);
        setError(null);
        const sessionResponse = await fetch("/api/auth/session");
        if (sessionResponse.ok) {
          const sessionData = (await sessionResponse.json()) as { role?: string };
          setRole(sessionData.role ?? null);
        }
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
    let active = true;
    async function buildScannerAccess() {
      const response = await fetch("/api/inventory/scanner-link");
      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        if (active) {
          setScannerUrl(null);
          setScannerQrDataUrl(null);
        }
        return;
      }
      const url = payload.url;
      setScannerUrl(url);
      try {
        const qrcode = await import("qrcode");
        const dataUrl = await qrcode.toDataURL(url, { width: 220, margin: 1 });
        if (active) setScannerQrDataUrl(dataUrl);
      } catch {
        if (active) setScannerQrDataUrl(null);
      }
    }
    void buildScannerAccess();
    return () => {
      active = false;
    };
  }, []);

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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sensor_logs" },
        () => {
          void fetchMonitoring();
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeStatus("CONNECTED");
          return;
        }
        if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setRealtimeStatus("DISCONNECTED");
          return;
        }
        setRealtimeStatus("CONNECTING");
      });

    return () => {
      setRealtimeStatus("DISCONNECTED");
      void supabase.removeChannel(channel);
    };
  }, [fetchAlerts, fetchInventory, fetchMonitoring, supabase]);

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

  async function addProduct() {
    const qty = Number.parseInt(newQuantity, 10);
    const thresh = Number.parseInt(newThreshold, 10);
    if (!newName.trim()) {
      setError("Product name is required.");
      return;
    }
    if (!Number.isFinite(qty) || qty < 0 || !Number.isFinite(thresh) || thresh < 0) {
      setError("Enter non-negative whole numbers for quantity and threshold.");
      return;
    }

    try {
      setAddingProduct(true);
      setError(null);
      setMessage(null);
      const response = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          category: newCategory,
          quantity: qty,
          threshold_limit: thresh,
          image_url: newImageUrl.trim() || undefined
        })
      });
      const data = (await response.json()) as { error?: string; item?: InventoryItem };
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to add product.");
      }

      setMessage(`Added ${data.item?.name ?? "new product"} to inventory.`);
      setNewName("");
      setNewCategory("Maintenance Free");
      setNewQuantity("0");
      setNewThreshold("5");
      setNewImageUrl("");
      await fetchInventory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add product.");
    } finally {
      setAddingProduct(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Inventory Module</h1>
          <p className="text-slate-600">
            Live warehouse stock with manual quantity/threshold overrides and auto replenishment alerts.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Inventory Monitoring</h2>
          <button
            type="button"
            onClick={() => void refreshMonitoringStatus()}
            disabled={refreshingStatus}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {refreshingStatus ? "Refreshing..." : "Refresh Status"}
          </button>
        </div>
        <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7">
          <article className="rounded-md border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-2.5">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Live Feed Status</p>
            <p
              className={`mt-1 text-xs font-semibold leading-tight ${
                realtimeStatus === "CONNECTED" && iotConnectionStatus === "connected"
                  ? "text-green-700"
                  : realtimeStatus === "CONNECTING"
                    ? "text-amber-700"
                    : "text-red-700"
              }`}
            >
              {realtimeStatus === "CONNECTED" && iotConnectionStatus === "connected"
                ? iotRunning
                  ? "Connected (IoT Running)"
                  : "Connected (Standby)"
                : realtimeStatus === "CONNECTING"
                  ? "Connecting..."
                  : "Disconnected (Monitoring Device Not Connected)"}
            </p>
            {iotConnectionStatus === "disconnected" && iotStatusNote ? (
              <p className="mt-1 line-clamp-2 text-[10px] leading-tight text-slate-500">{iotStatusNote}</p>
            ) : null}
          </article>
          <article className="rounded-md border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-2.5">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Battery Temp</p>
            <p className="mt-1 text-xs font-semibold text-slate-800">
              {temperatureC !== null ? `${temperatureC.toFixed(1)} C` : "--"}
            </p>
          </article>
          <article className="rounded-md border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-2.5">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Humidity</p>
            <p className="mt-1 text-xs font-semibold text-slate-800">
              {humidityPct !== null ? `${humidityPct.toFixed(1)} %RH` : "--"}
            </p>
          </article>
          <article className="rounded-md border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-2.5">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">IoT Uptime</p>
            <p className={`mt-1 text-xs font-semibold ${iotRunning ? "text-green-700" : "text-slate-700"}`}>
              {formatUptime(iotUptimeSeconds, iotConnectionStatus !== "connected")}
            </p>
          </article>
          <article className="rounded-md border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-2.5">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Last Inventory Event</p>
            <p className="mt-1 text-xs font-semibold text-slate-800">
              {lastKnownInventoryEvent ? lastKnownInventoryEvent.toLocaleString() : "No event yet"}
            </p>
          </article>
          <article className="rounded-md border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-2.5">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Alerts Today</p>
            <p className="mt-1 text-xs font-semibold text-slate-800">{alertsTodayCount}</p>
          </article>
          <article className="rounded-md border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-2.5">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Low Stock Items</p>
            <p className={`mt-1 text-xs font-semibold ${lowStockCount > 0 ? "text-red-700" : "text-green-700"}`}>
              {lowStockCount}
            </p>
          </article>
        </div>
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
                    <th className="px-4 py-3">
                      <button type="button" onClick={() => toggleSort("name")} className="inline-flex items-center gap-1 font-semibold">
                        Item {sortKey === "name" ? (sortDirection === "asc" ? "↑" : "↓") : ""}
                      </button>
                    </th>
                    <th className="px-4 py-3">
                      <button type="button" onClick={() => toggleSort("category")} className="inline-flex items-center gap-1 font-semibold">
                        Category {sortKey === "category" ? (sortDirection === "asc" ? "↑" : "↓") : ""}
                      </button>
                    </th>
                    <th className="px-4 py-3">
                      <button type="button" onClick={() => toggleSort("quantity")} className="inline-flex items-center gap-1 font-semibold">
                        Quantity {sortKey === "quantity" ? (sortDirection === "asc" ? "↑" : "↓") : ""}
                      </button>
                    </th>
                    <th className="px-4 py-3">
                      <button type="button" onClick={() => toggleSort("threshold")} className="inline-flex items-center gap-1 font-semibold">
                        Threshold {sortKey === "threshold" ? (sortDirection === "asc" ? "↑" : "↓") : ""}
                      </button>
                    </th>
                    <th className="px-4 py-3">
                      <button type="button" onClick={() => toggleSort("status")} className="inline-flex items-center gap-1 font-semibold">
                        Status {sortKey === "status" ? (sortDirection === "asc" ? "↑" : "↓") : ""}
                      </button>
                    </th>
                    <th className="px-4 py-3">
                      <button type="button" onClick={() => toggleSort("updated")} className="inline-flex items-center gap-1 font-semibold">
                        Updated {sortKey === "updated" ? (sortDirection === "asc" ? "↑" : "↓") : ""}
                      </button>
                    </th>
                    <th className="px-4 py-3">Manual override</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map((item) => {
                    const outOfStock = item.quantity <= 0;
                    const belowThreshold = !outOfStock && item.quantity < item.threshold_limit;
                    const isEditing = editingId === item.id;
                    const rowBusy = rowSavingId === item.id;
                    const category = item.category?.trim() || "Uncategorized";
                    return (
                      <tr key={item.id} className="border-t border-slate-100">
                        <td className="px-4 py-3">{item.name}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-medium ${
                              category === "Maintenance Free"
                                ? "bg-amber-100 text-amber-800"
                                : category === "Conventional"
                                  ? "bg-slate-200 text-slate-700"
                                  : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {category}
                          </span>
                        </td>
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
                              outOfStock
                                ? "bg-red-100 text-red-700"
                                : belowThreshold
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-green-100 text-green-700"
                            }`}
                          >
                            {outOfStock ? "Out of stock" : belowThreshold ? "Below threshold" : "Healthy"}
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
                      <td className="px-4 py-6 text-slate-500" colSpan={7}>
                        No inventory items found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Scan via Phone</h2>
            <p className="mt-1 text-xs text-slate-600">
              Open this link on your phone to launch the BYOD barcode scanner instantly.
            </p>
            <div className="mt-2 flex flex-wrap items-start gap-3">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-1.5">
                {scannerQrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={scannerQrDataUrl} alt="Scanner link QR" className="h-24 w-24 rounded" />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center text-[11px] text-slate-500">
                    Generating QR...
                  </div>
                )}
              </div>
              <div className="min-w-[220px] flex-1">
                <p className="break-all rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-700">
                  {scannerUrl ?? "Preparing scanner link..."}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => void copyScannerLink()}
                    disabled={!scannerUrl}
                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    {copyScannerLinkLabel}
                  </button>
                  <Link
                    href="/inventory/scanning"
                    className="rounded-md border border-red-300 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100"
                  >
                    Open Scanner
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {canManageProducts ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Manual Add Product</h2>
              <div className="mt-3 space-y-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="Product name"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={newCategory}
                    onChange={(event) => setNewCategory(event.target.value as "Maintenance Free" | "Conventional")}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="Maintenance Free">Maintenance Free</option>
                    <option value="Conventional">Conventional</option>
                  </select>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={newQuantity}
                    onChange={(event) => setNewQuantity(event.target.value)}
                    placeholder="Quantity"
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={newThreshold}
                    onChange={(event) => setNewThreshold(event.target.value)}
                    placeholder="Threshold"
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    type="url"
                    value={newImageUrl}
                    onChange={(event) => setNewImageUrl(event.target.value)}
                    placeholder="Image URL (optional)"
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => void addProduct()}
                  disabled={addingProduct}
                  className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {addingProduct ? "Adding..." : "Add Product"}
                </button>
              </div>
            </div>
          ) : null}

          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                Auto Replenishment Alerts
              </h2>
            </div>
            <div className="space-y-3 p-4">
              {effectiveAlerts.map((alert) => (
                <article key={alert.id} className="rounded-md border border-red-200 bg-red-50 p-3">
                  <p className="text-sm font-medium text-red-800">{alert.item_name}</p>
                  <p className="mt-1 text-xs text-red-700">
                    Qty {alert.reading_quantity} | Threshold {alert.threshold_limit}
                  </p>
                  <p className="mt-1 text-xs text-red-700">{alert.message}</p>
                  {"isSynthetic" in alert && alert.isSynthetic ? (
                    <p className="mt-1 text-[11px] text-red-600">Pending log sync from manual override.</p>
                  ) : null}
                  <p className="mt-2 text-[11px] text-red-600">
                    {new Date(alert.created_at).toLocaleString()}
                  </p>
                </article>
              ))}
              {!loading && effectiveAlerts.length === 0 ? (
                <p className="text-sm text-slate-500">No alerts logged yet.</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


