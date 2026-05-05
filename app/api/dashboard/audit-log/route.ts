import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  if (auth.session.role !== "Admin" && auth.session.role !== "SuperAdmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("system_activity_logs")
      .select("id, action, actor_email, actor_name, actor_ip, target_module, target_id, details, created_at")
      .order("created_at", { ascending: false })
      .limit(250);

    if (error) {
      const { data: legacy, error: legacyError } = await supabase
        .from("auto_replenishment_alerts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(250);
      if (legacyError) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ alerts: legacy ?? [] });
    }

    const activities = (data ?? []).map((row) => ({
      id: row.id,
      created_at: row.created_at,
      action: row.action,
      actor_email: row.actor_email ?? "unknown",
      actor_name: row.actor_name ?? "Unknown User",
      actor_ip: row.actor_ip ?? "unknown",
      target_module: row.target_module ?? "system",
      target_id: row.target_id ?? null,
      details: row.details ?? {}
    }));

    const alerts = activities.map((row) => ({
      id: row.id,
      created_at: row.created_at,
      status: "Logged",
      item_name: row.target_module,
      message: `${row.action} by ${row.actor_name} <${row.actor_email}> from ${row.actor_ip}`
    }));
    return NextResponse.json({ alerts, activities });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unable to load audit log." },
      { status: 500 }
    );
  }
}
