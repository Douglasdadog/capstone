import { NextRequest, NextResponse } from "next/server";
import {
  DEMO_MFA_COOKIE,
  DEMO_MFA_PENDING_COOKIE,
  DEMO_SESSION_COOKIE,
  readMfaSecrets,
  serializeMfaSecrets,
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
  let shouldRewriteMfaCookie = false;
  let shouldRewritePendingCookie = false;
  if (supabaseUserId) {
    const supabaseMeta = await getSupabaseMfaMeta(supabaseUserId);
    const hasLegacyCookieSecret = Boolean(mfaMap[normalizedEmail]);
    // Backward compatibility: preserve previously enrolled users whose secret was stored in cookie
    // before Supabase metadata migration. They can verify once and we'll migrate automatically.
    enrolled = Boolean(supabaseMeta.secret || supabaseMeta.enabled || hasLegacyCookieSecret);
    if (!supabaseMeta.secret && hasLegacyCookieSecret) {
      shouldRewriteMfaCookie = false;
    } else if (mfaMap[normalizedEmail]) {
      delete mfaMap[normalizedEmail];
      shouldRewriteMfaCookie = true;
    }
    if (!enrolled && pendingMap[normalizedEmail]) {
      // After admin reset, stale pending setup cookie can incorrectly force OTP step.
      delete pendingMap[normalizedEmail];
      shouldRewritePendingCookie = true;
    }
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

  const response = NextResponse.json({
    enrolled,
    pendingSetup: Boolean(pendingMap[normalizedEmail]),
    mfaVerified: session.mfaVerified,
    recentlyReset
  });

  if (shouldRewriteMfaCookie) {
    response.cookies.set(DEMO_MFA_COOKIE, serializeMfaSecrets(mfaMap), {
      httpOnly: true,
      sameSite: "lax",
      path: "/"
    });
  }
  if (shouldRewritePendingCookie) {
    response.cookies.set(DEMO_MFA_PENDING_COOKIE, serializeMfaSecrets(pendingMap), {
      httpOnly: true,
      sameSite: "lax",
      path: "/"
    });
  }

  return response;
}
