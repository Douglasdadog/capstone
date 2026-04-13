import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.session.role !== "Inventory" && auth.session.role !== "Admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const supabase = createAdminClient();
    const { data: manifest, error: manifestError } = await supabase
      .from("manifests")
      .select("id, file_name, status, created_at")
      .eq("status", "Pending Verification")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (manifestError) {
      return NextResponse.json({ error: manifestError.message }, { status: 500 });
    }

    if (!manifest) {
      return NextResponse.json({ manifest: null, items: [] });
    }

    const { data: items, error: itemsError } = await supabase
      .from("manifest_items")
      .select("id, part_number, quantity, batch_id")
      .eq("manifest_id", manifest.id)
      .order("part_number", { ascending: true });

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    return NextResponse.json({
      manifest,
      items: items ?? []
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to fetch pending manifest." },
      { status: 500 }
    );
  }
}
