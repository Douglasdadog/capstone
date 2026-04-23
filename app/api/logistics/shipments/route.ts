import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";

type ShipmentRow = {
  id: string;
  tracking_number: string;
  client_name: string;
  client_email: string;
  origin: string;
  destination: string;
  status: "Pending" | "In Transit" | "Delivered";
  updated_at: string;
  eta?: string | null;
  provider_name?: string | null;
  waybill_number?: string | null;
  tracking_token?: string | null;
};

export async function GET(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }
  const canViewShipments =
    auth.session.role === "SuperAdmin" || auth.session.role === "Admin" || auth.session.role === "Sales";
  if (!canViewShipments) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  const attachOrderItems = async (rows: ShipmentRow[]) => {
    const shipmentIds = rows.map((row) => row.id);
    if (shipmentIds.length === 0) return rows;

    const { data: itemRows, error: itemsError } = await supabase
      .from("shipment_items")
      .select("shipment_id, part_number, quantity")
      .in("shipment_id", shipmentIds)
      .order("created_at", { ascending: true });
    if (itemsError) {
      throw new Error(itemsError.message);
    }

    const itemMap = new Map<string, Array<{ item_name: string; quantity: number }>>();
    for (const item of itemRows ?? []) {
      const list = itemMap.get(item.shipment_id) ?? [];
      list.push({
        item_name: String(item.part_number),
        quantity: Number(item.quantity ?? 0)
      });
      itemMap.set(item.shipment_id, list);
    }

    return rows.map((row) => ({
      ...row,
      order_items: itemMap.get(row.id) ?? []
    }));
  };

  const query = () =>
    supabase
      .from("shipments")
      .select(
        "id, tracking_number, client_name, client_email, origin, destination, status, updated_at, eta, provider_name, waybill_number, tracking_token"
      )
      .order("updated_at", { ascending: false });

  const { data, error } = await query();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const missingTokenRows = (data ?? []).filter((row) => !row.tracking_token);
  if (missingTokenRows.length > 0) {
    for (const row of missingTokenRows) {
      await supabase
        .from("shipments")
        .update({ tracking_token: crypto.randomUUID(), updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .is("tracking_token", null);
    }
    const refreshed = await query();
    if (refreshed.error) {
      return NextResponse.json({ error: refreshed.error.message }, { status: 500 });
    }
    try {
      const withItems = await attachOrderItems((refreshed.data ?? []) as ShipmentRow[]);
      return NextResponse.json({ shipments: withItems });
    } catch (itemError) {
      return NextResponse.json(
        { error: itemError instanceof Error ? itemError.message : "Unable to load order items." },
        { status: 500 }
      );
    }
  }

  try {
    const withItems = await attachOrderItems((data ?? []) as ShipmentRow[]);
    return NextResponse.json({ shipments: withItems });
  } catch (itemError) {
    return NextResponse.json(
      { error: itemError instanceof Error ? itemError.message : "Unable to load order items." },
      { status: 500 }
    );
  }
}
