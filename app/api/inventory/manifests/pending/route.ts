import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.session.role !== "Inventory" && auth.session.role !== "Admin" && auth.session.role !== "SuperAdmin") {
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

    let scanCounts: Record<string, number> = {};
    const { data: scanEvents, error: scanError } = await supabase
      .from("manifest_scan_events")
      .select("serial_id")
      .eq("manifest_id", manifest.id);
    if (scanError) {
      const missingTable = scanError.message.toLowerCase().includes("manifest_scan_events");
      if (!missingTable) {
        return NextResponse.json({ error: scanError.message }, { status: 500 });
      }
    } else {
      scanCounts = (scanEvents ?? []).reduce(
        (acc, row) => {
          const serial = String(row.serial_id ?? "").trim();
          if (!serial) return acc;
          acc[serial] = (acc[serial] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );
    }

    return NextResponse.json({
      manifest,
      items: items ?? [],
      scanCounts
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to fetch pending manifest." },
      { status: 500 }
    );
  }
}
