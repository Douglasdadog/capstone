import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";

type TrackingIssueRow = {
  id: number;
  shipment_id: string;
  issue_type: string;
  message: string | null;
  contact_email: string | null;
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
    const { data, error } = await supabase
      .from("tracking_issues")
      .select(
        "id, shipment_id, issue_type, message, contact_email, created_at, shipments(tracking_number, client_name, client_email, destination)"
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const issues: TrackingIssueRow[] = (data ?? []).map((row) => {
      const shipment = Array.isArray(row.shipments) ? row.shipments[0] : row.shipments;
      return {
        id: Number(row.id),
        shipment_id: String(row.shipment_id),
        issue_type: String(row.issue_type),
        message: row.message ? String(row.message) : null,
        contact_email: row.contact_email ? String(row.contact_email) : null,
        created_at: String(row.created_at),
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
