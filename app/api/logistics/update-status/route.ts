import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";
import { buildShipmentStatusEmail } from "@/lib/communication/shipment-email";
import { sendSmtpEmail } from "@/lib/communication/mailer";
import { beginIdempotentRequest, completeIdempotentRequest } from "@/lib/api/idempotency";
import { releaseShipmentInventory } from "@/lib/logistics/release-inventory";
import { writeActivityLog } from "@/lib/audit/activity-log";

type ShipmentStatus = "Pending" | "In Transit" | "Delivered";

function isValidStatus(status: string): status is ShipmentStatus {
  return status === "Pending" || status === "In Transit" || status === "Delivered";
}

function normalizeStatus(status: string | undefined): ShipmentStatus | null {
  if (!status) return null;
  const value = status.trim();
  if (value === "In-Transit") return "In Transit";
  if (isValidStatus(value)) return value;
  return null;
}

export async function POST(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  const canUpdateShipments =
    auth.session.role === "SuperAdmin" || auth.session.role === "Admin" || auth.session.role === "Sales";
  if (!canUpdateShipments) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { shipmentId, status: rawStatus } = (await request.json()) as {
    shipmentId?: string;
    status?: string;
  };
  const status = normalizeStatus(rawStatus);

  if (!shipmentId || !status) {
    return NextResponse.json({ error: "shipmentId and valid status are required." }, { status: 400 });
  }

  const idempotency = await beginIdempotentRequest(request, "logistics:update-status");
  if (idempotency.errorResponse) return idempotency.errorResponse;
  if (idempotency.replayResponse) return idempotency.replayResponse;

  const supabase = createAdminClient();
  const { data: shipment, error: fetchError } = await supabase
    .from("shipments")
    .select("*")
    .eq("id", shipmentId)
    .single();

  if (fetchError || !shipment) {
    return NextResponse.json({ error: fetchError?.message ?? "Shipment not found." }, { status: 404 });
  }

  if (status === "In Transit") {
    if (!shipment.payment_proof_url) {
      return NextResponse.json({ error: "Payment proof is required before releasing shipment." }, { status: 400 });
    }
    const released = await releaseShipmentInventory(shipmentId);
    if (!released.ok) return NextResponse.json({ error: released.error }, { status: 409 });
  }

  const nowIso = new Date().toISOString();
  let updated: Record<string, unknown> | null = null;
  let updateError: { message: string } | null = null;
  const modernUpdate = await supabase
    .from("shipments")
    .update({
      status,
      milestone_status: status,
      payment_status: status === "In Transit" ? "Verified" : shipment.payment_status ?? "Awaiting Payment",
      payment_verified_at: status === "In Transit" ? nowIso : null,
      updated_at: nowIso
    })
    .eq("id", shipmentId)
    .select(
      "id, tracking_number, client_name, client_email, origin, destination, status, updated_at, eta, provider_name, waybill_number, tracking_token"
    )
    .single();
  if (!modernUpdate.error && modernUpdate.data) {
    updated = modernUpdate.data as Record<string, unknown>;
  } else if (modernUpdate.error?.message.toLowerCase().includes("column")) {
    const legacyUpdate = await supabase
      .from("shipments")
      .update({
        status,
        updated_at: nowIso
      })
      .eq("id", shipmentId)
      .select(
        "id, tracking_number, client_name, client_email, origin, destination, status, updated_at, eta, provider_name, waybill_number, tracking_token"
      )
      .single();
    updateError = legacyUpdate.error ? { message: legacyUpdate.error.message } : null;
    updated = (legacyUpdate.data as Record<string, unknown> | null) ?? null;
  } else {
    updateError = modernUpdate.error ? { message: modernUpdate.error.message } : null;
  }

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  let communication: { sent: boolean; message: string } | null = null;

  if (status === "In Transit" || status === "Delivered") {
    try {
      const { data: shipmentItems } = await supabase
        .from("shipment_items")
        .select("part_number, quantity")
        .eq("shipment_id", shipmentId)
        .order("created_at", { ascending: true });
      const itemDetails = (shipmentItems ?? [])
        .map((item) => `${item.part_number} x${item.quantity}`)
        .filter((value) => value.length > 0);

      const emailPayload = buildShipmentStatusEmail({
        clientName: shipment.client_name,
        clientEmail: shipment.client_email,
        trackingNumber: shipment.tracking_number,
        status,
        origin: shipment.origin,
        destination: shipment.destination,
        eta: shipment.eta,
        providerName: shipment.provider_name ?? null,
        waybillNumber: shipment.waybill_number ?? null,
        itemDetails,
        trackingLink: shipment.tracking_token
          ? `${request.nextUrl.origin}/track/${shipment.tracking_token}`
          : null
      });

      await sendSmtpEmail(emailPayload);
      communication = { sent: true, message: "SMTP trigger sent client email." };
    } catch (error) {
      communication = {
        sent: false,
        message: error instanceof Error ? error.message : "Failed to send email notification."
      };
    }
  }

  const responseBody = {
    ok: true,
    shipment: updated,
    communication
  };
  await writeActivityLog(request, {
    actorEmail: auth.session.email,
    actorRole: auth.session.role,
    action: "logistics.update_status",
    targetModule: "logistics",
    targetId: shipmentId,
    details: { status }
  });
  await completeIdempotentRequest(idempotency.key, 200, responseBody);
  return NextResponse.json(responseBody);
}
