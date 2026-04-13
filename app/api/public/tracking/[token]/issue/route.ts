import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const issueTypes = new Set(["Delayed Shipment", "Incorrect Status", "Order Inquiry"]);

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  if (!token) return NextResponse.json({ error: "Token is required." }, { status: 400 });

  const body = (await request.json()) as {
    issueType?: string;
    message?: string;
    contactEmail?: string;
  };

  const issueType = String(body.issueType ?? "").trim();
  if (!issueTypes.has(issueType)) {
    return NextResponse.json({ error: "Invalid issue type." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: shipment, error: shipmentError } = await supabase
    .from("shipments")
    .select("id")
    .eq("tracking_token", token)
    .maybeSingle();

  if (shipmentError) return NextResponse.json({ error: shipmentError.message }, { status: 500 });
  if (!shipment) return NextResponse.json({ error: "Tracking link is invalid or expired." }, { status: 404 });

  const { data: ticket, error: ticketError } = await supabase
    .from("tracking_issues")
    .insert({
      shipment_id: shipment.id,
      issue_type: issueType,
      message: body.message?.trim() || null,
      contact_email: body.contactEmail?.trim() || null
    })
    .select("id")
    .single();

  if (ticketError) return NextResponse.json({ error: ticketError.message }, { status: 500 });

  return NextResponse.json({ ok: true, ticketId: `#${ticket.id}` });
}
