import { NextRequest, NextResponse } from "next/server";
import { requireDemoSession } from "@/lib/auth/session";
import {
  DEMO_EMAIL_VERIFY_COOKIE,
  readEmailVerificationCodes,
  serializeEmailVerificationCodes
} from "@/lib/auth/demo-auth";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { sendEmail } from "@/lib/communication/mailer";

function makeCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.session.role !== "SuperAdmin") {
    return NextResponse.json({ error: "Super Admin access required." }, { status: 403 });
  }

  const rateLimited = enforceRateLimit(request, "admin-send-email-code", 10, 60_000);
  if (rateLimited) return rateLimited;

  const body = (await request.json()) as { email?: string };
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
  }

  const code = makeCode();
  const expiresAt = Date.now() + 10 * 60 * 1000;

  try {
    await sendEmail({
      to: email,
      subject: "Your account verification code",
      text: `Your verification code is ${code}. This code expires in 10 minutes.`,
      html: `<div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
        <h2 style="margin-bottom: 8px;">Email verification code</h2>
        <p>Your verification code is:</p>
        <p style="font-size: 24px; font-weight: 700; letter-spacing: 2px;">${code}</p>
        <p>This code expires in 10 minutes.</p>
      </div>`
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to send verification code." },
      { status: 500 }
    );
  }

  const existing = readEmailVerificationCodes(request.cookies.get(DEMO_EMAIL_VERIFY_COOKIE)?.value);
  existing[email] = { code, expiresAt };

  const response = NextResponse.json({ ok: true });
  response.cookies.set(DEMO_EMAIL_VERIFY_COOKIE, serializeEmailVerificationCodes(existing), {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });
  return response;
}
