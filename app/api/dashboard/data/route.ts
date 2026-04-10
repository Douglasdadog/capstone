import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";
import { DEMO_USERS_COOKIE, getSampleUsers, readRegisteredUsers } from "@/lib/auth/demo-auth";

async function getSensorLogsSafe() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("sensor_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) {
    return [];
  }
  return data ?? [];
}

async function getInventorySafe() {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("inventory").select("*").order("updated_at", { ascending: false });
  if (error) return [];
  return data ?? [];
}

async function getShipmentsSafe() {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("shipments").select("*").order("updated_at", { ascending: false });
  if (error) return [];
  return data ?? [];
}

async function getAlertsSafe() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("auto_replenishment_alerts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) return [];
  return data ?? [];
}

export async function GET(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const [inventory, shipments, alerts, sensorLogs] = await Promise.all([
    getInventorySafe(),
    getShipmentsSafe(),
    getAlertsSafe(),
    getSensorLogsSafe()
  ]);

  const usersCount =
    getSampleUsers().length + readRegisteredUsers(request.cookies.get(DEMO_USERS_COOKIE)?.value).length;

  return NextResponse.json({
    role: auth.session.role,
    session: auth.session,
    inventory,
    shipments,
    alerts,
    sensorLogs,
    totals: {
      users: usersCount
    }
  });
}
