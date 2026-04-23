import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const canDelete =
    auth.session.role === "SuperAdmin" || auth.session.role === "Admin" || auth.session.role === "Sales";
  if (!canDelete) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as { shipmentId?: string };
  const shipmentId = typeof body.shipmentId === "string" ? body.shipmentId.trim() : "";
  if (!shipmentId) {
    return NextResponse.json({ error: "shipmentId is required." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from("shipments")
    .select("id")
    .eq("id", shipmentId)
    .maybeSingle();
  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Shipment not found." }, { status: 404 });
  }

  const { error: deleteError } = await supabase.from("shipments").delete().eq("id", shipmentId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
