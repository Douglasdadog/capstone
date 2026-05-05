import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  const { token } = await context.params;
  if (!token) return NextResponse.json({ error: "Token is required." }, { status: 400 });

  const supabase = createAdminClient();
  const { data: shipment, error } = await supabase
    .from("shipments")
    .select("id, tracking_number, tracking_token, client_name, client_email, origin, destination, status, payment_status, updated_at")
    .eq("tracking_token", token)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!shipment) return NextResponse.json({ error: "Invoice token not found." }, { status: 404 });

  const canView =
    auth.session.role === "SuperAdmin" ||
    auth.session.role === "Admin" ||
    auth.session.role === "Sales" ||
    shipment.client_email.toLowerCase() === auth.session.email.toLowerCase();
  if (!canView) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: items, error: itemsError } = await supabase
    .from("shipment_items")
    .select("part_number, quantity")
    .eq("shipment_id", shipment.id)
    .order("created_at", { ascending: true });
  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  page.drawText("Digital Invoice / Payment Instruction Slip", { x: 40, y: 804, size: 17, font: bold });
  page.drawText(`Tracking Number: ${shipment.tracking_number}`, { x: 40, y: 778, size: 11, font: bold });
  page.drawText(`Tracking Token: ${shipment.tracking_token}`, { x: 40, y: 762, size: 10, font });
  page.drawText(`Client: ${shipment.client_name} <${shipment.client_email}>`, { x: 40, y: 746, size: 10, font });
  page.drawText(`Route: ${shipment.origin} -> ${shipment.destination}`, { x: 40, y: 730, size: 10, font });
  page.drawText(`Order Status: ${shipment.status} / Payment: ${shipment.payment_status ?? "Awaiting Payment"}`, {
    x: 40,
    y: 714,
    size: 10,
    font
  });
  page.drawText(`Issued At: ${new Date(shipment.updated_at).toLocaleString()}`, { x: 40, y: 698, size: 10, font });

  page.drawText("Line Items", { x: 40, y: 670, size: 11, font: bold });
  let y = 650;
  for (const item of items ?? []) {
    page.drawText(`${item.part_number} x${item.quantity}`, { x: 48, y, size: 10, font });
    y -= 16;
  }

  y -= 10;
  page.drawText("Manual Payment Instructions", { x: 40, y, size: 11, font: bold });
  y -= 18;
  page.drawText("- Pay via GCash or Bank transfer using the approved company account.", { x: 48, y, size: 10, font });
  y -= 14;
  page.drawText("- Include tracking number in your payment reference.", { x: 48, y, size: 10, font });
  y -= 14;
  page.drawText("- Upload payment screenshot in the client portal under your order history.", { x: 48, y, size: 10, font });
  y -= 14;
  page.drawText("- Sales will approve & release once proof is validated.", { x: 48, y, size: 10, font });

  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-${shipment.tracking_number}.pdf"`
    }
  });
}
