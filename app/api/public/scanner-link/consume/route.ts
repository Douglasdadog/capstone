import { NextRequest, NextResponse } from "next/server";
import { verifyScannerLinkToken } from "@/lib/auth/scanner-link-token";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { token?: string };
  const token = String(body.token ?? "").trim();
  if (!token) {
    return NextResponse.json({ error: "Token is required." }, { status: 400 });
  }
  const result = verifyScannerLinkToken(token);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  try {
    const supabase = createAdminClient();
    await supabase
      .from("scanner_access_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("token", token)
      .is("used_at", null);
  } catch {
    // Non-blocking: consume still succeeds through signature validation.
  }
  return NextResponse.json({ ok: true });
}
