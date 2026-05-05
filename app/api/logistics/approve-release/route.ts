import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";
import { writeActivityLog } from "@/lib/audit/activity-log";
import { releaseShipmentInventory } from "@/lib/logistics/release-inventory";

export async function POST(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  const canApprove = auth.session.role === "SuperAdmin" || auth.session.role === "Admin" || auth.session.role === "Sales";
  if (!canApprove) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { shipmentId } = (await request.json()) as { shipmentId?: string };
  if (!shipmentId || !shipmentId.trim()) {
    return NextResponse.json({ error: "shipmentId is required." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: shipment, error: shipmentError } = await supabase
    .from("shipments")
    .select("id, tracking_number, payment_proof_url, status, inventory_deducted_at")
    .eq("id", shipmentId.trim())
    .single();

  if (shipmentError || !shipment) {
    return NextResponse.json({ error: shipmentError?.message ?? "Shipment not found." }, { status: 404 });
  }
  if (!shipment.payment_proof_url) {
    return NextResponse.json({ error: "Payment proof is required before approval." }, { status: 400 });
  }

  const released = await releaseShipmentInventory(shipment.id);
  if (!released.ok) return NextResponse.json({ error: released.error }, { status: 409 });

  const nowIso = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from("shipments")
    .update({
      status: "In Transit",
      milestone_status: "In Transit",
      payment_status: "Verified",
      payment_verified_at: nowIso,
      approved_released_at: nowIso,
      approved_released_by: auth.session.email,
      updated_at: nowIso
    })
    .eq("id", shipment.id)
    .select(
      "id, tracking_number, client_name, client_email, origin, destination, status, milestone_status, payment_status, updated_at, tracking_token"
    )
    .single();
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await writeActivityLog(request, {
    actorEmail: auth.session.email,
    actorRole: auth.session.role,
    action: "sales.approve_release",
    targetModule: "logistics",
    targetId: shipment.id,
    details: { tracking_number: shipment.tracking_number }
  });

  return NextResponse.json({ ok: true, shipment: updated });
}
