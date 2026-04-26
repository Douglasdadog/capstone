import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";

type ConfigRow = {
  id: boolean;
  warning_threshold_c: number;
  critical_threshold_c: number;
  cooldown_minutes: number;
  alert_email: string | null;
  updated_at: string;
};

function parseNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function normalizeConfigRow(row: Partial<ConfigRow> | null): ConfigRow {
  return {
    id: true,
    warning_threshold_c: Number(row?.warning_threshold_c ?? 40),
    critical_threshold_c: Number(row?.critical_threshold_c ?? 50),
    cooldown_minutes: Number(row?.cooldown_minutes ?? 10),
    alert_email: typeof row?.alert_email === "string" ? row.alert_email : null,
    updated_at: typeof row?.updated_at === "string" ? row.updated_at : new Date().toISOString()
  };
}

function ensureSuperAdmin(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return { ok: false as const, response: NextResponse.json({ error: auth.error }, { status: 401 }) };
  if (auth.session.role !== "SuperAdmin") {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true as const };
}

export async function GET(request: NextRequest) {
  const guard = ensureSuperAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("sensor_alert_config")
      .select("id, warning_threshold_c, critical_threshold_c, cooldown_minutes, alert_email, updated_at")
      .eq("id", true)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ config: normalizeConfigRow(data as Partial<ConfigRow> | null) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load sensor alert settings." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const guard = ensureSuperAdmin(request);
  if (!guard.ok) return guard.response;

  let body: {
    warning_threshold_c?: number | string;
    critical_threshold_c?: number | string;
    cooldown_minutes?: number | string;
    alert_email?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const warning = parseNumber(body.warning_threshold_c);
  const critical = parseNumber(body.critical_threshold_c);
  const cooldown = parseNumber(body.cooldown_minutes);
  const email = typeof body.alert_email === "string" ? body.alert_email.trim() : "";

  if (warning === null || critical === null || cooldown === null) {
    return NextResponse.json({ error: "warning, critical, and cooldown must be numeric values." }, { status: 400 });
  }
  if (warning < -40 || warning > 120 || critical < -40 || critical > 120) {
    return NextResponse.json({ error: "Threshold values are out of range." }, { status: 400 });
  }
  if (critical < warning) {
    return NextResponse.json({ error: "Critical threshold must be greater than or equal to warning threshold." }, { status: 400 });
  }
  if (cooldown < 1 || cooldown > 180) {
    return NextResponse.json({ error: "Cooldown must be between 1 and 180 minutes." }, { status: 400 });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Alert email is invalid." }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("sensor_alert_config")
      .upsert(
        {
          id: true,
          warning_threshold_c: warning,
          critical_threshold_c: critical,
          cooldown_minutes: Math.round(cooldown),
          alert_email: email || null,
          updated_at: new Date().toISOString()
        },
        { onConflict: "id" }
      )
      .select("id, warning_threshold_c, critical_threshold_c, cooldown_minutes, alert_email, updated_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, config: normalizeConfigRow(data as ConfigRow) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update sensor alert settings." },
      { status: 500 }
    );
  }
}

