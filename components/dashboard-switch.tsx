"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  Activity,
  AlertTriangle,
  Boxes,
  DollarSign,
  Droplets,
  Loader2,
  PackageSearch,
  Thermometer,
  Truck,
  Users,
  Wifi
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import AuditActionBadge from "@/components/audit-action-badge";
import { buildPreviewEnvironmentSeries } from "@/lib/iot/environment-series";
import type { UserRole } from "@/lib/auth/roles";

type IotEnvironmentPayload = {
  series: { label: string; temperature: number; humidity: number }[];
  seriesSource: "live" | "preview";
  readingCount: number;
  latestReadingAt: string | null;
  databaseReachable: boolean;
  databaseError?: string | null;
  windowHours: number;
};

type DashboardData = {
  role: UserRole;
  session: { email: string; role: UserRole };
  inventory: InventoryRow[];
  shipments: ShipmentRow[];
  alerts: AlertRow[];
  sensorLogs: SensorLogRow[];
  totals: { users: number };
};

type InventoryRow = {
  id: string;
  name: string;
  quantity: number;
  threshold_limit: number;
};

type ShipmentRow = {
  id: string;
  tracking_number: string;
  origin: string;
  destination: string;
  status: "Pending" | "In Transit" | "Delivered";
  item_name?: string;
  quantity?: number;
  estimated_arrival?: string;
  updated_at: string;
};

type AlertRow = {
  id: string;
  created_at: string;
  status?: string;
  message?: string;
  item_name?: string;
};

type SensorLogRow = {
  sensor_status?: string;
  temperature?: number;
  humidity?: number;
};

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200 ${className}`} />;
}

function StatCard({
  title,
  value,
  icon: Icon,
  danger,
  metricCard,
  valueClassName,
  iconClassName
}: {
  title: string;
  value: string | number;
  icon: ComponentType<{ className?: string }>;
  danger?: boolean;
  metricCard?: boolean;
  valueClassName?: string;
  iconClassName?: string;
}) {
  return (
    <div
      className={`rounded-xl border bg-white p-4 shadow-sm transition-shadow ${
        danger ? "border-red-300" : "border-slate-100"
      } ${metricCard ? "hover:shadow-md" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-slate-500">{title}</p>
          <p
            className={`mt-2 truncate text-2xl font-bold tabular-nums ${
              valueClassName ?? (danger ? "text-red-600" : "text-slate-900")
            }`}
          >
            {value}
          </p>
        </div>
        <Icon
          className={`h-5 w-5 shrink-0 ${iconClassName ?? (danger ? "text-red-500" : "text-slate-500")}`}
        />
      </div>
    </div>
  );
}

export default function DashboardSwitch() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regionFilter, setRegionFilter] = useState<"All" | "Visayas" | "Mindanao">("All");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [iotEnv, setIotEnv] = useState<IotEnvironmentPayload | null>(null);
  const [iotEnvLoading, setIotEnvLoading] = useState(false);
  const [iotCheckLoading, setIotCheckLoading] = useState(false);

  async function loadDashboardData() {
    const response = await fetch("/api/dashboard/data");
    const payload = (await response.json()) as DashboardData & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Unable to load dashboard.");
    setData(payload);
  }

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        await loadDashboardData();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load dashboard.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  useEffect(() => {
    if (data?.role !== "Admin") {
      setIotEnv(null);
      return;
    }
    let cancelled = false;
    async function loadIot() {
      setIotEnvLoading(true);
      try {
        const response = await fetch("/api/iot/environment");
        const payload = (await response.json()) as IotEnvironmentPayload & { error?: string };
        if (!cancelled && response.ok && !payload.error) {
          setIotEnv(payload);
        }
      } finally {
        if (!cancelled) setIotEnvLoading(false);
      }
    }
    void loadIot();
    return () => {
      cancelled = true;
    };
  }, [data?.role, data?.session?.email]);

  const inventoryStats = useMemo(() => {
    if (!data) return { total: 0, low: 0, online: 0, restocks: 0 };
    const low = data.inventory.filter((item) => Number(item.quantity) < Number(item.threshold_limit)).length;
    const online = Math.max(0, data.sensorLogs.filter((log) => log.sensor_status !== "offline").length);
    return {
      total: data.inventory.length,
      low,
      online,
      restocks: data.alerts.length
    };
  }, [data]);

  const salesStats = useMemo(() => {
    if (!data) return { pending: 0, transit: 0, completedToday: 0, delays: 0 };
    const today = new Date().toDateString();
    const completedToday = data.shipments.filter(
      (shipment) => shipment.status === "Delivered" && new Date(shipment.updated_at).toDateString() === today
    ).length;
    const delays = data.shipments.filter(
      (shipment) => shipment.status === "In Transit" && Date.now() - new Date(shipment.updated_at).getTime() > 1000 * 60 * 60 * 48
    ).length;
    return {
      pending: data.shipments.filter((shipment) => shipment.status === "Pending").length,
      transit: data.shipments.filter((shipment) => shipment.status === "In Transit").length,
      completedToday,
      delays
    };
  }, [data]);

  const turnoverData = useMemo(
    () =>
      Array.from({ length: 6 }).map((_, idx) => ({
        month: `M${idx + 1}`,
        turnover: Math.round((data?.inventory.length ?? 0) * (0.8 + Math.random() * 1.4))
      })),
    [data]
  );

  const sensorLineData = useMemo(
    () =>
      (data?.sensorLogs ?? []).slice(0, 12).reverse().map((entry, idx) => ({
        t: idx + 1,
        temperature: Number(entry.temperature ?? 24),
        humidity: Number(entry.humidity ?? 60)
      })),
    [data]
  );

  const topSellingItem = useMemo(() => {
    if (!data?.inventory?.length) return null;
    return [...data.inventory].sort((a, b) => Number(a.quantity) - Number(b.quantity))[0];
  }, [data]);

  async function runSensorSimulation() {
    const response = await fetch("/api/inventory/simulate-sensor", { method: "POST" });
    const payload = (await response.json()) as {
      error?: string;
      alertTriggered?: boolean;
      item?: { name?: string };
    };
    if (!response.ok) {
      toast.error(payload.error ?? "Simulation failed");
      return;
    }
    if (payload.alertTriggered) {
      toast.warning(`Auto-replenishment triggered for ${payload.item?.name}`);
    } else {
      toast.success(`Sensor reading saved for ${payload.item?.name}`);
    }
    await loadDashboardData();
  }

  async function updateShipmentStatus(id: string, status: string) {
    const response = await fetch("/api/logistics/update-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shipmentId: id, status })
    });
    const payload = (await response.json()) as { error?: string; communication?: { sent: boolean; message: string } };
    if (!response.ok) {
      toast.error(payload.error ?? "Failed to update status.");
      return;
    }
    if (status === "In Transit") {
      if (payload.communication?.sent) toast.success("Status updated + SMTP notification sent.");
      else toast.warning(`Status updated, email issue: ${payload.communication?.message ?? "Unknown issue"}`);
    }
    await loadDashboardData();
  }

  async function refreshIotEnvironment() {
    setIotEnvLoading(true);
    try {
      const response = await fetch("/api/iot/environment");
      const payload = (await response.json()) as IotEnvironmentPayload & { error?: string };
      if (response.ok && !payload.error) setIotEnv(payload);
    } finally {
      setIotEnvLoading(false);
    }
  }

  async function handleIotCheck() {
    setIotCheckLoading(true);
    try {
      const response = await fetch("/api/iot/check-connection", { method: "POST" });
      const payload = (await response.json()) as {
        ok?: boolean;
        summary?: string;
        error?: string;
      };
      if (!response.ok) {
        toast.error(payload.error ?? "Connection check failed.");
        return;
      }
      if (payload.ok) toast.success(payload.summary ?? "Connection OK.");
      else toast.warning(payload.summary ?? "Connection issues detected.");
      await refreshIotEnvironment();
    } finally {
      setIotCheckLoading(false);
    }
  }

  if (loading) {
    return (
      <section className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SkeletonBlock className="h-28" />
          <SkeletonBlock className="h-28" />
          <SkeletonBlock className="h-28" />
          <SkeletonBlock className="h-28" />
        </div>
        <SkeletonBlock className="h-64" />
      </section>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error ?? "Dashboard error."}
      </div>
    );
  }

  const filteredShipments =
    regionFilter === "All"
      ? data.shipments
      : data.shipments.filter((shipment) =>
          String(shipment.destination ?? "").toLowerCase().includes(regionFilter.toLowerCase())
        );

  const trackedShipment = data.shipments.find(
    (shipment) => shipment.tracking_number?.toLowerCase() === trackingNumber.trim().toLowerCase()
  );

  const role = data.role;

  if (role === "Admin") {
    const alertCount = data.alerts.length;
    const adminChartData = iotEnv?.series ?? buildPreviewEnvironmentSeries();
    const iotLive = iotEnv?.seriesSource === "live";
    const iotSubtitle =
      iotEnvLoading && !iotEnv
        ? "Loading last 24 hours from sensor_logs…"
        : iotEnv?.seriesSource === "live"
          ? `Last ${iotEnv.windowHours}h from Supabase sensor_logs · ${iotEnv.readingCount} reading(s)${
              iotEnv.latestReadingAt
                ? ` · latest ${new Date(iotEnv.latestReadingAt).toLocaleString()}`
                : ""
            }.`
          : "No readings in the last 24h — showing preview only. Point your IoT pipeline at Supabase table sensor_logs (columns: temperature, humidity, created_at).";

    return (
      <section className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Total Revenue"
            value={`₱${(data.shipments.length * 1650).toLocaleString()}`}
            icon={DollarSign}
            metricCard
          />
          <StatCard title="Total Users" value={data.totals.users} icon={Users} metricCard />
          <StatCard
            title="Active Alerts"
            value={alertCount}
            icon={AlertTriangle}
            metricCard
            valueClassName={alertCount > 0 ? "text-red-600" : "text-slate-900"}
            iconClassName={alertCount > 0 ? "animate-pulse text-red-500" : undefined}
          />
          <StatCard
            title="System Uptime %"
            value="99.7%"
            icon={Activity}
            metricCard
            valueClassName="text-yellow-600"
            iconClassName="text-yellow-500"
          />
        </div>

        <div
          className={`relative rounded-xl border border-slate-100 bg-gradient-to-br from-slate-50 to-red-50/40 p-5 shadow-sm ${iotEnvLoading ? "opacity-95" : ""}`}
        >
          {iotEnvLoading ? (
            <div className="absolute right-4 top-4 flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Updating…
            </div>
          ) : null}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 max-w-2xl">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                Warehouse environment (IoT)
              </h3>
              <p className="mt-1 text-sm text-slate-500">{iotSubtitle}</p>
              {iotEnv?.databaseError ? (
                <p className="mt-2 text-xs text-red-600">{iotEnv.databaseError}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                disabled={iotCheckLoading}
                onClick={() => void handleIotCheck()}
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {iotCheckLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Wifi className="h-3.5 w-3.5 text-slate-600" aria-hidden />
                )}
                Check connection
              </button>
              {iotEnvLoading && !iotEnv ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  Loading
                </span>
              ) : iotLive ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-yellow-200 bg-white/90 px-2.5 py-1 text-xs font-medium text-yellow-800 shadow-sm">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-yellow-500" />
                  </span>
                  Live
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50/90 px-2.5 py-1 text-xs font-medium text-red-900 shadow-sm">
                  <span className="relative h-2 w-2 rounded-full bg-red-500" />
                  Preview
                </span>
              )}
            </div>
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-100 bg-white/95 p-3 shadow-sm">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <Thermometer className="h-4 w-4 text-red-500" aria-hidden />
                Temperature (°C)
              </div>
              <p className="mb-1 text-[11px] text-slate-500">Warehouse — last 24 hours</p>
              <div className="h-52 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={adminChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={3} stroke="#94a3b8" />
                    <YAxis
                      domain={["dataMin - 0.5", "dataMax + 0.5"]}
                      tick={{ fontSize: 10 }}
                      stroke="#94a3b8"
                      width={36}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid #e2e8f0",
                        fontSize: 12
                      }}
                      formatter={(value) => [`${Number(value ?? 0)} °C`, "Temperature"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="temperature"
                      stroke="#ef4444"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-lg border border-slate-100 bg-white/95 p-3 shadow-sm">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <Droplets className="h-4 w-4 text-red-500" aria-hidden />
                Humidity (% RH)
              </div>
              <p className="mb-1 text-[11px] text-slate-500">Warehouse — last 24 hours</p>
              <div className="h-52 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={adminChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={3} stroke="#94a3b8" />
                    <YAxis
                      domain={["dataMin - 2", "dataMax + 2"]}
                      tick={{ fontSize: 10 }}
                      stroke="#94a3b8"
                      width={36}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid #e2e8f0",
                        fontSize: 12
                      }}
                      formatter={(value) => [`${Number(value ?? 0)}%`, "Humidity"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="humidity"
                      stroke="#2563eb"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm lg:col-span-2">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">
              System-Wide Audit Log
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-3 py-2">Timestamp</th>
                    <th className="px-3 py-2">Action</th>
                    <th className="px-3 py-2">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {data.alerts.slice(0, 10).map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                        {new Date(row.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <AuditActionBadge status={row.status} message={row.message} />
                      </td>
                      <td className="max-w-md break-words px-3 py-2 text-slate-700 whitespace-normal">
                        {row.message ?? row.item_name}
                      </td>
                    </tr>
                  ))}
                  {data.alerts.length === 0 ? (
                    <tr>
                      <td className="px-3 py-8 text-center text-slate-500" colSpan={3}>
                        No audit entries yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
              <Link
                href="/logs"
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
              >
                View all
              </Link>
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">
              Monthly Inventory Turnover
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={turnoverData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="turnover" fill="#dc2626" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (role === "Inventory") {
    return (
      <section className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Total Items" value={inventoryStats.total} icon={Boxes} metricCard />
          <StatCard
            title="Low Stock Items"
            value={inventoryStats.low}
            icon={AlertTriangle}
            danger={inventoryStats.low > 0}
            metricCard
          />
          <StatCard title="Sensors Online" value={inventoryStats.online} icon={Thermometer} metricCard />
          <StatCard title="Recent Restocks" value={inventoryStats.restocks} icon={PackageSearch} metricCard />
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm xl:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Inventory Table</h3>
              <button
                onClick={() => void runSensorSimulation()}
                type="button"
                className="rounded-md bg-gradient-to-r from-yellow-500 to-amber-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:from-yellow-400 hover:to-amber-400"
              >
                Simulate IoT Trigger
              </button>
            </div>
            <input
              placeholder="Search inventory..."
              className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              onChange={(e) => {
                const q = e.target.value.toLowerCase();
                if (!q) return void loadDashboardData();
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        inventory: prev.inventory.filter((item) =>
                          String(item.name).toLowerCase().includes(q)
                        )
                      }
                    : prev
                );
              }}
            />
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2">Stock</th>
                    <th className="px-3 py-2">Threshold</th>
                  </tr>
                </thead>
                <tbody>
                  {data.inventory.map((item) => {
                    const low = Number(item.quantity) < Number(item.threshold_limit);
                    return (
                      <tr key={item.id} className={`border-t ${low ? "bg-red-50" : "border-slate-100"}`}>
                        <td className="px-3 py-2">{item.name}</td>
                        <td className="px-3 py-2">{item.quantity}</td>
                        <td className="px-3 py-2">{item.threshold_limit}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
                Temperature / Humidity (Realtime)
              </h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sensorLineData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="t" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="temperature" stroke="#ef4444" dot={false} />
                    <Line type="monotone" dataKey="humidity" stroke="#2563eb" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Live Stock Gauge</h3>
              <p className="mt-2 text-sm text-slate-600">{topSellingItem?.name ?? "No data"}</p>
              <div className="mt-3 h-3 w-full rounded-full bg-slate-200">
                <div
                  className="h-3 rounded-full bg-yellow-500"
                  style={{
                    width: `${Math.min(100, Math.max(5, Number(topSellingItem?.quantity ?? 0) * 5))}%`
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (role === "Sales") {
    return (
      <section className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Pending Orders" value={salesStats.pending} icon={Truck} metricCard />
          <StatCard title="Orders In Transit" value={salesStats.transit} icon={Truck} metricCard />
          <StatCard title="Completed Today" value={salesStats.completedToday} icon={Activity} metricCard />
          <StatCard
            title="Shipping Delays"
            value={salesStats.delays}
            icon={AlertTriangle}
            danger={salesStats.delays > 0}
            metricCard
          />
        </div>

        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              Logistics Tracking Table
            </h3>
            <select
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value as "All" | "Visayas" | "Mindanao")}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            >
              <option value="All">All Regions</option>
              <option value="Visayas">Visayas</option>
              <option value="Mindanao">Mindanao</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-3 py-2">Tracking</th>
                  <th className="px-3 py-2">Destination</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Update Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredShipments.slice(0, 5).map((shipment) => (
                  <tr key={shipment.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{shipment.tracking_number}</td>
                    <td className="px-3 py-2">{shipment.destination}</td>
                    <td className="px-3 py-2">{shipment.status}</td>
                    <td className="px-3 py-2">
                      <select
                        value={shipment.status}
                        onChange={(e) => void updateShipmentStatus(shipment.id, e.target.value)}
                        className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                      >
                        <option value="Pending">Pending</option>
                        <option value="In Transit">In Transit</option>
                        <option value="Delivered">Delivered</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6 rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-bold">Track Shipment</h2>
      <div className="space-y-3">
        <label className="text-sm text-slate-600">Enter Tracking Number to Track Shipment</label>
        <input
          value={trackingNumber}
          onChange={(e) => setTrackingNumber(e.target.value)}
          placeholder="e.g. WIS-1001"
          className="w-full rounded-md border border-slate-300 px-4 py-3 text-lg"
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
                  className={`rounded-md border px-2 py-2 ${active ? "border-yellow-300 bg-yellow-50 text-yellow-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}
                >
                  {step}
                </div>
              );
            })}
          </div>
          <div className="rounded-lg bg-slate-50 p-4 text-sm">
            <p>
              <span className="font-medium">Item:</span> {trackedShipment.item_name ?? "General Package"}
            </p>
            <p>
              <span className="font-medium">Quantity:</span> {trackedShipment.quantity ?? 1}
            </p>
            <p>
              <span className="font-medium">Estimated Arrival:</span>{" "}
              {trackedShipment.estimated_arrival
                ? new Date(trackedShipment.estimated_arrival).toLocaleDateString()
                : "Within 2-4 days"}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500">No shipment found yet. Enter tracking number.</p>
      )}
    </section>
  );
}

