import { NextRequest, NextResponse } from "next/server";
import { requireDemoSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (!["Inventory", "Admin", "SuperAdmin"].includes(auth.session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const token = request.nextUrl.searchParams.get("token")?.trim() ?? "";
  if (!token) {
    return NextResponse.json({ error: "token is required." }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("scanner_access_tokens")
      .select("created_by, used_at, expires_at")
      .eq("token", token)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ used: false, found: false });
    }
    if (String(data.created_by ?? "").toLowerCase() !== auth.session.email.toLowerCase()) {
      return NextResponse.json({ used: false, found: true });
    }
    return NextResponse.json({
      used: Boolean(data.used_at),
      found: true,
      usedAt: data.used_at ?? null,
      expiresAt: data.expires_at ?? null
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to check scanner link status." },
      { status: 500 }
    );
  }
}
