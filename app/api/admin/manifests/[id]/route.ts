import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";

const allowedStatuses = new Set(["Pending Verification", "Completed", "Discrepancies"]);

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.session.role !== "Admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "Manifest id is required." }, { status: 400 });

  const body = (await request.json()) as { status?: string; discrepancy_notes?: string };
  const status = String(body.status ?? "");
  if (!allowedStatuses.has(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("manifests")
      .update({
        status,
        discrepancy_notes: body.discrepancy_notes?.trim() || null,
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
