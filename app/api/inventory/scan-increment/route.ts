import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";
import { verifyScannerLinkToken } from "@/lib/auth/scanner-link-token";
import { incrementInventoryByBarcodeScan } from "@/lib/inventory/increment-inventory-by-scan";

function normalizeKey(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

async function resolveProductCodeFromPendingManifestSerial(
  supabase: ReturnType<typeof createAdminClient>,
  barcode: string
): Promise<{ manifestId: string; productCode: string; serialId: string } | null> {
  const normalizedBarcode = normalizeKey(barcode);
  if (!normalizedBarcode) return null;
  // Resolve serial across recent manifest rows so phone scans always map
  // to product code (and do not create inventory entries by serial ID).
  const { data: rows, error: itemsError } = await supabase
    .from("manifest_items")
    .select("manifest_id, part_number, batch_id, created_at")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (itemsError) return null;

  const match = (rows ?? []).find((row) => {
    const serial = normalizeKey(String(row.batch_id ?? ""));
    if (!serial) return false;
    return serial === normalizedBarcode || normalizedBarcode.includes(serial) || serial.includes(normalizedBarcode);
  });

  const partNumber = String(match?.part_number ?? "").trim();
  const serialId = String(match?.batch_id ?? "").trim();
  const manifestId = String(match?.manifest_id ?? "").trim();
  if (!partNumber || !serialId || !manifestId) return null;
  return { manifestId, productCode: partNumber, serialId };
}

export async function POST(request: NextRequest) {
  let body: { barcode?: string; scannerToken?: string };
  try {
    body = (await request.json()) as { barcode?: string; scannerToken?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const barcode = typeof body.barcode === "string" ? body.barcode.trim() : "";
  if (!barcode || barcode.length > 200) {
    return NextResponse.json({ error: "barcode is required (max 200 characters)." }, { status: 400 });
  }

  const scannerToken = typeof body.scannerToken === "string" ? body.scannerToken.trim() : "";

  if (scannerToken) {
    const tokenResult = verifyScannerLinkToken(scannerToken);
    if (!tokenResult.ok) {
      return NextResponse.json({ error: tokenResult.error }, { status: tokenResult.status });
    }
  } else {
    const auth = requireDemoSession(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }
    if (!["Inventory", "Admin", "SuperAdmin"].includes(auth.session.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    const supabase = createAdminClient();
    const mapped = await resolveProductCodeFromPendingManifestSerial(supabase, barcode);

    // Phone/BYOD scan during manifest verification:
    // log the scan for laptop parts counter; do not increment inventory yet.
    if (scannerToken && mapped) {
      const { error: scanLogError } = await supabase.from("manifest_scan_events").insert({
        manifest_id: mapped.manifestId,
        serial_id: mapped.serialId,
        product_code: mapped.productCode,
        source: "phone"
      });
      if (scanLogError) {
        return NextResponse.json(
          {
            error:
              "Manifest scan logging is not available yet. Run the latest Supabase inventory setup SQL and retry."
          },
          { status: 409 }
        );
      }
      return NextResponse.json({
        ok: true,
        mode: "manifest",
        serialId: mapped.serialId,
        productCode: mapped.productCode
      });
    }

    const inventoryKey = mapped?.productCode ?? barcode;
    const result = await incrementInventoryByBarcodeScan(supabase, inventoryKey);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      name: result.name,
      quantity: result.quantity,
      resolvedFromSerial: Boolean(mapped?.productCode),
      productCode: mapped?.productCode ?? null
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update inventory." },
      { status: 500 }
    );
  }
}
