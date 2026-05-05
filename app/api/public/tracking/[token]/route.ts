import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  if (!token) return NextResponse.json({ error: "Token is required." }, { status: 400 });

  const supabase = createAdminClient();
  const { data: shipment, error } = await supabase
    .from("shipments")
    .select(
      "id, tracking_number, client_name, origin, destination, status, milestone_status, updated_at, eta, provider_name, waybill_number, item_name, quantity"
    )
    .eq("tracking_token", token)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!shipment) return NextResponse.json({ error: "Tracking link is invalid or expired." }, { status: 404 });

  const { data: items, error: itemsError } = await supabase
    .from("shipment_items")
    .select("part_number, quantity, batch_id")
    .eq("shipment_id", shipment.id)
    .order("part_number", { ascending: true });
  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  const fallbackItems =
    items && items.length > 0
      ? items
      : shipment.item_name
        ? [{ part_number: shipment.item_name, quantity: Number(shipment.quantity ?? 1), batch_id: null }]
        : [];

  return NextResponse.json({
    shipment,
    items: fallbackItems
  });
}
