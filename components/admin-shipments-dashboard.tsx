"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type ShipmentStatus = "Pending" | "In Transit" | "Delivered";

type ShipmentRow = {
  id: string;
  tracking_number: string;
  client_name: string;
  client_email: string;
  status: ShipmentStatus;
  updated_at: string;
};

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function KpiCard({ label, value, tone }: { label: string; value: number; tone: "slate" | "amber" | "sky" | "green" }) {
  const border =
    tone === "amber"
      ? "border-amber-300 bg-amber-50/80"
      : tone === "sky"
        ? "border-sky-300 bg-sky-50/80"
        : tone === "green"
          ? "border-emerald-300 bg-emerald-50/80"
          : "border-slate-300 bg-white";
  return (
    <article className={`rounded-xl border-2 p-4 shadow-md shadow-slate-300/30 ring-1 ring-slate-200/70 ${border}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</p>
      <p className="mt-2 text-2xl font-black text-slate-900">{value}</p>
    </article>
  );
}

export default function AdminShipmentsDashboard() {
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortAsc, setSortAsc] = useState(false);

  const fetchShipments = useCallback(async () => {
    if (dateFrom.trim() && dateTo.trim() && dateFrom.trim() > dateTo.trim()) {
      setLoading(false);
      setShipments([]);
      return;
    }
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (dateFrom.trim()) params.set("dateFrom", dateFrom.trim());
    if (dateTo.trim()) params.set("dateTo", dateTo.trim());
    params.set("sort", sortAsc ? "asc" : "desc");
    const qs = params.toString();
    const response = await fetch(`/api/logistics/shipments${qs ? `?${qs}` : ""}`);
    const data = (await response.json()) as { shipments?: ShipmentRow[]; error?: string };
    if (!response.ok) {
      setError(data.error ?? "Unable to load shipments.");
      setShipments([]);
      setLoading(false);
      return;
    }
    setShipments((data.shipments ?? []) as ShipmentRow[]);
    setLoading(false);
  }, [dateFrom, dateTo, sortAsc]);

  useEffect(() => {
    void fetchShipments();
  }, [fetchShipments]);

  const stats = useMemo(() => {
    const total = shipments.length;
    const pending = shipments.filter((s) => s.status === "Pending").length;
    const transit = shipments.filter((s) => s.status === "In Transit").length;
    const delivered = shipments.filter((s) => s.status === "Delivered").length;
    return { total, pending, transit, delivered };
  }, [shipments]);

  function applyPreset(days: number) {
    const end = todayYmd();
    const start = addDaysYmd(end, -(days - 1));
    setDateFrom(start);
    setDateTo(end);
  }

  function clearRange() {
    setDateFrom("");
    setDateTo("");
  }

  const rangeInvalid =
    dateFrom && dateTo && dateFrom > dateTo ? "End date must be on or after start date." : null;

  return (
    <section className="space-y-4 rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-md shadow-slate-300/40 ring-1 ring-slate-200/80">
      <div>
        <h2 className="text-lg font-black text-slate-900">Shipment overview</h2>
        <p className="mt-1 text-sm text-slate-600">
          Totals for all customer accounts. Filter by last-update date and change sort order.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50/90 p-3">
        <label className="min-w-[140px] flex-1 space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full rounded-md border-2 border-slate-300 bg-white px-2 py-1.5 text-sm shadow-sm"
          />
        </label>
        <label className="min-w-[140px] flex-1 space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">To</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full rounded-md border-2 border-slate-300 bg-white px-2 py-1.5 text-sm shadow-sm"
          />
        </label>
        <label className="min-w-[160px] space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Sort by update</span>
          <select
            value={sortAsc ? "asc" : "desc"}
            onChange={(e) => setSortAsc(e.target.value === "asc")}
            className="w-full rounded-md border-2 border-slate-300 bg-white px-2 py-1.5 text-sm shadow-sm"
          >
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => void fetchShipments()}
          disabled={Boolean(rangeInvalid)}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => applyPreset(7)}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Last 7 days
        </button>
        <button
          type="button"
          onClick={() => applyPreset(30)}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Last 30 days
        </button>
        <button
          type="button"
          onClick={clearRange}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          All dates
        </button>
      </div>

      {rangeInvalid ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{rangeInvalid}</p>
      ) : null}
      {error ? (
        <p className="rounded-md border-2 border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total (in range)" value={stats.total} tone="slate" />
        <KpiCard label="Pending" value={stats.pending} tone="amber" />
        <KpiCard label="In transit" value={stats.transit} tone="sky" />
        <KpiCard label="Delivered" value={stats.delivered} tone="green" />
      </div>

      <div className="overflow-hidden rounded-xl border-2 border-slate-300 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Shipments in view</h3>
        </div>
        <div className="max-h-[320px] overflow-auto">
          {loading ? (
            <p className="p-4 text-sm text-slate-500">Loading…</p>
          ) : shipments.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No shipments match the current filters.</p>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-100 text-xs text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-semibold">Tracking</th>
                  <th className="px-3 py-2 font-semibold">Client</th>
                  <th className="px-3 py-2 font-semibold">Email</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Last updated</th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((row) => (
                  <tr key={row.id} className="border-t border-slate-200 hover:bg-slate-50/80">
                    <td className="px-3 py-2 font-medium text-slate-900">{row.tracking_number}</td>
                    <td className="px-3 py-2 text-slate-700">{row.client_name}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{row.client_email}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                          row.status === "Delivered"
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                            : row.status === "In Transit"
                              ? "border-sky-300 bg-sky-50 text-sky-800"
                              : "border-amber-300 bg-amber-50 text-amber-900"
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">{new Date(row.updated_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}
