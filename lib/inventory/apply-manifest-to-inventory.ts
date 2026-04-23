import { createAdminClient } from "@/lib/supabase/admin";

function inferCategory(partNumber: string): "Maintenance Free" | "Conventional" {
  return partNumber.toLowerCase().includes("d-zel") ? "Conventional" : "Maintenance Free";
}

/** Returns an error message string on failure, or null on success. */
export async function applyManifestItemsToInventory(manifestId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data: manifestItems, error: itemsError } = await supabase
    .from("manifest_items")
    .select("part_number, quantity")
    .eq("manifest_id", manifestId);

  if (itemsError) {
    return itemsError.message;
  }

  const mergedByPart = new Map<string, number>();
  for (const row of manifestItems ?? []) {
    const partNumber = String(row.part_number ?? "").trim();
    const qty = Number(row.quantity ?? 0);
    if (!partNumber || !Number.isFinite(qty) || qty <= 0) continue;
    mergedByPart.set(partNumber, (mergedByPart.get(partNumber) ?? 0) + qty);
  }

  if (mergedByPart.size === 0) return null;

  const partNames = Array.from(mergedByPart.keys());
  const { data: existingInventory, error: inventoryError } = await supabase
    .from("inventory")
    .select("id, name, quantity")
    .in("name", partNames);

  if (inventoryError) {
    return inventoryError.message;
  }

  const existingMap = new Map(
    (existingInventory ?? []).map((item) => [String(item.name), { id: String(item.id), quantity: Number(item.quantity ?? 0) }])
  );

  for (const [partNumber, addQty] of mergedByPart.entries()) {
    const existing = existingMap.get(partNumber);
    const nowIso = new Date().toISOString();
    if (existing) {
      const { error: updateError } = await supabase
        .from("inventory")
        .update({
          quantity: existing.quantity + addQty,
          updated_at: nowIso
        })
        .eq("id", existing.id);
      if (updateError) return updateError.message;
      continue;
    }

    const { error: insertError } = await supabase.from("inventory").insert({
      name: partNumber,
      category: inferCategory(partNumber),
      quantity: addQty,
      threshold_limit: 5,
      updated_at: nowIso
    });
    if (insertError) return insertError.message;
  }

  return null;
}
