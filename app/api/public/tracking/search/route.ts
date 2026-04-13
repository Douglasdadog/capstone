import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export async function GET(request: NextRequest) {
  const rateLimited = enforceRateLimit(request, "public-tracking-search", 20, 60_000);
  if (rateLimited) return rateLimited;

  const trackingNumber = (request.nextUrl.searchParams.get("trackingNumber") ?? "").trim();
  if (!trackingNumber) {
    return NextResponse.json({ error: "trackingNumber is required." }, { status: 400 });
  }
  if (trackingNumber.length > 60) {
    return NextResponse.json({ error: "Invalid tracking number." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: shipment, error } = await supabase
    .from("shipments")
    .select(
      "id, tracking_number, client_name, origin, destination, status, updated_at, eta, provider_name, waybill_number, item_name, quantity"
    )
    .ilike("tracking_number", trackingNumber)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!shipment) return NextResponse.json({ error: "Shipment not found." }, { status: 404 });

  const { data: items, error: itemsError } = await supabase
    .from("shipment_items")
    .select("part_number, quantity, batch_id")
    .eq("shipment_id", shipment.id)
    .order("part_number", { ascending: true });
  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });

  const fallbackItems =
    items && items.length > 0
      ? items
      : shipment.item_name
        ? [{ part_number: shipment.item_name, quantity: Number(shipment.quantity ?? 1), batch_id: null }]
        : [];

  return NextResponse.json({ shipment, items: fallbackItems });
}
