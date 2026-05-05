import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";
import { writeActivityLog } from "@/lib/audit/activity-log";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function POST(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.session.role !== "Client" && auth.session.role !== "SuperAdmin" && auth.session.role !== "Admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const shipmentId = String(formData.get("shipmentId") ?? "").trim();
  const file = formData.get("paymentProof");
  if (!shipmentId) return NextResponse.json({ error: "shipmentId is required." }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "paymentProof file is required." }, { status: 400 });
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Only PNG, JPG, and WEBP images are allowed." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File exceeds 5MB limit." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: shipment, error: shipmentError } = await supabase
    .from("shipments")
    .select("id, tracking_number, client_email")
    .eq("id", shipmentId)
    .single();
  if (shipmentError || !shipment) {
    return NextResponse.json({ error: shipmentError?.message ?? "Shipment not found." }, { status: 404 });
  }
  if (auth.session.role === "Client" && shipment.client_email.toLowerCase() !== auth.session.email.toLowerCase()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const objectPath = `${shipment.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const bucket = process.env.WIS_PAYMENT_PROOF_BUCKET?.trim() || "payment-proofs";
  const upload = await supabase.storage.from(bucket).upload(objectPath, bytes, {
    contentType: file.type,
    upsert: false
  });
  if (upload.error) {
    return NextResponse.json({ error: `Upload failed: ${upload.error.message}` }, { status: 500 });
  }
  const publicUrl = supabase.storage.from(bucket).getPublicUrl(objectPath).data.publicUrl;

  const nowIso = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("shipments")
    .update({
      payment_proof_url: publicUrl,
      payment_proof_uploaded_at: nowIso,
      payment_status: "Submitted",
      updated_at: nowIso
    })
    .eq("id", shipment.id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await writeActivityLog(request, {
    actorEmail: auth.session.email,
    actorRole: auth.session.role,
    action: "client.upload_payment_proof",
    targetModule: "client-portal",
    targetId: shipment.id,
    details: { tracking_number: shipment.tracking_number }
  });

  return NextResponse.json({
    ok: true,
    paymentProofUrl: publicUrl
  });
}
