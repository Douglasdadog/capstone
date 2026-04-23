import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";
import { sendSmtpEmail } from "@/lib/communication/mailer";
import { buildShipmentOrderCreatedEmail } from "@/lib/communication/shipment-email";

export async function POST(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const canResend =
    auth.session.role === "SuperAdmin" || auth.session.role === "Admin" || auth.session.role === "Sales";
  if (!canResend) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as { shipmentId?: string };
  const shipmentId = typeof body.shipmentId === "string" ? body.shipmentId.trim() : "";
  if (!shipmentId) {
    return NextResponse.json({ error: "shipmentId is required." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: shipment, error: shipmentError } = await supabase
    .from("shipments")
    .select("id, tracking_number, client_name, client_email, origin, destination, eta, tracking_token, item_name, quantity")
    .eq("id", shipmentId)
    .single();

  if (shipmentError || !shipment) {
    return NextResponse.json({ error: shipmentError?.message ?? "Shipment not found." }, { status: 404 });
  }

  const { data: shipmentItems, error: itemsError } = await supabase
    .from("shipment_items")
    .select("part_number, quantity")
    .eq("shipment_id", shipmentId)
    .order("created_at", { ascending: true });

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  const itemDetails =
    (shipmentItems ?? [])
      .map((item) => `${item.part_number} x${item.quantity}`)
      .filter((value) => value.length > 0) ||
    [];

  if (itemDetails.length === 0 && shipment.item_name) {
    itemDetails.push(`${shipment.item_name} x${shipment.quantity ?? 1}`);
  }

  const trackingLink = shipment.tracking_token ? `${request.nextUrl.origin}/track/${shipment.tracking_token}` : null;

  try {
    await sendSmtpEmail(
      buildShipmentOrderCreatedEmail({
        clientName: shipment.client_name,
        clientEmail: shipment.client_email,
        trackingNumber: shipment.tracking_number,
        origin: shipment.origin,
        destination: shipment.destination,
        eta: shipment.eta,
        trackingLink,
        itemDetails: itemDetails.length > 0 ? itemDetails : ["Order details to be updated"]
      })
    );

    return NextResponse.json({ ok: true, message: "Confirmation email resent successfully." });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to resend confirmation email."
      },
      { status: 500 }
    );
  }
}
