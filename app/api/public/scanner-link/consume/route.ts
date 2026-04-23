import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

function makeToken(): string {
  return randomUUID().replace(/-/g, "");
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { token?: string };
  const token = String(body.token ?? "").trim();
  if (!token) {
    return NextResponse.json({ error: "Token is required." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const { data: row, error: readError } = await supabase
    .from("scanner_access_tokens")
    .select("id, used_at, expires_at")
    .eq("token", token)
    .maybeSingle<{ id: string; used_at: string | null; expires_at: string }>();

  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Invalid scanner link." }, { status: 404 });
  if (row.used_at) return NextResponse.json({ error: "This scanner link was already used." }, { status: 410 });
  if (new Date(row.expires_at).getTime() <= now.getTime()) {
    return NextResponse.json({ error: "This scanner link has expired." }, { status: 410 });
  }

  const { error: markError } = await supabase
    .from("scanner_access_tokens")
    .update({ used_at: nowIso })
    .eq("id", row.id)
    .is("used_at", null);
  if (markError) return NextResponse.json({ error: markError.message }, { status: 500 });

  const nextToken = makeToken();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const { error: createNextError } = await supabase
    .from("scanner_access_tokens")
    .insert({ token: nextToken, expires_at: expiresAt, created_by: "public-consume" });
  if (createNextError) return NextResponse.json({ error: createNextError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
