import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/security/rate-limit";

const issueTypes = new Set(["Delayed Shipment", "Incorrect Status", "Order Inquiry", "Damaged Item"]);

export async function POST(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.session.role !== "Client") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rateLimited = enforceRateLimit(request, "portal-shipment-issue", 8, 60_000);
  if (rateLimited) return rateLimited;

  const body = (await request.json()) as {
    shipmentId?: string;
    issueType?: string;
    message?: string;
  };
  const shipmentId = String(body.shipmentId ?? "").trim();
  const issueType = String(body.issueType ?? "").trim();
  const message = String(body.message ?? "").trim();

  if (!shipmentId) {
    return NextResponse.json({ error: "shipmentId is required." }, { status: 400 });
  }
  if (!issueTypes.has(issueType)) {
    return NextResponse.json({ error: "Invalid issue type." }, { status: 400 });
  }
  if (message.length > 1000) {
    return NextResponse.json({ error: "Message exceeds allowed length." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: shipment, error: shipmentError } = await supabase
    .from("shipments")
    .select("id")
    .eq("id", shipmentId)
    .eq("client_email", auth.session.email)
    .maybeSingle();

  if (shipmentError) return NextResponse.json({ error: shipmentError.message }, { status: 500 });
  if (!shipment) return NextResponse.json({ error: "Shipment not found for this account." }, { status: 404 });

  const { data: ticket, error: ticketError } = await supabase
    .from("tracking_issues")
    .insert({
      shipment_id: shipment.id,
      issue_type: issueType,
      message: message || null,
      contact_email: auth.session.email
    })
    .select("id")
    .single();

  if (ticketError) return NextResponse.json({ error: ticketError.message }, { status: 500 });

  return NextResponse.json({ ok: true, ticketId: `#${ticket.id}` });
}
