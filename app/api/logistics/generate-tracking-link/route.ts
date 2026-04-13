import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  const canUpdateShipments = auth.session.role === "Admin" || auth.session.role === "Sales";
  if (!canUpdateShipments) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as { shipmentId?: string };
  const shipmentId = String(body.shipmentId ?? "").trim();
  if (!shipmentId) return NextResponse.json({ error: "shipmentId is required." }, { status: 400 });

  const token = randomUUID();
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("shipments")
    .update({ tracking_token: token, updated_at: new Date().toISOString() })
    .eq("id", shipmentId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const trackingLink = `${request.nextUrl.origin}/track/${token}`;
  return NextResponse.json({ ok: true, token, trackingLink });
}
