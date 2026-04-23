import { NextRequest, NextResponse } from "next/server";
import { requireDemoSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildPreviewEnvironmentSeries } from "@/lib/iot/environment-series";

const HISTORY_WINDOW_HOURS = 24;
const READING_GAP_TOLERANCE_MS = 15 * 60 * 1000;
const RUNNING_STALE_THRESHOLD_MS = 10 * 60 * 1000;

type ReadingRow = {
  temperature: number | null;
  humidity: number | null;
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
    const { data, error } = await supabase
      .from("sensor_logs")
      .select("temperature, humidity, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: true });

    if (error) {
      const preview = buildPreviewEnvironmentSeries();
      const latest = preview[preview.length - 1];
      return NextResponse.json({
        source: "preview" as const,
        temperatureC: latest?.temperature ?? null,
        humidityPct: latest?.humidity ?? null,
        lastReadingAt: null as string | null,
        uptimeSeconds: 0,
        isRunning: false,
        note: error.message
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
      const preview = buildPreviewEnvironmentSeries();
      const latest = preview[preview.length - 1];
      return NextResponse.json({
        source: "preview" as const,
        temperatureC: latest?.temperature ?? null,
        humidityPct: latest?.humidity ?? null,
        lastReadingAt: null as string | null,
        uptimeSeconds: 0,
        isRunning: false
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
        isRunning: false
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
    const isRunning = Date.now() - latestMs <= RUNNING_STALE_THRESHOLD_MS;

    return NextResponse.json({
      source: "live" as const,
      temperatureC: Number(latest.temperature),
      humidityPct: Number(latest.humidity),
      lastReadingAt: latest.created_at,
      uptimeSeconds,
      isRunning
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
