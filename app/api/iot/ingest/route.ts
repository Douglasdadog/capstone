import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { maybeTriggerSensorThresholdAlert } from "@/lib/iot/sensor-alerts";

type IngestPayload = {
  device_id?: string;
  device_secret?: string;
  secret?: string;
  temperature?: number | string;
  humidity?: number | string;
  unit?: string;
  status?: string;
  buzzer?: boolean;
  ip?: string;
  uptime?: number | string;
  ts?: number | string;
  created_at?: string;
};

const MIN_TEMP_C = -40;
const MAX_TEMP_C = 100;
const MIN_HUMIDITY_PCT = 0;
const MAX_HUMIDITY_PCT = 100;

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
  return value < 1_000_000_000_000 ? value * 1000 : value;
}

function parseCreatedAtFromPayload(body: IngestPayload): string {
  if (typeof body.created_at === "string" && body.created_at.trim()) {
    return parseCreatedAt(body.created_at.trim());
  }
  const ts = toFiniteNumber(body.ts);
  if (ts !== null) {
    const normalizedTs = normalizeEpochMs(ts);
    if (normalizedTs >= Date.parse("2020-01-01T00:00:00Z")) {
      return new Date(normalizedTs).toISOString();
    }
  }
  return new Date().toISOString();
}

function toCelsius(temperature: number, unit?: string): number {
  if (typeof unit === "string" && unit.trim().toUpperCase() === "F") {
    return (temperature - 32) * (5 / 9);
  }
  return temperature;
}

function expectedSecrets(): string[] {
  return [process.env.WIS_IOT_INGEST_KEY?.trim(), process.env.DEVICE_SECRET?.trim()].filter(
    (v): v is string => Boolean(v)
  );
}

function providedSecrets(request: NextRequest, body?: IngestPayload): string[] {
  const values: string[] = [];
  const ingestKey = request.headers.get("x-iot-ingest-key")?.trim();
  if (ingestKey) values.push(ingestKey);
  const legacyKey = request.headers.get("x-device-secret")?.trim();
  if (legacyKey) values.push(legacyKey);
  const querySecret = request.nextUrl.searchParams.get("secret")?.trim();
  if (querySecret) values.push(querySecret);
  const bodySecret = typeof body?.device_secret === "string" ? body.device_secret.trim() : "";
  if (bodySecret) values.push(bodySecret);
  const altBodySecret = typeof body?.secret === "string" ? body.secret.trim() : "";
  if (altBodySecret) values.push(altBodySecret);
  const auth = request.headers.get("authorization")?.trim();
  if (auth?.toLowerCase().startsWith("bearer ")) {
    values.push(auth.slice(7).trim());
  }
  return values;
}

function authErrorForIngest(request: NextRequest, body?: IngestPayload): string | null {
  const expectedKeys = expectedSecrets();
  if (expectedKeys.length === 0) {
    return "IoT ingest key is not configured on server.";
  }
  const incoming = providedSecrets(request, body);
  const ok = incoming.some((value) => expectedKeys.includes(value));
  if (!ok) return "Unauthorized IoT ingest request.";
  return null;
}

export async function POST(request: NextRequest) {
  let body: IngestPayload;
  try {
    body = (await request.json()) as IngestPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const authError = authErrorForIngest(request, body);
  if (authError === "IoT ingest key is not configured on server.") {
    return NextResponse.json({ error: authError }, { status: 503 });
  }
  if (authError) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  const rawTemperature = toFiniteNumber(body.temperature);
  const humidity = toFiniteNumber(body.humidity);
  if (rawTemperature === null || humidity === null) {
    return NextResponse.json(
      { error: "temperature and humidity are required numeric values." },
      { status: 400 }
    );
  }
  const temperature = toCelsius(rawTemperature, body.unit);

  if (temperature < MIN_TEMP_C || temperature > MAX_TEMP_C) {
    return NextResponse.json(
      { error: `temperature must be between ${MIN_TEMP_C} and ${MAX_TEMP_C} C.` },
      { status: 400 }
    );
  }
  if (humidity < MIN_HUMIDITY_PCT || humidity > MAX_HUMIDITY_PCT) {
    return NextResponse.json(
      { error: `humidity must be between ${MIN_HUMIDITY_PCT} and ${MAX_HUMIDITY_PCT}%.` },
      { status: 400 }
    );
  }

  const createdAt = parseCreatedAtFromPayload(body);

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("sensor_logs").insert({
      temperature,
      humidity,
      created_at: createdAt
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await maybeTriggerSensorThresholdAlert({
      deviceId: body.device_id ?? "BAT-01",
      temperatureC: temperature,
      humidityPct: humidity,
      observedAtIso: createdAt
    });

    return NextResponse.json({
      ok: true,
      received: {
        device_id: body.device_id ?? "BAT-01",
        temperature: rawTemperature,
        humidity,
        status: body.status ?? "UNKNOWN",
        buzzer: Boolean(body.buzzer),
        ip: body.ip ?? "",
        uptime: Number(body.uptime ?? 0),
        unit: body.unit ?? "C",
        ts: Date.parse(createdAt)
      },
      reading: {
        temperatureC: Math.round(temperature * 10) / 10,
        humidityPct: Math.round(humidity * 10) / 10,
        created_at: createdAt
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to ingest IoT reading."
      },
      { status: 500 }
    );
  }
}
