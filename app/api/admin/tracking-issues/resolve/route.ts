import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";

function isMissingColumnError(message: string, column: string): boolean {
  const escaped = column.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`column\\s+['"]?${escaped}['"]?\\s+does not exist`, "i"),
    new RegExp(`Could not find the ['"]${escaped}['"] column`, "i")
  ];
  return patterns.some((pattern) => pattern.test(message));
}

export async function POST(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.session.role !== "Admin" && auth.session.role !== "SuperAdmin" && auth.session.role !== "Sales") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const issueId =
    typeof raw === "object" && raw !== null && "issueId" in raw
      ? Number((raw as { issueId: unknown }).issueId)
      : NaN;
  if (!Number.isFinite(issueId) || issueId < 1) {
    return NextResponse.json({ error: "Invalid issue id." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const candidates: Array<Record<string, unknown>> = [
    {
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolved_by: auth.session.email
    },
    {
      status: "resolved",
      resolved_at: new Date().toISOString()
    },
    {
      status: "resolved"
    }
  ];

  let lastColumnError: string | null = null;
  for (const payload of candidates) {
    const updateResult = await supabase.from("tracking_issues").update(payload).eq("id", issueId);
    if (!updateResult.error) {
      return NextResponse.json({ ok: true });
    }
    const message = updateResult.error.message;
    const hasMissingColumn = Object.keys(payload).some((column) => isMissingColumnError(message, column));
    if (!hasMissingColumn) {
      return NextResponse.json({ error: message }, { status: 500 });
    }
    lastColumnError = message;
  }

  return NextResponse.json(
    {
      error:
        lastColumnError ??
        "Unable to mark as resolved because required resolution columns are missing. Run the logistics SQL migration."
    },
    { status: 409 }
  );
}
