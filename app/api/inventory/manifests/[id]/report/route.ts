import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";

const validReasons = new Set([
  "Short Shipment",
  "Damaged on Arrival",
  "Mismatched Part",
  "Over-shipment"
]);

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.session.role !== "Inventory" && auth.session.role !== "Admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "Manifest id is required." }, { status: 400 });

  const body = (await request.json()) as {
    reason?: string;
    comments?: string;
  };
  const reason = String(body.reason ?? "").trim();
  const comments = String(body.comments ?? "").trim();

  if (!validReasons.has(reason)) {
    return NextResponse.json({ error: "Invalid discrepancy reason." }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    const { error: reportError } = await supabase.from("manifest_reports").insert({
      manifest_id: id,
      reported_by: auth.session.email,
      reason,
      comments: comments || null
    });
    if (reportError) {
      return NextResponse.json({ error: reportError.message }, { status: 500 });
    }

    const statusNote = comments ? `${reason}: ${comments}` : reason;
    const { error: manifestError } = await supabase
      .from("manifests")
      .update({
        status: "Discrepancies",
        discrepancy_notes: statusNote,
        updated_at: new Date().toISOString()
      })
      .eq("id", id);

    if (manifestError) {
      return NextResponse.json({ error: manifestError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to submit report." },
      { status: 500 }
    );
  }
}
