import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";
import { verifyScannerLinkToken } from "@/lib/auth/scanner-link-token";
import { incrementInventoryByBarcodeScan } from "@/lib/inventory/increment-inventory-by-scan";

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
    const result = await incrementInventoryByBarcodeScan(supabase, barcode);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, name: result.name, quantity: result.quantity });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update inventory." },
      { status: 500 }
    );
  }
}
