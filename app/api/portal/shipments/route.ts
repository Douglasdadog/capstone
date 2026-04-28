import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";

function normalizeTracking(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function GET(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  if (auth.session.role !== "Client" && auth.session.role !== "SuperAdmin" && auth.session.role !== "Admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  const trackingNumber = (request.nextUrl.searchParams.get("trackingNumber") ?? "").trim();
  if (!trackingNumber) {
    return NextResponse.json({ shipment: null });
  }

  const { data, error } = await supabase
    .from("shipments")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const normalizedInput = normalizeTracking(trackingNumber);
  const shipment = (data ?? []).find((row) => {
    const value =
      row && typeof row === "object" && "tracking_number" in row ? String((row as { tracking_number?: string }).tracking_number ?? "") : "";
    return normalizeTracking(value) === normalizedInput;
  });

  if (!shipment) {
    return NextResponse.json({ error: "Shipment not found." }, { status: 404 });
  }

  return NextResponse.json({ shipment });
}
