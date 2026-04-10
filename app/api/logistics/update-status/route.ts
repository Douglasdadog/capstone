import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";
import { buildShipmentStatusEmail } from "@/lib/communication/shipment-email";
import { sendEmail } from "@/lib/communication/mailer";

type ShipmentStatus = "Pending" | "In Transit" | "Delivered";

function isValidStatus(status: string): status is ShipmentStatus {
  return status === "Pending" || status === "In Transit" || status === "Delivered";
}

export async function POST(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  const canUpdateShipments = auth.session.role === "Admin" || auth.session.role === "Sales";
  if (!canUpdateShipments) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { shipmentId, status } = (await request.json()) as {
    shipmentId?: string;
    status?: string;
  };

  if (!shipmentId || !status || !isValidStatus(status)) {
    return NextResponse.json({ error: "shipmentId and valid status are required." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: shipment, error: fetchError } = await supabase
    .from("shipments")
    .select("id, tracking_number, client_name, client_email, origin, destination, status")
    .eq("id", shipmentId)
    .single();

  if (fetchError || !shipment) {
    return NextResponse.json({ error: fetchError?.message ?? "Shipment not found." }, { status: 404 });
  }

  const { data: updated, error: updateError } = await supabase
    .from("shipments")
    .update({
      status,
      updated_at: new Date().toISOString()
    })
    .eq("id", shipmentId)
    .select("id, tracking_number, client_name, client_email, origin, destination, status, updated_at")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  let communication: { sent: boolean; message: string } | null = null;

  if (status === "In Transit") {
    try {
      const emailPayload = buildShipmentStatusEmail({
        clientName: shipment.client_name,
        clientEmail: shipment.client_email,
        trackingNumber: shipment.tracking_number,
        status,
        origin: shipment.origin,
        destination: shipment.destination
      });

      await sendEmail(emailPayload);
      communication = { sent: true, message: "Comm module sent client email." };
    } catch (error) {
      communication = {
        sent: false,
        message: error instanceof Error ? error.message : "Failed to send email notification."
      };
    }
  }

  return NextResponse.json({
    ok: true,
    shipment: updated,
    communication
  });
}
