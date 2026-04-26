import { NextRequest, NextResponse } from "next/server";
import {
  DEMO_MFA_COOKIE,
  DEMO_MFA_PENDING_COOKIE,
  DEMO_SESSION_COOKIE,
  readMfaSecrets,
  readSession
} from "@/lib/auth/demo-auth";
import { getSupabaseMfaMeta, resolveSupabaseUserIdByEmail } from "@/lib/auth/mfa";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const session = readSession(request.cookies.get(DEMO_SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const normalizedEmail = session.email.toLowerCase();
  const mfaMap = readMfaSecrets(request.cookies.get(DEMO_MFA_COOKIE)?.value);
  const pendingMap = readMfaSecrets(request.cookies.get(DEMO_MFA_PENDING_COOKIE)?.value);
  const supabaseUserId = session.supabaseUserId ?? (await resolveSupabaseUserIdByEmail(normalizedEmail));
  let enrolled = false;
  if (supabaseUserId) {
    const supabaseMeta = await getSupabaseMfaMeta(supabaseUserId);
    enrolled = Boolean(supabaseMeta.secret || supabaseMeta.enabled || mfaMap[normalizedEmail]);
  } else {
    enrolled = Boolean(mfaMap[normalizedEmail]);
  }

  let recentlyReset = false;
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("mfa_reset_requests")
      .select("id")
      .eq("email", normalizedEmail)
      .eq("status", "Approved")
      .limit(1);
    recentlyReset = Boolean(data && data.length > 0);
  } catch {
    recentlyReset = false;
  }

  return NextResponse.json({
    enrolled,
    pendingSetup: Boolean(pendingMap[normalizedEmail]),
    mfaVerified: session.mfaVerified,
    recentlyReset
  });
}
