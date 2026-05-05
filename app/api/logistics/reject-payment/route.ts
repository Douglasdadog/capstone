import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";
import { writeActivityLog } from "@/lib/audit/activity-log";

export async function POST(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  const canReject = auth.session.role === "SuperAdmin" || auth.session.role === "Admin" || auth.session.role === "Sales";
  if (!canReject) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { shipmentId, reason } = (await request.json()) as { shipmentId?: string; reason?: string };
  if (!shipmentId || !shipmentId.trim()) {
    return NextResponse.json({ error: "shipmentId is required." }, { status: 400 });
  }
  const rejectionReason = (reason ?? "").trim();
  if (rejectionReason.length < 4) {
    return NextResponse.json({ error: "Please provide a short rejection reason." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("shipments")
    .update({
      payment_status: "Rejected",
      payment_rejected_at: nowIso,
      payment_rejection_reason: rejectionReason,
      status: "Pending",
      milestone_status: "Pending",
      updated_at: nowIso
    })
    .eq("id", shipmentId.trim())
    .select("id, tracking_number, payment_status, payment_rejection_reason, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeActivityLog(request, {
    actorEmail: auth.session.email,
    actorRole: auth.session.role,
    action: "sales.reject_payment_proof",
    targetModule: "logistics",
    targetId: shipmentId.trim(),
    details: { reason: rejectionReason, tracking_number: updated.tracking_number }
  });

  return NextResponse.json({ ok: true, shipment: updated });
}
