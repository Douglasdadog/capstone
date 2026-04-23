import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";
import { applyManifestItemsToInventory } from "@/lib/inventory/apply-manifest-to-inventory";

const allowedStatuses = new Set(["Pending Verification", "Completed", "Discrepancies"]);

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.session.role !== "Admin" && auth.session.role !== "SuperAdmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "Manifest id is required." }, { status: 400 });

  const body = (await request.json()) as {
    status?: string;
    discrepancy_notes?: string;
    discrepancy_reason?: string;
    discrepancy_comments?: string;
  };
  const status = String(body.status ?? "");
  if (!allowedStatuses.has(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }
  const discrepancyReason = String(body.discrepancy_reason ?? "").trim();
  const discrepancyComments = String(body.discrepancy_comments ?? "").trim();
  const explicitNotes = String(body.discrepancy_notes ?? "").trim();
  const discrepancyNotes =
    explicitNotes || (discrepancyReason ? `${discrepancyReason}${discrepancyComments ? `: ${discrepancyComments}` : ""}` : "");

  if (status === "Discrepancies" && (!discrepancyReason || !discrepancyComments)) {
    return NextResponse.json(
      { error: "discrepancy_reason and discrepancy_comments are required for Discrepancies status." },
      { status: 400 }
    );
  }
  if (status === "Discrepancies" && discrepancyNotes.length === 0) {
    return NextResponse.json({ error: "discrepancy_notes is required for Discrepancies status." }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    const { data: currentManifest, error: currentManifestError } = await supabase
      .from("manifests")
      .select("id, status")
      .eq("id", id)
      .single();

    if (currentManifestError || !currentManifest) {
      return NextResponse.json({ error: currentManifestError?.message ?? "Manifest not found." }, { status: 404 });
    }

    if (status === "Completed" && currentManifest.status !== "Completed") {
      const inventoryApplyError = await applyManifestItemsToInventory(id);
      if (inventoryApplyError) {
        return NextResponse.json({ error: inventoryApplyError }, { status: 500 });
      }
    }

    const { data, error } = await supabase
      .from("manifests")
      .update({
        status,
        discrepancy_notes: status === "Discrepancies" ? discrepancyNotes : null,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .select("id, file_name, uploaded_by, status, discrepancy_notes, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ manifest: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update manifest." },
      { status: 500 }
    );
  }
}
