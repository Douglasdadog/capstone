import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";

function normalizeTracking(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function GET(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  if (auth.session.role !== "Client" && auth.session.role !== "SuperAdmin" && auth.session.role !== "Admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  const trackingNumber = (request.nextUrl.searchParams.get("trackingNumber") ?? "").trim();
  const isPrivileged = auth.session.role === "SuperAdmin" || auth.session.role === "Admin";

  let query = supabase
    .from("shipments")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1000);

  if (!isPrivileged) {
    query = query.eq("client_email", auth.session.email);
    query = query.eq("order_source", "client");
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  if (!trackingNumber) {
    return NextResponse.json({ shipments: rows, shipment: rows[0] ?? null });
  }

  const normalizedInput = normalizeTracking(trackingNumber);
  const shipment = rows.find((row) => normalizeTracking(String(row.tracking_number ?? "")) === normalizedInput);

  if (!shipment) {
    return NextResponse.json({ error: "Shipment not found." }, { status: 404 });
  }

  return NextResponse.json({ shipment });
}
