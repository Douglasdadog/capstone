import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEMO_SESSION_COOKIE, readSession } from "@/lib/auth/demo-auth";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export async function POST(request: NextRequest) {
  const rateLimited = enforceRateLimit(request, "auth-mfa-reset-request", 3, 60_000);
  if (rateLimited) return rateLimited;

  const session = readSession(request.cookies.get(DEMO_SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("mfa_reset_requests").insert({
      user_name: session.email.split("@")[0],
      email: session.email,
      supabase_user_id: session.supabaseUserId ?? null,
      role: session.role,
      status: "Pending"
    });

    if (error) {
      return NextResponse.json(
        {
          error:
            "Unable to save request. Ensure table `mfa_reset_requests` exists (email, role, status, created_at).",
          details: error.message
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to submit MFA reset request." },
      { status: 500 }
    );
  }
}
