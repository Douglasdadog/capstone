import { NextRequest, NextResponse } from "next/server";
import { requireDemoSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

const HISTORY_WINDOW_HOURS = 24;
const READING_GAP_TOLERANCE_MS = 15 * 60 * 1000;
const MIN_STALE_SECONDS = 300;
const RUNNING_STALE_THRESHOLD_MS = (() => {
  const raw = Number(process.env.WIS_SENSOR_RUNNING_STALE_SECONDS ?? String(MIN_STALE_SECONDS));
  if (!Number.isFinite(raw) || raw <= 0) return MIN_STALE_SECONDS * 1000;
  return Math.max(MIN_STALE_SECONDS, Math.round(raw)) * 1000;
})();

type ReadingRow = {
  temperature: number | null;
  humidity: number | null;
  created_at: string;
};

type SensorAlertRow = {
  id: string;
  severity: "warning" | "critical";
  message: string;
  device_id: string;
  created_at: string;
};

function toMillis(value: string): number | null {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export async function GET(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const canView =
    auth.session.role === "SuperAdmin" || auth.session.role === "Admin" || auth.session.role === "Inventory";
  if (!canView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const since = new Date(Date.now() - HISTORY_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  try {
    const supabase = createAdminClient();
    const [{ data, error }, { data: latestAlerts }] = await Promise.all([
      supabase
        .from("sensor_logs")
        .select("temperature, humidity, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: true }),
      supabase
        .from("sensor_alert_notifications")
        .select("id, severity, message, device_id, created_at")
        .order("created_at", { ascending: false })
        .limit(1)
    ]);

    const latestSensorAlert = (latestAlerts?.[0] ?? null) as SensorAlertRow | null;

    if (error) {
      return NextResponse.json({
        source: "live" as const,
        temperatureC: null,
        humidityPct: null,
        lastReadingAt: null as string | null,
        uptimeSeconds: 0,
        isRunning: false,
        connectionStatus: "disconnected" as const,
        latestSensorAlert,
        note: `No device data: ${error.message}`
      });
    }

    const readings = ((data ?? []) as ReadingRow[]).filter((row) => {
      return (
        typeof row.created_at === "string" &&
        Number.isFinite(Number(row.temperature)) &&
        Number.isFinite(Number(row.humidity))
      );
    });

    if (readings.length === 0) {
      return NextResponse.json({
        source: "live" as const,
        temperatureC: null,
        humidityPct: null,
        lastReadingAt: null as string | null,
        uptimeSeconds: 0,
        isRunning: false,
        connectionStatus: "disconnected" as const,
        latestSensorAlert,
        note: "No IoT readings received yet. Device may be disconnected."
      });
    }

    const latest = readings[readings.length - 1];
    const latestMs = toMillis(latest.created_at);
    if (latestMs === null) {
      return NextResponse.json({
        source: "live" as const,
        temperatureC: Number(latest.temperature),
        humidityPct: Number(latest.humidity),
        lastReadingAt: null as string | null,
        uptimeSeconds: 0,
        isRunning: false,
        connectionStatus: "disconnected" as const,
        latestSensorAlert,
        note: "Latest reading has invalid timestamp. Sensor is treated as disconnected."
      });
    }

    let segmentStartMs = latestMs;
    for (let i = readings.length - 1; i > 0; i -= 1) {
      const currentMs = toMillis(readings[i].created_at);
      const previousMs = toMillis(readings[i - 1].created_at);
      if (currentMs === null || previousMs === null) break;
      if (currentMs - previousMs > READING_GAP_TOLERANCE_MS) break;
      segmentStartMs = previousMs;
    }

    const uptimeSeconds = Math.max(0, Math.floor((latestMs - segmentStartMs) / 1000));
    const ageMs = Date.now() - latestMs;
    const isRunning = ageMs <= RUNNING_STALE_THRESHOLD_MS;
    const connectionStatus = isRunning ? ("connected" as const) : ("disconnected" as const);
    const staleSeconds = Math.max(0, Math.floor((Date.now() - latestMs) / 1000));
    const staleNote = isRunning
      ? "Sensor connected. Live readings are updating."
      : `Sensor disconnected. Last reading ${staleSeconds}s ago.`;

    return NextResponse.json({
      source: "live" as const,
      temperatureC: Number(latest.temperature),
      humidityPct: Number(latest.humidity),
      lastReadingAt: latest.created_at,
      uptimeSeconds,
      isRunning,
      connectionStatus,
      latestSensorAlert,
      note: staleNote,
      staleSeconds
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load monitoring metrics."
      },
      { status: 500 }
    );
  }
}
