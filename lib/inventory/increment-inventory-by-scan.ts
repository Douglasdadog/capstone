import type { SupabaseClient } from "@supabase/supabase-js";

function inferCategory(partNumber: string): "Maintenance Free" | "Conventional" {
  return partNumber.toLowerCase().includes("d-zel") ? "Conventional" : "Maintenance Free";
}

function defaultImageUrl(category: "Maintenance Free" | "Conventional"): string {
  if (category === "Maintenance Free") {
    return "https://placehold.co/320x200/fef3c7/92400e?text=Evvo+Maintenance+Free";
  }
  return "https://placehold.co/320x200/e2e8f0/334155?text=D-Zel+King+Conventional";
}

function isMissingInventoryColumnError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("column") && normalized.includes("inventory.") && normalized.includes("does not exist");
}

export async function incrementInventoryByBarcodeScan(
  supabase: SupabaseClient,
  sku: string
): Promise<{ ok: true; name: string; quantity: number } | { ok: false; error: string }> {
  const trimmed = sku.trim().slice(0, 120);
  if (!trimmed) {
    return { ok: false, error: "barcode is empty." };
  }

  const { data: rows, error: listError } = await supabase
    .from("inventory")
    .select("id, name, quantity, threshold_limit, category, image_url")
    .limit(5000);

  if (listError) {
    return { ok: false, error: listError.message };
  }

  const lower = trimmed.toLowerCase();
  const match = (rows ?? []).find((r) => String(r.name ?? "").trim().toLowerCase() === lower);
  const nowIso = new Date().toISOString();

  if (match) {
    const nextQty = Number(match.quantity ?? 0) + 1;
    const { error: updateError } = await supabase
      .from("inventory")
      .update({ quantity: nextQty, updated_at: nowIso })
      .eq("id", match.id);
    if (updateError) {
      return { ok: false, error: updateError.message };
    }
    return { ok: true, name: String(match.name), quantity: nextQty };
  }

  const category = inferCategory(trimmed);
  const image_url = defaultImageUrl(category);

  const modernInsert = await supabase
    .from("inventory")
    .insert({
      name: trimmed,
      category,
      image_url,
      quantity: 1,
      threshold_limit: 10,
      updated_at: nowIso
    })
    .select("name, quantity")
    .single();

  if (modernInsert.error) {
    if (!isMissingInventoryColumnError(modernInsert.error.message)) {
      return { ok: false, error: modernInsert.error.message };
    }

    const legacyInsert = await supabase
      .from("inventory")
      .insert({
        name: trimmed,
        quantity: 1,
        threshold_limit: 10,
        updated_at: nowIso
      })
      .select("name, quantity")
      .single();

    if (legacyInsert.error) {
      return { ok: false, error: legacyInsert.error.message };
    }
    return { ok: true, name: String(legacyInsert.data?.name ?? trimmed), quantity: Number(legacyInsert.data?.quantity ?? 1) };
  }

  return { ok: true, name: String(modernInsert.data?.name ?? trimmed), quantity: Number(modernInsert.data?.quantity ?? 1) };
}
