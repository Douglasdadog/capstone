import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";

type TrackingIssueRow = {
  id: number;
  shipment_id: string;
  issue_type: string;
  message: string | null;
  contact_email: string | null;
  status: "open" | "resolved";
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  tracking_number: string | null;
  client_name: string | null;
  client_email: string | null;
  destination: string | null;
};

export async function GET(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.session.role !== "Admin" && auth.session.role !== "SuperAdmin" && auth.session.role !== "Sales") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const supabase = createAdminClient();
    let data: unknown[] | null = null;
    let error: { message: string } | null = null;
    const detailedQuery = await supabase
      .from("tracking_issues")
      .select(
        "id, shipment_id, issue_type, message, contact_email, status, resolved_at, resolved_by, created_at, shipments(tracking_number, client_name, client_email, destination)"
      )
      .order("created_at", { ascending: false })
      .limit(200);
    data = (detailedQuery.data as unknown[]) ?? null;
    error = detailedQuery.error ? { message: detailedQuery.error.message } : null;

    if (error && /column .* does not exist/i.test(error.message)) {
      const legacyQuery = await supabase
        .from("tracking_issues")
        .select("id, shipment_id, issue_type, message, contact_email, created_at, shipments(tracking_number, client_name, client_email, destination)")
        .order("created_at", { ascending: false })
        .limit(200);
      data = (legacyQuery.data as unknown[]) ?? null;
      error = legacyQuery.error ? { message: legacyQuery.error.message } : null;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const issues: TrackingIssueRow[] = (data ?? []).map((row) => {
      const rowObj = (row ?? {}) as Record<string, unknown>;
      const shipment = Array.isArray(rowObj.shipments) ? rowObj.shipments[0] : rowObj.shipments;
      return {
        id: Number(rowObj.id),
        shipment_id: String(rowObj.shipment_id),
        issue_type: String(rowObj.issue_type),
        message: rowObj.message ? String(rowObj.message) : null,
        contact_email: rowObj.contact_email ? String(rowObj.contact_email) : null,
        status: rowObj.status === "resolved" ? "resolved" : "open",
        resolved_at: typeof rowObj.resolved_at === "string" ? rowObj.resolved_at : null,
        resolved_by: typeof rowObj.resolved_by === "string" ? rowObj.resolved_by : null,
        created_at: String(rowObj.created_at),
        tracking_number:
          shipment && typeof shipment === "object" && "tracking_number" in shipment
            ? String((shipment as { tracking_number?: string | null }).tracking_number ?? "")
            : null,
        client_name:
          shipment && typeof shipment === "object" && "client_name" in shipment
            ? String((shipment as { client_name?: string | null }).client_name ?? "")
            : null,
        client_email:
          shipment && typeof shipment === "object" && "client_email" in shipment
            ? String((shipment as { client_email?: string | null }).client_email ?? "")
            : null,
        destination:
          shipment && typeof shipment === "object" && "destination" in shipment
            ? String((shipment as { destination?: string | null }).destination ?? "")
            : null
      };
    });

    return NextResponse.json({ issues });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load tracking issues." },
      { status: 500 }
    );
  }
}
