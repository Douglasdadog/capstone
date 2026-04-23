import { createHmac, timingSafeEqual } from "crypto";

export function getScannerLinkSigningSecret(): string {
  return (
    process.env.SCANNER_LINK_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "wis-scanner-dev-secret"
  );
}

function signToken(payloadPart: string): string {
  return createHmac("sha256", getScannerLinkSigningSecret()).update(payloadPart).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuf = Buffer.from(left);
  const rightBuf = Buffer.from(right);
  if (leftBuf.length !== rightBuf.length) return false;
  return timingSafeEqual(leftBuf, rightBuf);
}

export type ScannerTokenVerifyResult =
  | { ok: true; email: string }
  | { ok: false; error: string; status: number };

export function verifyScannerLinkToken(token: string): ScannerTokenVerifyResult {
  const [payloadPart, signaturePart] = token.split(".");
  if (!payloadPart || !signaturePart) {
    return { ok: false, error: "Invalid scanner link.", status: 404 };
  }
  const expected = signToken(payloadPart);
  if (!safeEqual(signaturePart, expected)) {
    return { ok: false, error: "Invalid scanner link.", status: 404 };
  }
  try {
    const parsed = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as { exp?: number; email?: string };
    if (typeof parsed.exp !== "number") {
      return { ok: false, error: "Invalid scanner link.", status: 404 };
    }
    if (parsed.exp <= Date.now()) {
      return { ok: false, error: "This scanner link has expired.", status: 410 };
    }
    const email = typeof parsed.email === "string" ? parsed.email.trim().toLowerCase() : "";
    if (!email) {
      return { ok: false, error: "Invalid scanner link.", status: 404 };
    }
    return { ok: true, email };
  } catch {
    return { ok: false, error: "Invalid scanner link.", status: 404 };
  }
}
