import { NextRequest, NextResponse } from "next/server";
import { requireDemoSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

const HISTORY_WINDOW_HOURS = 24;
const READING_GAP_TOLERANCE_MS = 15 * 60 * 1000;
const DEFAULT_EXPECTED_INTERVAL_SECONDS = 5;
const EXPECTED_READING_INTERVAL_SECONDS = (() => {
  const raw = Number(process.env.WIS_SENSOR_EXPECTED_INTERVAL_SECONDS ?? String(DEFAULT_EXPECTED_INTERVAL_SECONDS));
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_EXPECTED_INTERVAL_SECONDS;
  return Math.round(raw);
})();
const RUNNING_STALE_THRESHOLD_MS = (() => {
  const raw = Number(process.env.WIS_SENSOR_RUNNING_STALE_SECONDS ?? "");
  if (Number.isFinite(raw) && raw > 0) {
    return Math.round(raw) * 1000;
  }
  // Default grace: allow up to 3 missed intervals (min 10s) for transient jitter.
  return Math.max(10, EXPECTED_READING_INTERVAL_SECONDS * 3) * 1000;
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
  temperature_c?: number | null;
  humidity_pct?: number | null;
  observed_at?: string | null;
  created_at: string;
};

type SensorConfigRow = {
  iot_endpoint: string | null;
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
    const [{ data, error }, { data: latestAlerts }, { data: configData }] = await Promise.all([
      supabase
        .from("sensor_logs")
        .select("temperature, humidity, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: true }),
      supabase
        .from("sensor_alert_notifications")
        .select("id, severity, message, device_id, temperature_c, humidity_pct, observed_at, created_at")
        .order("created_at", { ascending: false })
        .limit(1)
      ,
      supabase
        .from("sensor_alert_config")
        .select("iot_endpoint")
        .eq("id", true)
        .maybeSingle()
    ]);

    const latestSensorAlert = (latestAlerts?.[0] ?? null) as SensorAlertRow | null;
    const latestAlertMs = latestSensorAlert
      ? toMillis(latestSensorAlert.observed_at ?? latestSensorAlert.created_at)
      : null;
    const configuredIotEndpoint =
      configData && typeof (configData as SensorConfigRow).iot_endpoint === "string"
        ? (configData as SensorConfigRow).iot_endpoint
        : null;

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
        localIotEndpoint: configuredIotEndpoint,
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
        localIotEndpoint: configuredIotEndpoint,
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
        localIotEndpoint: configuredIotEndpoint,
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

    const alertTelemetryMs = latestAlertMs;
    const alertTemperature =
      latestSensorAlert && Number.isFinite(Number(latestSensorAlert.temperature_c))
        ? Number(latestSensorAlert.temperature_c)
        : null;
    const alertHumidity =
      latestSensorAlert && Number.isFinite(Number(latestSensorAlert.humidity_pct))
        ? Number(latestSensorAlert.humidity_pct)
        : null;
    const useAlertTelemetry = Boolean(
      alertTelemetryMs !== null &&
        alertTelemetryMs >= latestMs &&
        alertTemperature !== null &&
        alertHumidity !== null
    );
    const displayLastReadingAt =
      useAlertTelemetry && latestSensorAlert
        ? latestSensorAlert.observed_at ?? latestSensorAlert.created_at
        : latest.created_at;
    const displayTemperature = useAlertTelemetry && alertTemperature !== null ? alertTemperature : Number(latest.temperature);
    const displayHumidity = useAlertTelemetry && alertHumidity !== null ? alertHumidity : Number(latest.humidity);
    const telemetryAgeMs = Date.now() - (useAlertTelemetry && alertTelemetryMs !== null ? alertTelemetryMs : latestMs);
    const uptimeSeconds = Math.max(0, Math.floor((latestMs - segmentStartMs) / 1000));
    const ageMs = Date.now() - latestMs;
    const hasFreshAlert = latestAlertMs !== null && Date.now() - latestAlertMs <= RUNNING_STALE_THRESHOLD_MS;
    const hasAnyTelemetry = Number.isFinite(displayTemperature) && Number.isFinite(displayHumidity);
    const isRunning = hasAnyTelemetry || ageMs <= RUNNING_STALE_THRESHOLD_MS || hasFreshAlert;
    const connectionStatus = isRunning ? ("connected" as const) : ("disconnected" as const);
    const staleSeconds = Math.max(0, Math.floor(telemetryAgeMs / 1000));
    const staleNote = isRunning
      ? staleSeconds > EXPECTED_READING_INTERVAL_SECONDS * 3
        ? `Sensor active. Last reading ${staleSeconds}s ago.`
        : hasFreshAlert && ageMs > RUNNING_STALE_THRESHOLD_MS
          ? "Sensor connected. Alert heartbeat is active; waiting for next sensor log upload."
          : "Sensor connected. Live readings are updating."
      : `Sensor disconnected. Last reading ${staleSeconds}s ago.`;

    return NextResponse.json({
      source: "live" as const,
      temperatureC: displayTemperature,
      humidityPct: displayHumidity,
      lastReadingAt: displayLastReadingAt,
      uptimeSeconds,
      isRunning,
      connectionStatus,
      latestSensorAlert,
      localIotEndpoint: configuredIotEndpoint,
      note: staleNote,
      staleSeconds,
      expectedIntervalSeconds: EXPECTED_READING_INTERVAL_SECONDS
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
