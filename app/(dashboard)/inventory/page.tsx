"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import ManifestUploadPanel from "@/components/manifest-upload-panel";
import { queueOfflineTransaction } from "@/lib/offline/transaction-queue";

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
  latestSensorAlert?: {
    id: string;
    severity: "warning" | "critical";
    message: string;
    device_id: string;
    created_at: string;
  } | null;
  note?: string;
  staleSeconds?: number;
  telemetryLagMs?: number;
  observedMedianIntervalMs?: number | null;
  staleThresholdMs?: number;
  serverNow?: string;
  localIotEndpoint?: string | null;
  error?: string;
};
type InventorySortKey = "name" | "category" | "quantity" | "threshold" | "status" | "updated";
type SortDirection = "asc" | "desc";

const MANUAL_ADD_DEFAULT_THRESHOLD = 10;

type LocalIotProbeResult = {
  reachable: boolean;
  url?: string;
  message?: string;
};

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
  const [rowDeletingId, setRowDeletingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<"Maintenance Free" | "Conventional">("Maintenance Free");
  const [newQuantity, setNewQuantity] = useState("0");
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
  const [latestSensorAlert, setLatestSensorAlert] = useState<MonitoringPayload["latestSensorAlert"]>(null);
  const [localIotReachable, setLocalIotReachable] = useState(false);
  const [localIotEndpoint, setLocalIotEndpoint] = useState<string | null>(null);
  const [lastLocalIotReachableAtMs, setLastLocalIotReachableAtMs] = useState<number | null>(null);
  const [onlineSinceMs, setOnlineSinceMs] = useState<number | null>(null);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [refreshingInventory, setRefreshingInventory] = useState(false);
  const [clockTick, setClockTick] = useState(() => Date.now());
  const [scannerUrl, setScannerUrl] = useState<string | null>(null);
  const [scannerQrDataUrl, setScannerQrDataUrl] = useState<string | null>(null);
  const [scannerLinkCopied, setScannerLinkCopied] = useState(false);
  const [scannerActivated, setScannerActivated] = useState(false);
  const [sortKey, setSortKey] = useState<InventorySortKey>("updated");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const copyFeedbackTimeoutRef = useRef<number | null>(null);
  const monitoringRequestSeqRef = useRef(0);

  const canManageProducts = role === "SuperAdmin" || role === "Admin" || role === "Inventory";
  const canOverrideInventory = role === "SuperAdmin" || role === "Admin";
  const canDeleteInventory = role === "SuperAdmin";
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
  const sensorLastUpdatedLabel = useMemo(() => {
    if (!lastEnvironmentReadingAt) return "No reading yet";
    const readingMs = Date.parse(lastEnvironmentReadingAt);
    if (!Number.isFinite(readingMs)) return "Timestamp unavailable";
    const secondsAgo = Math.max(0, Math.floor((clockTick - readingMs) / 1000));
    if (secondsAgo < 60) return `${secondsAgo}s ago`;
    const minutesAgo = Math.floor(secondsAgo / 60);
    if (minutesAgo < 60) return `${minutesAgo}m ago`;
    const hoursAgo = Math.floor(minutesAgo / 60);
    return `${hoursAgo}h ago`;
  }, [clockTick, lastEnvironmentReadingAt]);
  const displayIotUptimeSeconds = useMemo(() => {
    if (iotConnectionStatus !== "connected" || onlineSinceMs === null) return 0;
    return Math.max(0, Math.floor((clockTick - onlineSinceMs) / 1000));
  }, [clockTick, iotConnectionStatus, onlineSinceMs]);
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

  async function probeLocalIot(endpoint: string | null | undefined): Promise<LocalIotProbeResult> {
    const baseUrl = typeof endpoint === "string" ? endpoint.trim() : "";
    if (!baseUrl) {
      return { reachable: false, message: "No local IoT endpoint configured." };
    }

    try {
      const url = new URL(baseUrl);
      url.searchParams.set("_t", String(Date.now()));
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 5000);
      await fetch(url.toString(), {
        method: "GET",
        mode: "no-cors",
        cache: "no-store",
        signal: controller.signal
      });
      window.clearTimeout(timeoutId);
      return { reachable: true, url: baseUrl };
    } catch {
      return { reachable: false, message: "Configured local IoT endpoint is unreachable from this browser." };
    }
  }

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
    const nextItems = data.items ?? [];
    setItems(nextItems);
    const latest = nextItems
      .map((row) => row.updated_at)
      .filter((value) => typeof value === "string")
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
    if (latest) setLastInventoryEventAt(latest);
  }, []);

  const fetchAlerts = useCallback(async () => {
    const response = await fetch("/api/inventory/alerts");
    const data = (await response.json()) as { alerts?: ReplenishmentAlert[]; error?: string };
    if (!response.ok) {
      throw new Error(data.error ?? "Unable to fetch replenishment alerts.");
    }
    setAlerts(data.alerts ?? []);
  }, []);

  const fetchMonitoring = useCallback(async () => {
    const requestSeq = monitoringRequestSeqRef.current + 1;
    monitoringRequestSeqRef.current = requestSeq;
    const response = await fetch(`/api/inventory/monitoring?t=${Date.now()}`, { cache: "no-store" });
    const data = (await response.json()) as MonitoringPayload;
    if (!response.ok) {
      throw new Error(data.error ?? "Unable to fetch monitoring data.");
    }
    if (requestSeq !== monitoringRequestSeqRef.current) {
      // Ignore stale monitoring responses when multiple refreshes overlap.
      return;
    }
    const localProbe = await probeLocalIot(data.localIotEndpoint);
    if (requestSeq !== monitoringRequestSeqRef.current) {
      return;
    }
    const nowMs = Date.now();
    const localReachabilityGraceMs = 30_000;
    const recentlyReachableFromLocal =
      lastLocalIotReachableAtMs !== null && nowMs - lastLocalIotReachableAtMs <= localReachabilityGraceMs;
    if (localProbe.reachable) {
      setLastLocalIotReachableAtMs(nowMs);
    }
    const connectedFromTelemetry = data.connectionStatus === "connected";
    const connectedFromLocal = localProbe.reachable || recentlyReachableFromLocal;
    const connected = connectedFromTelemetry;
    const hasLiveReading = connected && typeof data.lastReadingAt === "string";
    setTemperatureC(hasLiveReading && typeof data.temperatureC === "number" ? data.temperatureC : null);
    setHumidityPct(hasLiveReading && typeof data.humidityPct === "number" ? data.humidityPct : null);
    setIotUptimeSeconds(connected && typeof data.uptimeSeconds === "number" ? data.uptimeSeconds : 0);
    setIotRunning(Boolean(data.isRunning) && connected);
    setLastEnvironmentReadingAt(connected && typeof data.lastReadingAt === "string" ? data.lastReadingAt : null);
    setIotConnectionStatus(connected ? "connected" : "disconnected");
    setLocalIotReachable(connectedFromLocal);
    setLocalIotEndpoint(localProbe.url ?? null);
    const telemetryNote = typeof data.note === "string" && data.note.length > 0 ? data.note : null;
    setIotStatusNote(telemetryNote ?? localProbe.message ?? null);
    setLatestSensorAlert(data.latestSensorAlert ?? null);
    setRealtimeStatus(connected ? "CONNECTED" : "DISCONNECTED");
  }, []);

  useEffect(() => {
    if (iotConnectionStatus === "connected") {
      setOnlineSinceMs((prev) => prev ?? Date.now());
      return;
    }
    setOnlineSinceMs(null);
  }, [iotConnectionStatus]);

  async function refreshMonitoringStatus() {
    try {
      setRefreshingStatus(true);
      setError(null);
      await refreshAll();
      setClockTick(Date.now());
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
      setScannerLinkCopied(true);
      if (copyFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(copyFeedbackTimeoutRef.current);
      }
      copyFeedbackTimeoutRef.current = window.setTimeout(() => {
        setScannerLinkCopied(false);
      }, 1500);
    } catch {
      setScannerLinkCopied(false);
    }
  }

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchInventory(), fetchAlerts(), fetchMonitoring()]);
  }, [fetchAlerts, fetchInventory, fetchMonitoring]);

  async function refreshInventoryData() {
    try {
      setRefreshingInventory(true);
      setError(null);
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to refresh inventory data.");
    } finally {
      setRefreshingInventory(false);
    }
  }

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
    if (!scannerUrl || scannerActivated) return;
    let active = true;
    const parsed = (() => {
      try {
        return new URL(scannerUrl);
      } catch {
        return null;
      }
    })();
    const token = parsed?.pathname.split("/").filter(Boolean).pop() ?? "";
    if (!token) return;

    async function checkStatus() {
      const response = await fetch(`/api/inventory/scanner-link/status?token=${encodeURIComponent(token)}`);
      const payload = (await response.json()) as { used?: boolean };
      if (!active || !response.ok) return;
      if (payload.used) {
        setScannerActivated(true);
        toast.success("Phone scanner connected", {
          description: "Opening manifest scanning view..."
        });
        window.location.href = "/inventory/scanning";
      }
    }

    void checkStatus();
    const intervalId = window.setInterval(() => {
      void checkStatus();
    }, 2000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [scannerActivated, scannerUrl]);

  useEffect(() => {
    return () => {
      if (copyFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(copyFeedbackTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void fetchMonitoring().catch(() => {
        setRealtimeStatus("DISCONNECTED");
      });
    }, 5000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchMonitoring]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setClockTick(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        void fetchMonitoring();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchMonitoring]);

  function startOverride(item: InventoryItem) {
    if (!canOverrideInventory) return;
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

  async function deleteItem(item: InventoryItem) {
    if (!canDeleteInventory) return;
    if (
      !window.confirm(
        `Remove "${item.name}" from inventory? This cannot be undone. Related replenishment alert rows may be removed automatically.`
      )
    ) {
      return;
    }

    try {
      setError(null);
      setMessage(null);
      setRowDeletingId(item.id);
      if (!window.navigator.onLine) {
        queueOfflineTransaction({
          path: `/api/inventory?id=${encodeURIComponent(item.id)}`,
          method: "DELETE",
          body: {}
        });
        setMessage(`Offline: delete for ${item.name} queued. Sync when online.`);
        return;
      }
      const response = await fetch(`/api/inventory?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to delete item.");
      }
      setMessage(`Removed ${item.name} from inventory.`);
      if (editingId === item.id) cancelOverride();
      await fetchInventory();
    } catch (err) {
      if (err instanceof TypeError || !window.navigator.onLine) {
        queueOfflineTransaction({
          path: `/api/inventory?id=${encodeURIComponent(item.id)}`,
          method: "DELETE",
          body: {}
        });
        setMessage(`Network issue: delete for ${item.name} queued.`);
        setError(null);
        return;
      }
      setError(err instanceof Error ? err.message : "Unable to delete item.");
    } finally {
      setRowDeletingId(null);
    }
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
      if (!window.navigator.onLine) {
        queueOfflineTransaction({
          path: "/api/inventory",
          method: "PATCH",
          body: {
            id: itemId,
            quantity: qty,
            threshold_limit: thresh
          }
        });
        cancelOverride();
        setMessage("Offline: inventory override queued. Sync when online.");
        return;
      }
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
      if (err instanceof TypeError || !window.navigator.onLine) {
        queueOfflineTransaction({
          path: "/api/inventory",
          method: "PATCH",
          body: {
            id: itemId,
            quantity: qty,
            threshold_limit: thresh
          }
        });
        cancelOverride();
        setError(null);
        setMessage("Network issue: inventory override queued.");
        return;
      }
      setError(err instanceof Error ? err.message : "Unable to save manual override.");
    } finally {
      setRowSavingId(null);
    }
  }

  async function addProduct() {
    const qty = Number.parseInt(newQuantity, 10);
    if (!newName.trim()) {
      setError("Product name is required.");
      return;
    }
    if (!Number.isFinite(qty) || qty < 0) {
      setError("Enter a non-negative whole number for quantity.");
      return;
    }

    try {
      setAddingProduct(true);
      setError(null);
      setMessage(null);
      const payload = {
        name: newName.trim(),
        category: newCategory,
        quantity: qty,
        threshold_limit: MANUAL_ADD_DEFAULT_THRESHOLD
      };
      if (!window.navigator.onLine) {
        queueOfflineTransaction({
          path: "/api/inventory",
          method: "POST",
          body: payload
        });
        setMessage(`Offline: add product "${payload.name}" queued. Sync when online.`);
        setNewName("");
        setNewCategory("Maintenance Free");
        setNewQuantity("0");
        return;
      }
      const response = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = (await response.json()) as { error?: string; item?: InventoryItem };
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to add product.");
      }

      setMessage(`Added ${data.item?.name ?? "new product"} to inventory.`);
      setNewName("");
      setNewCategory("Maintenance Free");
      setNewQuantity("0");
      await fetchInventory();
    } catch (err) {
      if (err instanceof TypeError || !window.navigator.onLine) {
        queueOfflineTransaction({
          path: "/api/inventory",
          method: "POST",
          body: {
            name: newName.trim(),
            category: newCategory,
            quantity: qty,
            threshold_limit: MANUAL_ADD_DEFAULT_THRESHOLD
          }
        });
        setError(null);
        setMessage(`Network issue: add product "${newName.trim()}" queued.`);
        setNewName("");
        setNewCategory("Maintenance Free");
        setNewQuantity("0");
        return;
      }
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
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Live Sensor Status</p>
            <p
              className={`mt-1 text-xs font-semibold leading-tight ${
                iotConnectionStatus === "connected"
                  ? "text-green-700"
                  : realtimeStatus === "CONNECTING"
                    ? "text-amber-700"
                    : "text-red-700"
              }`}
            >
              {iotConnectionStatus === "connected"
                ? iotRunning
                  ? "Connected (Live Readings)"
                  : "Connected (Standby)"
                : realtimeStatus === "CONNECTING"
                  ? "Connecting..."
                  : "Disconnected (Sensor Device Offline)"}
            </p>
            {localIotReachable && localIotEndpoint ? (
              <p className="mt-1 text-[10px] leading-tight text-green-700">LAN link active: {localIotEndpoint}</p>
            ) : null}
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
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Sensor Uptime</p>
            <p className={`mt-1 text-xs font-semibold ${iotRunning ? "text-green-700" : "text-slate-700"}`}>
              {formatUptime(
                iotConnectionStatus === "connected" ? displayIotUptimeSeconds : iotUptimeSeconds,
                iotConnectionStatus !== "connected"
              )}
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

      {latestSensorAlert ? (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            latestSensorAlert.severity === "critical"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          <p className="font-semibold">
            {latestSensorAlert.severity === "critical" ? "Critical sensor alert" : "Sensor warning alert"}
          </p>
          <p className="mt-1">
            {latestSensorAlert.message} • {new Date(latestSensorAlert.created_at).toLocaleString()}
          </p>
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
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Inventory Table</h2>
              <button
                type="button"
                onClick={() => void refreshInventoryData()}
                disabled={refreshingInventory}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {refreshingInventory ? "Refreshing..." : "Refresh Inventory"}
              </button>
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
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map((item) => {
                    const outOfStock = item.quantity <= 0;
                    const belowThreshold = !outOfStock && item.quantity < item.threshold_limit;
                    const isEditing = editingId === item.id;
                    const rowBusy = rowSavingId === item.id;
                    const rowDeleting = rowDeletingId === item.id;
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
                          {!canOverrideInventory ? (
                            <span className="text-xs text-slate-400">—</span>
                          ) : isEditing ? (
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
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                disabled={(editingId !== null && editingId !== item.id) || rowDeleting}
                                onClick={() => startOverride(item)}
                                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Override
                              </button>
                              {canDeleteInventory ? (
                                <button
                                  type="button"
                                  disabled={(editingId !== null && editingId !== item.id) || rowDeleting}
                                  onClick={() => void deleteItem(item)}
                                  className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {rowDeleting ? "Removing..." : "Delete"}
                                </button>
                              ) : null}
                            </div>
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
            <div className="mt-2 flex min-h-[9.5rem] flex-wrap items-center gap-3 sm:flex-nowrap">
              <div className="shrink-0 rounded-md border border-slate-200 bg-slate-50 p-1.5">
                {scannerQrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={scannerQrDataUrl} alt="Scanner link QR" className="h-36 w-36 rounded" />
                ) : (
                  <div className="flex h-36 w-36 items-center justify-center text-[11px] text-slate-500">
                    Generating QR...
                  </div>
                )}
              </div>
              <div className="flex min-w-[10rem] flex-1 items-center justify-center sm:min-w-0 sm:pl-1">
                <div className="flex flex-col items-center gap-1.5 text-center">
                  <button
                    type="button"
                    onClick={() => void copyScannerLink()}
                    disabled={!scannerUrl}
                    className="min-w-[7.5rem] rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Copy Link
                  </button>
                  {scannerLinkCopied ? <p className="text-[11px] font-semibold text-green-600">Link copied</p> : null}
                  <Link
                    href="/inventory/scanning"
                    className="min-w-[7.5rem] rounded-md border border-red-300 bg-red-50 px-2.5 py-1.5 text-center text-[11px] font-semibold text-red-700 hover:bg-red-100"
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

          {canManageProducts ? (
            <ManifestUploadPanel
              compact
              onUploadSuccess={() => {
                void fetchInventory();
              }}
            />
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


