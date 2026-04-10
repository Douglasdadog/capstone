/**
 * Chart points for warehouse environment (temperature °C, humidity % RH).
 * IoT devices should insert rows into Supabase `sensor_logs` with
 * `temperature`, `humidity`, and `created_at` (ISO timestamp).
 */
export type EnvironmentPoint = {
  label: string;
  temperature: number;
  humidity: number;
};

/** Deterministic preview curve when no DB readings exist (demo / before deploy). */
export function buildPreviewEnvironmentSeries(pointCount = 24): EnvironmentPoint[] {
  return Array.from({ length: pointCount }, (_, i) => {
    const hoursAgo = pointCount - 1 - i;
    const t = i / Math.max(1, pointCount - 1);
    const baseTemp = 22.4 + Math.sin(t * Math.PI * 2) * 1.8;
    const wiggleT = Math.sin(i * 2.17) * 0.45 + Math.cos(i * 1.41) * 0.32;
    const temperature = Math.round((baseTemp + wiggleT) * 10) / 10;
    const baseH = 55 + Math.sin(t * Math.PI * 1.5) * 9;
    const wiggleH = Math.cos(i * 1.9) * 2.1 + Math.sin(i * 0.8) * 1.4;
    const humidity = Math.min(78, Math.max(42, baseH + wiggleH));
    return {
      label: hoursAgo === 0 ? "Now" : `-${hoursAgo}h`,
      temperature,
      humidity: Math.round(humidity * 10) / 10
    };
  });
}

export function downsampleEnvironmentPoints(points: EnvironmentPoint[], maxPoints: number): EnvironmentPoint[] {
  if (points.length <= maxPoints) return points;
  const step = (points.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, i) => {
    const idx = Math.round(i * step);
    return points[Math.min(idx, points.length - 1)];
  });
}

type DbReading = {
  temperature: number | null;
  humidity: number | null;
  created_at: string;
};

export function readingsToChartPoints(readings: DbReading[]): EnvironmentPoint[] {
  return readings
    .filter((r) => r.created_at)
    .map((r) => ({
      label: new Date(r.created_at).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit"
      }),
      temperature: Number(r.temperature ?? NaN),
      humidity: Number(r.humidity ?? NaN)
    }))
    .filter((p) => Number.isFinite(p.temperature) && Number.isFinite(p.humidity));
}

/** Ensure at least two points so Recharts can draw a line. */
export function padSingleReading(points: EnvironmentPoint[]): EnvironmentPoint[] {
  if (points.length !== 1) return points;
  const only = points[0];
  return [
    { ...only, label: `${only.label} · start` },
    { ...only, label: `${only.label} · now` }
  ];
}
