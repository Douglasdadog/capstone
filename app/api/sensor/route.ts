import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type SensorPayload = {
  device_id?: string;
  temperature?: number | string;
  humidity?: number | string;
  status?: string;
  buzzer?: boolean;
  ip?: string;
  uptime?: number | string;
  unit?: string;
  ts?: number | string;
  created_at?: string;
};

const MIN_TEMP_C = -40;
const MAX_TEMP_C = 100;
const MIN_HUMIDITY_PCT = 0;
const MAX_HUMIDITY_PCT = 100;
const LOOKBACK_SECONDS = 60;

function toFiniteNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function parseCreatedAt(input?: string): string {
  if (!input) return new Date().toISOString();
  const ms = Date.parse(input);
  if (!Number.isFinite(ms)) return new Date().toISOString();
  return new Date(ms).toISOString();
}

function normalizeEpochMs(value: number): number {
  // Common embedded payloads send Unix seconds (10 digits); normalize to ms.
  return value < 1_000_000_000_000 ? value * 1000 : value;
}

function toCelsius(temperature: number, unit?: string): number {
  if (typeof unit === "string" && unit.trim().toUpperCase() === "F") {
    return (temperature - 32) * (5 / 9);
  }
  return temperature;
}

function parseCreatedAtFromPayload(body: SensorPayload): string {
  if (typeof body.created_at === "string" && body.created_at.trim()) {
    return parseCreatedAt(body.created_at.trim());
  }
  const ts = toFiniteNumber(body.ts);
  if (ts !== null) {
    const normalizedTs = normalizeEpochMs(ts);
    // Guard against bogus epoch values that would make readings look stale forever.
    if (normalizedTs >= Date.parse("2020-01-01T00:00:00Z")) {
      return new Date(normalizedTs).toISOString();
    }
  }
  return new Date().toISOString();
}

function providedSecrets(request: NextRequest): string[] {
  const values: string[] = [];
  const fromHeader = request.headers.get("x-device-secret")?.trim();
  if (fromHeader) values.push(fromHeader);
  const ingestKey = request.headers.get("x-iot-ingest-key")?.trim();
  if (ingestKey) values.push(ingestKey);
  const auth = request.headers.get("authorization")?.trim();
  if (auth?.toLowerCase().startsWith("bearer ")) {
    values.push(auth.slice(7).trim());
  }
  return values;
}

function authError(request: NextRequest): string | null {
  const expectedKeys = [process.env.DEVICE_SECRET?.trim(), process.env.WIS_IOT_INGEST_KEY?.trim()].filter(
    (value): value is string => Boolean(value)
  );
  if (expectedKeys.length === 0) return "DEVICE_SECRET (or WIS_IOT_INGEST_KEY) is not configured.";
  const incoming = providedSecrets(request);
  const ok = incoming.some((value) => expectedKeys.includes(value));
  if (!ok) return "Unauthorized";
  return null;
}

export async function POST(request: NextRequest) {
  const authErr = authError(request);
  if (authErr === "DEVICE_SECRET (or WIS_IOT_INGEST_KEY) is not configured.") {
    return NextResponse.json({ error: authErr }, { status: 503 });
  }
  if (authErr) {
    return NextResponse.json({ error: authErr }, { status: 401 });
  }

  let body: SensorPayload;
  try {
    body = (await request.json()) as SensorPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.device_id) {
    return NextResponse.json({ error: "device_id required" }, { status: 400 });
  }

  const rawTemp = toFiniteNumber(body.temperature);
  const humidity = toFiniteNumber(body.humidity);
  if (rawTemp === null || humidity === null) {
    return NextResponse.json({ error: "temperature and humidity are required numeric values." }, { status: 400 });
  }

  const temperatureC = toCelsius(rawTemp, body.unit);
  if (temperatureC < MIN_TEMP_C || temperatureC > MAX_TEMP_C) {
    return NextResponse.json({ error: `temperature must be between ${MIN_TEMP_C} and ${MAX_TEMP_C} C.` }, { status: 400 });
  }
  if (humidity < MIN_HUMIDITY_PCT || humidity > MAX_HUMIDITY_PCT) {
    return NextResponse.json({ error: `humidity must be between ${MIN_HUMIDITY_PCT} and ${MAX_HUMIDITY_PCT}%.` }, { status: 400 });
  }

  const createdAt = parseCreatedAtFromPayload(body);
  const ts = Date.parse(createdAt);

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("sensor_logs").insert({
      temperature: temperatureC,
      humidity,
      created_at: createdAt
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(
      {
        ok: true,
        received: {
          device_id: body.device_id,
          temperature: rawTemp,
          humidity,
          status: body.status ?? "UNKNOWN",
          buzzer: Boolean(body.buzzer),
          ip: body.ip ?? "",
          uptime: Number(body.uptime ?? 0),
          unit: body.unit ?? "C",
          ts
        }
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to ingest sensor reading." },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const supabase = createAdminClient();
    const since = new Date(Date.now() - LOOKBACK_SECONDS * 1000).toISOString();
    const { data, error } = await supabase
      .from("sensor_logs")
      .select("temperature, humidity, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const latest = data?.[0];
    if (!latest) return NextResponse.json({ devices: [], count: 0 });

    const ts = Date.parse(String(latest.created_at));
    return NextResponse.json({
      devices: [
        {
          device_id: "BAT-01",
          temperature: Number(latest.temperature ?? 0),
          humidity: Number(latest.humidity ?? 0),
          status: "NORMAL",
          buzzer: false,
          ip: "",
          uptime: 0,
          unit: "C",
          ts,
          online: Date.now() - ts < LOOKBACK_SECONDS * 1000,
          last_seen_seconds_ago: Math.max(0, Math.floor((Date.now() - ts) / 1000))
        }
      ],
      count: 1
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load sensor snapshot." },
      { status: 500 }
    );
  }
}
