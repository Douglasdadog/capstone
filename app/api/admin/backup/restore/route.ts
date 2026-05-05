import { NextRequest, NextResponse } from "next/server";
import { requireDemoSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeActivityLog } from "@/lib/audit/activity-log";

type RestorePayload = {
  modules?: {
    inventory?: { inventory?: Array<Record<string, unknown>> };
    iot?: { sensorAlertConfig?: Array<Record<string, unknown>> };
  };
};

export async function POST(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.session.role !== "SuperAdmin") {
    return NextResponse.json({ error: "Super Admin access required." }, { status: 403 });
  }

  const body = (await request.json()) as {
    payload?: RestorePayload;
    dryRun?: boolean;
    apply?: boolean;
    confirmationText?: string;
  };

  const payload = body.payload;
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "payload is required." }, { status: 400 });
  }

  const inventoryRows = payload.modules?.inventory?.inventory ?? [];
  const sensorConfigRows = payload.modules?.iot?.sensorAlertConfig ?? [];
  const validation = {
    inventoryRows: inventoryRows.length,
    sensorConfigRows: sensorConfigRows.length,
    restorableModules: ["inventory", "iot.sensorAlertConfig"]
  };

  const shouldApply = Boolean(body.apply) && body.dryRun !== true;
  if (!shouldApply) {
    await writeActivityLog(request, {
      actorEmail: auth.session.email,
      actorRole: auth.session.role,
      action: "backup.restore_dry_run",
      targetModule: "backup",
      details: validation
    });
    return NextResponse.json({ ok: true, dryRun: true, validation });
  }

  if ((body.confirmationText ?? "").trim() !== "RESTORE") {
    return NextResponse.json({ error: "Type RESTORE as confirmationText to apply restore." }, { status: 400 });
  }

  const supabase = createAdminClient();
  let restoredInventory = 0;
  for (const row of inventoryRows) {
    const id = String(row.id ?? "").trim();
    const name = String(row.name ?? "").trim();
    const quantity = Number(row.quantity ?? NaN);
    const threshold = Number(row.threshold_limit ?? NaN);
    if (!id || !name || !Number.isFinite(quantity) || !Number.isFinite(threshold)) continue;
    const { error } = await supabase
      .from("inventory")
      .upsert(
        {
          id,
          name,
          quantity: Math.max(0, Math.floor(quantity)),
          threshold_limit: Math.max(0, Math.floor(threshold)),
          updated_at: new Date().toISOString(),
          category: typeof row.category === "string" ? row.category : null,
          image_url: typeof row.image_url === "string" ? row.image_url : null
        },
        { onConflict: "id" }
      );
    if (!error) restoredInventory += 1;
  }

  let restoredConfig = 0;
  for (const row of sensorConfigRows) {
    if (row.id !== true) continue;
    const { error } = await supabase
      .from("sensor_alert_config")
      .upsert(
        {
          id: true,
          warning_threshold_c: Number(row.warning_threshold_c ?? 40),
          critical_threshold_c: Number(row.critical_threshold_c ?? 50),
          cooldown_minutes: Number(row.cooldown_minutes ?? 10),
          alert_email: typeof row.alert_email === "string" ? row.alert_email : null,
          iot_endpoint: typeof row.iot_endpoint === "string" ? row.iot_endpoint : null,
          updated_at: new Date().toISOString()
        },
        { onConflict: "id" }
      );
    if (!error) restoredConfig += 1;
  }

  const result = {
    restoredInventory,
    restoredSensorConfig: restoredConfig
  };
  await writeActivityLog(request, {
    actorEmail: auth.session.email,
    actorRole: auth.session.role,
    action: "backup.restore_apply",
    targetModule: "backup",
    details: result
  });
  return NextResponse.json({ ok: true, dryRun: false, result });
}
