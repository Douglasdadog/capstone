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

function buildVerificationEmailTemplate(email: string, code: string) {
  return {
    subject: "Verify Your Email - WIS Account Setup",
    text: [
      "WIS Email Verification",
      "",
      `Hello ${email},`,
      "",
      `Your verification code is: ${code}`,
      "This code expires in 10 minutes.",
      "",
      "If you did not request this code, you can ignore this email.",
      "",
      "WIS Security Team"
    ].join("\n"),
    html: `
      <div style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:16px 24px;background:linear-gradient(90deg,#b91c1c,#f59e0b);color:#ffffff;">
              <div style="font-size:22px;font-weight:800;letter-spacing:0.2px;">imarflex.</div>
              <div style="font-size:12px;opacity:0.95;margin-top:2px;">WIS Account Verification</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <h2 style="margin:0 0 12px 0;font-size:24px;line-height:1.3;color:#111827;">Email Verification Code</h2>
              <p style="margin:0 0 12px 0;font-size:14px;line-height:1.6;color:#334155;">
                Hello <strong>${email}</strong>,
              </p>
              <p style="margin:0 0 14px 0;font-size:14px;line-height:1.6;color:#334155;">
                Use the code below to continue account setup:
              </p>
              <div style="margin:12px 0 16px 0;padding:14px;border:1px solid #fecaca;background:#fef2f2;border-radius:10px;text-align:center;">
                <span style="display:inline-block;font-size:30px;letter-spacing:6px;font-weight:800;color:#b91c1c;">${code}</span>
              </div>
              <p style="margin:0 0 8px 0;font-size:13px;line-height:1.6;color:#475569;">This code expires in <strong>10 minutes</strong>.</p>
              <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;">If you did not request this code, you can safely ignore this email.</p>
            </td>
          </tr>
        </table>
      </div>
    `
  };
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
  const emailTemplate = buildVerificationEmailTemplate(email, code);

  try {
    await sendEmail({
      to: email,
      subject: emailTemplate.subject,
      text: emailTemplate.text,
      html: emailTemplate.html
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
