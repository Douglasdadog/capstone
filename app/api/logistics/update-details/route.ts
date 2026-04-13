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

  const body = (await request.json()) as {
    shipmentId?: string;
    providerName?: string;
    waybillNumber?: string;
    eta?: string;
  };
  const shipmentId = String(body.shipmentId ?? "").trim();
  if (!shipmentId) {
    return NextResponse.json({ error: "shipmentId is required." }, { status: 400 });
  }

  const providerName = String(body.providerName ?? "").trim();
  const waybillNumber = String(body.waybillNumber ?? "").trim();
  const eta = body.eta ? new Date(body.eta).toISOString() : null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("shipments")
    .update({
      provider_name: providerName || null,
      waybill_number: waybillNumber || null,
      eta,
      updated_at: new Date().toISOString()
    })
    .eq("id", shipmentId)
    .select(
      "id, tracking_number, client_name, client_email, origin, destination, status, updated_at, eta, provider_name, waybill_number, tracking_token"
    )
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, shipment: data });
}
