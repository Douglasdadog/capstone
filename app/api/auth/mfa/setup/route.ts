import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import {
  DEMO_MFA_PENDING_COOKIE,
  DEMO_SESSION_COOKIE,
  readMfaSecrets,
  readSession,
  serializeMfaSecrets
} from "@/lib/auth/demo-auth";
import { generateTotpSecret } from "@/lib/auth/mfa";

export async function POST(request: NextRequest) {
  const session = readSession(request.cookies.get(DEMO_SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { secret, otpauthUrl } = generateTotpSecret(session.email);
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

  const pending = readMfaSecrets(request.cookies.get(DEMO_MFA_PENDING_COOKIE)?.value);
  pending[session.email.toLowerCase()] = secret;

  const response = NextResponse.json({
    qrDataUrl,
    setupKey: secret
  });
  response.cookies.set(DEMO_MFA_PENDING_COOKIE, serializeMfaSecrets(pending), {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });
  return response;
}
