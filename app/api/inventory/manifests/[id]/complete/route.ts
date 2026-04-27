import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";
import { applyManifestItemsToInventory } from "@/lib/inventory/apply-manifest-to-inventory";
import { beginIdempotentRequest, completeIdempotentRequest } from "@/lib/api/idempotency";

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

  const idempotency = await beginIdempotentRequest(request, `inventory:manifest-complete:${id}`);
  if (idempotency.errorResponse) return idempotency.errorResponse;
  if (idempotency.replayResponse) return idempotency.replayResponse;

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
      const responseBody = { ok: true, alreadyCompleted: true };
      await completeIdempotentRequest(idempotency.key, 200, responseBody);
      return NextResponse.json(responseBody);
    }

    if (manifestRow.status === "Discrepancies") {
      return NextResponse.json(
        { error: "This manifest is flagged as Discrepancies. Resolve it in Admin before receiving into inventory." },
        { status: 400 }
      );
    }

    // Parts counter during scanning is UI-only; receiving into inventory happens here once verification completes.
    const inventoryApplyError = await applyManifestItemsToInventory(id);
    if (inventoryApplyError) {
      return NextResponse.json({ error: inventoryApplyError }, { status: 500 });
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

    // Cleanup scan event logs for this manifest after successful completion.
    await supabase.from("manifest_scan_events").delete().eq("manifest_id", id);

    const responseBody = { ok: true };
    await completeIdempotentRequest(idempotency.key, 200, responseBody);
    return NextResponse.json(responseBody);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to complete manifest." },
      { status: 500 }
    );
  }
}
