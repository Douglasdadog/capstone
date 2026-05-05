import { createAdminClient } from "@/lib/supabase/admin";

type ReleaseResult = { ok: true } | { ok: false; error: string };

export async function releaseShipmentInventory(shipmentId: string): Promise<ReleaseResult> {
  const supabase = createAdminClient();
  const rpc = await supabase.rpc("wis_release_shipment_inventory", { p_shipment_id: shipmentId });
  if (!rpc.error && rpc.data && typeof rpc.data === "object") {
    const result = rpc.data as { ok?: boolean; error?: string };
    if (result.ok) return { ok: true };
    return { ok: false, error: result.error ?? "Unable to release inventory." };
  }
  if (rpc.error && !rpc.error.message.toLowerCase().includes("function")) {
    return { ok: false, error: rpc.error.message };
  }

  // Backward-compatible fallback if RPC migration has not been applied yet.
  const { data: shipment, error: shipmentError } = await supabase
    .from("shipments")
    .select("id, inventory_deducted_at")
    .eq("id", shipmentId)
    .single();

  if (shipmentError || !shipment) {
    return { ok: false, error: shipmentError?.message ?? "Shipment not found." };
  }
  if (shipment.inventory_deducted_at) return { ok: true };

  const { data: itemRows, error: itemsError } = await supabase
    .from("shipment_items")
    .select("part_number, quantity")
    .eq("shipment_id", shipmentId);
  if (itemsError) return { ok: false, error: itemsError.message };

  const grouped = new Map<string, number>();
  for (const row of itemRows ?? []) {
    const part = String(row.part_number ?? "").trim();
    const qty = Number(row.quantity ?? 0);
    if (!part || !Number.isFinite(qty) || qty <= 0) continue;
    grouped.set(part, (grouped.get(part) ?? 0) + qty);
  }

  for (const [itemName, requiredQty] of grouped.entries()) {
    const { data: inv, error: invError } = await supabase
      .from("inventory")
      .select("id, name, quantity, threshold_limit")
      .eq("name", itemName)
      .single();
    if (invError || !inv) {
      return { ok: false, error: invError?.message ?? `Inventory item not found: ${itemName}` };
    }
    const available = Number(inv.quantity ?? 0);
    if (available < requiredQty) {
      return {
        ok: false,
        error: `Insufficient stock for ${itemName}. Required ${requiredQty}, available ${available}.`
      };
    }

    const { data: updatedRows, error: updateError } = await supabase
      .from("inventory")
      .update({
        quantity: available - requiredQty,
        updated_at: new Date().toISOString()
      })
      .eq("id", inv.id)
      .eq("quantity", available)
      .select("id, name, quantity, threshold_limit")
      .limit(1);

    if (updateError || !updatedRows || updatedRows.length === 0) {
      return {
        ok: false,
        error: updateError?.message ?? `Stock update failed for ${itemName}. Please retry.`
      };
    }

    const updated = updatedRows[0];
    if (Number(updated.quantity) < Number(updated.threshold_limit)) {
      await supabase.from("auto_replenishment_alerts").insert({
        inventory_id: updated.id,
        item_name: updated.name,
        reading_quantity: updated.quantity,
        threshold_limit: updated.threshold_limit,
        status: "triggered",
        message: `Low stock alert triggered for ${updated.name}`
      });
    }
  }

  const { error: markError } = await supabase
    .from("shipments")
    .update({ inventory_deducted_at: new Date().toISOString() })
    .eq("id", shipmentId)
    .is("inventory_deducted_at", null);

  if (markError) return { ok: false, error: markError.message };
  return { ok: true };
}
