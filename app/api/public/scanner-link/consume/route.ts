import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

function getScannerSigningSecret(): string {
  return (
    process.env.SCANNER_LINK_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "wis-scanner-dev-secret"
  );
}

function safeEqual(left: string, right: string): boolean {
  const leftBuf = Buffer.from(left);
  const rightBuf = Buffer.from(right);
  if (leftBuf.length !== rightBuf.length) return false;
  return timingSafeEqual(leftBuf, rightBuf);
}

function verifySignedToken(token: string): { valid: boolean; expired: boolean } {
  const [payloadPart, signaturePart] = token.split(".");
  if (!payloadPart || !signaturePart) {
    return { valid: false, expired: false };
  }
  const expected = createHmac("sha256", getScannerSigningSecret()).update(payloadPart).digest("base64url");
  if (!safeEqual(signaturePart, expected)) {
    return { valid: false, expired: false };
  }
  try {
    const parsed = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as { exp?: number };
    if (typeof parsed.exp !== "number") return { valid: false, expired: false };
    return { valid: true, expired: parsed.exp <= Date.now() };
  } catch {
    return { valid: false, expired: false };
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { token?: string };
  const token = String(body.token ?? "").trim();
  if (!token) {
    return NextResponse.json({ error: "Token is required." }, { status: 400 });
  }
  const result = verifySignedToken(token);
  if (!result.valid) return NextResponse.json({ error: "Invalid scanner link." }, { status: 404 });
  if (result.expired) return NextResponse.json({ error: "This scanner link has expired." }, { status: 410 });
  return NextResponse.json({ ok: true });
}
