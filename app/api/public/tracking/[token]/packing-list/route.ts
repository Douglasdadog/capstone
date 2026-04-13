import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  if (!token) return NextResponse.json({ error: "Token is required." }, { status: 400 });

  const supabase = createAdminClient();
  const { data: shipment, error: shipmentError } = await supabase
    .from("shipments")
    .select("id, tracking_number, client_name, origin, destination, eta")
    .eq("tracking_token", token)
    .maybeSingle();
  if (shipmentError) return NextResponse.json({ error: shipmentError.message }, { status: 500 });
  if (!shipment) return NextResponse.json({ error: "Tracking link is invalid or expired." }, { status: 404 });

  const { data: items, error: itemsError } = await supabase
    .from("shipment_items")
    .select("part_number, quantity, batch_id")
    .eq("shipment_id", shipment.id)
    .order("part_number", { ascending: true });
  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  page.drawText("Digital Packing List", { x: 40, y: 800, size: 20, font: bold });
  page.drawText(`Tracking: ${shipment.tracking_number}`, { x: 40, y: 772, size: 11, font });
  page.drawText(`Client: ${shipment.client_name}`, { x: 40, y: 756, size: 11, font });
  page.drawText(`Route: ${shipment.origin} -> ${shipment.destination}`, { x: 40, y: 740, size: 11, font });
  page.drawText(`ETA: ${shipment.eta ? new Date(shipment.eta).toLocaleString() : "-"}`, {
    x: 40,
    y: 724,
    size: 11,
    font
  });

  page.drawText("Item", { x: 40, y: 690, size: 11, font: bold });
  page.drawText("Qty", { x: 320, y: 690, size: 11, font: bold });
  page.drawText("Batch", { x: 380, y: 690, size: 11, font: bold });

  let y = 670;
  const safeItems = items ?? [];
  for (const item of safeItems.slice(0, 28)) {
    page.drawText(String(item.part_number), { x: 40, y, size: 10, font });
    page.drawText(String(item.quantity), { x: 320, y, size: 10, font });
    page.drawText(String(item.batch_id ?? "-"), { x: 380, y, size: 10, font });
    y -= 18;
  }

  if (safeItems.length === 0) {
    page.drawText("No itemized rows available for this shipment.", { x: 40, y, size: 10, font });
  }

  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="packing-list-${shipment.tracking_number}.pdf"`
    }
  });
}
