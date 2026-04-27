import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { requireDemoSession } from "@/lib/auth/session";

const QR_SESSION_TTL_MS = 6 * 60 * 60 * 1000;

function buildScannerUrl(request: NextRequest, token: string): string {
  return `${request.nextUrl.origin}/scan/${token}`;
}

function getScannerSigningSecret(): string {
  return (
    process.env.SCANNER_LINK_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "wis-scanner-dev-secret"
  );
}

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function signToken(payloadPart: string): string {
  return createHmac("sha256", getScannerSigningSecret()).update(payloadPart).digest("base64url");
}

function createSessionScannerToken(email: string): { token: string; expiresAt: string } {
  const expiresAtMs = Date.now() + QR_SESSION_TTL_MS;
  const payload = JSON.stringify({ email, exp: expiresAtMs });
  const payloadPart = toBase64Url(payload);
  const signaturePart = signToken(payloadPart);
  return {
    token: `${payloadPart}.${signaturePart}`,
    expiresAt: new Date(expiresAtMs).toISOString()
  };
}

export async function GET(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (!["Inventory", "Admin", "SuperAdmin"].includes(auth.session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { token, expiresAt } = createSessionScannerToken(auth.session.email);
  try {
    // Optional persistence so laptop can detect when BYOD QR was consumed.
    const supabaseModule = await import("@/lib/supabase/admin");
    const supabase = supabaseModule.createAdminClient();
    await supabase.from("scanner_access_tokens").insert({
      token,
      created_by: auth.session.email,
      expires_at: expiresAt
    });
  } catch {
    // Non-blocking fallback: token still works via signature validation.
  }

  return NextResponse.json({
    url: buildScannerUrl(request, token),
    expiresAt
  });
}
