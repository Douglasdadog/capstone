import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";

type ManifestItemRow = {
  part_number: string;
  quantity: number;
  batch_id: string;
};

type InventoryRow = {
  id: string;
  name: string;
  quantity: number;
};

function inferCategory(partNumber: string): "Maintenance Free" | "Conventional" {
  return partNumber.toLowerCase().includes("d-zel") ? "Conventional" : "Maintenance Free";
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (!["Inventory", "Admin", "SuperAdmin"].includes(auth.session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "Manifest id is required." }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as { scannedCounts?: Record<string, number> };
  const scannedCounts = body.scannedCounts ?? {};

  try {
    const supabase = createAdminClient();
    const { data: manifestRow, error: manifestReadError } = await supabase
      .from("manifests")
      .select("id, status")
      .eq("id", id)
      .single();
    if (manifestReadError || !manifestRow) {
      return NextResponse.json({ error: manifestReadError?.message ?? "Manifest not found." }, { status: 404 });
    }
    if (manifestRow.status === "Completed") {
      return NextResponse.json({ ok: true, alreadyCompleted: true });
    }

    const { data: manifestItems, error: itemsError } = await supabase
      .from("manifest_items")
      .select("part_number, quantity, batch_id")
      .eq("manifest_id", id);
    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    const rows = (manifestItems ?? []) as ManifestItemRow[];
    const groupedScannedByProduct = new Map<string, number>();
    const missing: Array<{ serialId: string; productCode: string; expected: number; scanned: number }> = [];

    for (const row of rows) {
      const serialId = String(row.batch_id ?? "").trim();
      const productCode = String(row.part_number ?? "").trim();
      const expected = Math.max(0, Number(row.quantity ?? 0));
      if (!serialId || !productCode || expected <= 0) continue;

      const scanned = Math.max(0, Math.floor(Number(scannedCounts[serialId] ?? 0)));
      const accepted = Math.min(scanned, expected);
      if (accepted > 0) {
        groupedScannedByProduct.set(productCode, (groupedScannedByProduct.get(productCode) ?? 0) + accepted);
      }
      if (accepted < expected) {
        missing.push({ serialId, productCode, expected, scanned: accepted });
      }
    }

    // Apply only scanned/accepted quantities to inventory.
    if (groupedScannedByProduct.size > 0) {
      const productCodes = Array.from(groupedScannedByProduct.keys());
      const { data: existingInventory, error: inventoryError } = await supabase
        .from("inventory")
        .select("id, name, quantity")
        .in("name", productCodes);
      if (inventoryError) {
        return NextResponse.json({ error: inventoryError.message }, { status: 500 });
      }

      const existingMap = new Map(
        ((existingInventory ?? []) as InventoryRow[]).map((item) => [
          String(item.name),
          { id: String(item.id), quantity: Number(item.quantity ?? 0) }
        ])
      );

      for (const [productCode, addQty] of groupedScannedByProduct.entries()) {
        const existing = existingMap.get(productCode);
        const nowIso = new Date().toISOString();
        if (existing) {
          const { error: updateError } = await supabase
            .from("inventory")
            .update({ quantity: existing.quantity + addQty, updated_at: nowIso })
            .eq("id", existing.id);
          if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
          continue;
        }

        const { error: insertError } = await supabase.from("inventory").insert({
          name: productCode,
          category: inferCategory(productCode),
          quantity: addQty,
          threshold_limit: 5,
          updated_at: nowIso
        });
        if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }

    const missingPreview = missing
      .slice(0, 12)
      .map((row) => `${row.serialId} (${row.productCode}) ${row.scanned}/${row.expected}`)
      .join(", ");
    const reportComments =
      missing.length > 0
        ? `Auto-generated from scanner completion. Missing ${missing.length} serial item(s): ${missingPreview}${missing.length > 12 ? ", ..." : ""}`
        : "Auto-generated from scanner completion. No missing serial items.";

    await supabase.from("manifest_reports").insert({
      manifest_id: id,
      reported_by: auth.session.email,
      reason: "Short Shipment",
      comments: reportComments
    });

    const { error: manifestUpdateError } = await supabase
      .from("manifests")
      .update({
        status: missing.length > 0 ? "Discrepancies" : "Completed",
        discrepancy_notes: missing.length > 0 ? reportComments : null,
        updated_at: new Date().toISOString()
      })
      .eq("id", id);
    if (manifestUpdateError) {
      return NextResponse.json({ error: manifestUpdateError.message }, { status: 500 });
    }

    await supabase.from("manifest_scan_events").delete().eq("manifest_id", id);

    return NextResponse.json({
      ok: true,
      acceptedCount: Array.from(groupedScannedByProduct.values()).reduce((sum, n) => sum + n, 0),
      missingCount: missing.length,
      status: missing.length > 0 ? "Discrepancies" : "Completed"
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to auto-report missing items." },
      { status: 500 }
    );
  }
}
