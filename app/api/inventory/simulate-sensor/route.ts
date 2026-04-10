import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type InventoryItem = {
  id: string;
  name: string;
  quantity: number;
  threshold_limit: number;
};

export async function POST() {
  try {
    const supabase = createAdminClient();

    const { data: items, error: itemsError } = await supabase
      .from("inventory")
      .select("id, name, quantity, threshold_limit")
      .order("updated_at", { ascending: false });

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: "No inventory rows found. Add inventory records first." },
        { status: 400 }
      );
    }

    const selected = items[Math.floor(Math.random() * items.length)] as InventoryItem;
    const dropBy = Math.floor(Math.random() * 8) + 1;
    const newQuantity = Math.max(0, selected.quantity - dropBy);
    const belowThreshold = newQuantity < selected.threshold_limit;

    const { error: updateError } = await supabase
      .from("inventory")
      .update({
        quantity: newQuantity,
        updated_at: new Date().toISOString()
      })
      .eq("id", selected.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    let alertId: string | null = null;

    if (belowThreshold) {
      const { data: alertRow, error: alertError } = await supabase
        .from("auto_replenishment_alerts")
        .insert({
          inventory_id: selected.id,
          item_name: selected.name,
          reading_quantity: newQuantity,
          threshold_limit: selected.threshold_limit,
          status: "triggered",
          message: `Auto replenishment triggered for ${selected.name}`
        })
        .select("id")
        .single();

      if (alertError) {
        return NextResponse.json(
          {
            error: `Sensor updated stock but alert logging failed: ${alertError.message}`
          },
          { status: 500 }
        );
      }

      alertId = alertRow?.id ?? null;
    }

    return NextResponse.json({
      ok: true,
      item: {
        id: selected.id,
        name: selected.name,
        previousQuantity: selected.quantity,
        newQuantity,
        thresholdLimit: selected.threshold_limit
      },
      alertTriggered: belowThreshold,
      alertId
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to run sensor simulation. Check Supabase setup."
      },
      { status: 500 }
    );
  }
}
