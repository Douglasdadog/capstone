import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireDemoSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

type ScannerTokenRow = {
  token: string;
  expires_at: string;
};

function buildScannerUrl(request: NextRequest, token: string): string {
  return `${request.nextUrl.origin}/scan/${token}`;
}

function makeToken(): string {
  return randomUUID().replace(/-/g, "");
}

export async function GET(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (!["Inventory", "Admin", "SuperAdmin"].includes(auth.session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: existing, error: existingError } = await supabase
    .from("scanner_access_tokens")
    .select("token, expires_at")
    .is("used_at", null)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<ScannerTokenRow>();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  if (existing?.token) {
    return NextResponse.json({
      url: buildScannerUrl(request, existing.token),
      expiresAt: existing.expires_at
    });
  }

  const token = makeToken();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const { error: insertError } = await supabase.from("scanner_access_tokens").insert({
    token,
    created_by: auth.session.email,
    expires_at: expiresAt
  });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    url: buildScannerUrl(request, token),
    expiresAt
  });
}
