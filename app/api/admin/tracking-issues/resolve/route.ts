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
  const updateResult = await supabase
    .from("tracking_issues")
    .update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolved_by: auth.session.email
    })
    .eq("id", issueId);

  if (
    updateResult.error &&
    !isMissingColumnError(updateResult.error.message, "status") &&
    !isMissingColumnError(updateResult.error.message, "resolved_at") &&
    !isMissingColumnError(updateResult.error.message, "resolved_by")
  ) {
    return NextResponse.json({ error: updateResult.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
