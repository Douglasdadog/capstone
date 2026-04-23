import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";

function inferCategory(partNumber: string): "Maintenance Free" | "Conventional" {
  return partNumber.toLowerCase().includes("d-zel") ? "Conventional" : "Maintenance Free";
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.session.role !== "Inventory" && auth.session.role !== "Admin" && auth.session.role !== "SuperAdmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "Manifest id is required." }, { status: 400 });

  try {
    const supabase = createAdminClient();
    const { data: manifestItems, error: itemsError } = await supabase
      .from("manifest_items")
      .select("part_number, quantity")
      .eq("manifest_id", id);

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    const mergedByPart = new Map<string, number>();
    for (const row of manifestItems ?? []) {
      const partNumber = String(row.part_number ?? "").trim();
      const qty = Number(row.quantity ?? 0);
      if (!partNumber || !Number.isFinite(qty) || qty <= 0) continue;
      mergedByPart.set(partNumber, (mergedByPart.get(partNumber) ?? 0) + qty);
    }

    if (mergedByPart.size > 0) {
      const partNames = Array.from(mergedByPart.keys());
      const { data: existingInventory, error: inventoryError } = await supabase
        .from("inventory")
        .select("id, name, quantity")
        .in("name", partNames);

      if (inventoryError) {
        return NextResponse.json({ error: inventoryError.message }, { status: 500 });
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
          if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
          }
          continue;
        }

        const { error: insertError } = await supabase.from("inventory").insert({
          name: partNumber,
          category: inferCategory(partNumber),
          quantity: addQty,
          threshold_limit: 5,
          updated_at: nowIso
        });
        if (insertError) {
          return NextResponse.json({ error: insertError.message }, { status: 500 });
        }
      }
    }

    const { error } = await supabase
      .from("manifests")
      .update({
        status: "Completed",
        discrepancy_notes: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to complete manifest." },
      { status: 500 }
    );
  }
}
