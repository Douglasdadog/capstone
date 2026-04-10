import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";
import {
  buildPreviewEnvironmentSeries,
  downsampleEnvironmentPoints,
  padSingleReading,
  readingsToChartPoints
} from "@/lib/iot/environment-series";

const HOURS = 24;
const MAX_CHART_POINTS = 48;

export async function GET(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  if (auth.session.role !== "Admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const since = new Date(Date.now() - HOURS * 60 * 60 * 1000).toISOString();

  try {
    const supabase = createAdminClient();
    const { data: rows, error } = await supabase
      .from("sensor_logs")
      .select("temperature, humidity, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({
        series: buildPreviewEnvironmentSeries(),
        seriesSource: "preview" as const,
        readingCount: 0,
        latestReadingAt: null as string | null,
        databaseReachable: false,
        databaseError: error.message,
        windowHours: HOURS
      });
    }

    const raw = rows ?? [];
    let points = readingsToChartPoints(
      raw.map((r) => ({
        temperature: r.temperature as number | null,
        humidity: r.humidity as number | null,
        created_at: r.created_at as string
      }))
    );

    const readingCount = points.length;
    const latestReadingAt = raw.length > 0 ? (raw[raw.length - 1].created_at as string) : null;

    let seriesSource: "live" | "preview" = "preview";
    if (readingCount >= 2) {
      seriesSource = "live";
      points = downsampleEnvironmentPoints(points, MAX_CHART_POINTS);
    } else if (readingCount === 1) {
      seriesSource = "live";
      points = padSingleReading(points);
    } else {
      points = buildPreviewEnvironmentSeries();
    }

    return NextResponse.json({
      series: points,
      seriesSource,
      readingCount,
      latestReadingAt,
      databaseReachable: true,
      databaseError: null,
      windowHours: HOURS
    });
  } catch (e) {
    return NextResponse.json({
      series: buildPreviewEnvironmentSeries(),
      seriesSource: "preview" as const,
      readingCount: 0,
      latestReadingAt: null as string | null,
      databaseReachable: false,
      databaseError: e instanceof Error ? e.message : "Unknown error",
      windowHours: HOURS
    });
  }
}
