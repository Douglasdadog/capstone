import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";
import {
  DEMO_EMAIL_VERIFY_COOKIE,
  DEMO_USERS_COOKIE,
  buildRegisteredUser,
  readEmailVerificationCodes,
  readRegisteredUsers,
  serializeEmailVerificationCodes,
  serializeRegisteredUsers
} from "@/lib/auth/demo-auth";
import { UserRole, normalizeRole } from "@/lib/auth/roles";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { sendEmail } from "@/lib/communication/mailer";
import { isStrongPassword, PASSWORD_POLICY_MESSAGE } from "@/lib/security/password-policy";

function buildAccountProvisionedEmailTemplate(input: {
  email: string;
  tempPassword: string;
  role: UserRole;
}) {
  const portalUrl = "https://capstone-teal-psi.vercel.app/login";
  const roleLabel =
    input.role === "SuperAdmin"
      ? "Super Admin"
      : input.role === "Inventory"
        ? "Inventory"
        : input.role;

  return {
    subject: "WIS Account Created - Login Details",
    text: [
      "Warehouse Information System (WIS)",
      "",
      "Your account has been created.",
      `Email: ${input.email}`,
      `Temporary Password: ${input.tempPassword}`,
      `Role: ${roleLabel}`,
      "",
      "Important: Please change your temporary password immediately after your first login.",
      `Login URL: ${portalUrl}`,
      "",
      "If you did not expect this account, please contact your administrator.",
      "",
      "WIS Admin Team"
    ].join("\n"),
    html: `
      <div style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:16px 24px;background:#0f172a;color:#f8fafc;">
              <div style="font-size:22px;font-weight:800;letter-spacing:0.2px;">Warehouse Information System</div>
              <div style="font-size:12px;opacity:0.95;margin-top:2px;">Account Provisioning</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <h2 style="margin:0 0 10px 0;font-size:24px;color:#111827;">Your account is ready</h2>
              <p style="margin:0 0 14px 0;font-size:14px;color:#334155;">
                Your WIS account has been created. Use the details below to sign in.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin:12px 0;background:#f8fafc;border:1px solid #e2e8f0;">
                <tr>
                  <td style="padding:8px 10px;font-weight:700;color:#334155;width:170px;">Email</td>
                  <td style="padding:8px 10px;color:#111827;">${input.email}</td>
                </tr>
                <tr>
                  <td style="padding:8px 10px;font-weight:700;color:#334155;">Temporary Password</td>
                  <td style="padding:8px 10px;color:#111827;"><strong>${input.tempPassword}</strong></td>
                </tr>
                <tr>
                  <td style="padding:8px 10px;font-weight:700;color:#334155;">Role</td>
                  <td style="padding:8px 10px;color:#111827;">${roleLabel}</td>
                </tr>
              </table>
              <div style="margin:12px 0;padding:10px 12px;border:1px solid #fecaca;background:#fff1f2;border-radius:10px;">
                <p style="margin:0;font-size:13px;color:#9f1239;">
                  Security reminder: Change your temporary password immediately after your first login.
                </p>
              </div>
              <p style="margin:0 0 10px 0;font-size:13px;color:#334155;">
                Login URL: <a href="${portalUrl}" style="color:#0f172a;font-weight:700;">${portalUrl}</a>
              </p>
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

  const rateLimited = enforceRateLimit(request, "admin-create-user", 20, 60_000);
  if (rateLimited) return rateLimited;

  const body = (await request.json()) as {
    email?: string;
    password?: string;
    role?: UserRole;
    verificationCode?: string;
  };
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const role = normalizeRole(body.role);
  const verificationCode = String(body.verificationCode ?? "").trim();

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }
  if (email.length > 190 || password.length > 128) {
    return NextResponse.json({ error: "Input exceeds allowed length." }, { status: 400 });
  }
  if (!isStrongPassword(password)) {
    return NextResponse.json({ error: PASSWORD_POLICY_MESSAGE }, { status: 400 });
  }
  if (!verificationCode) {
    return NextResponse.json({ error: "Verification code is required." }, { status: 400 });
  }

  const verificationCodes = readEmailVerificationCodes(
    request.cookies.get(DEMO_EMAIL_VERIFY_COOKIE)?.value
  );
  const verificationEntry = verificationCodes[email];
  if (!verificationEntry) {
    return NextResponse.json({ error: "No verification code found for this email." }, { status: 400 });
  }
  if (Date.now() > verificationEntry.expiresAt) {
    return NextResponse.json({ error: "Verification code expired. Send a new code." }, { status: 400 });
  }
  if (verificationEntry.code !== verificationCode) {
    return NextResponse.json({ error: "Invalid verification code." }, { status: 400 });
  }

  const existing = readRegisteredUsers(request.cookies.get(DEMO_USERS_COOKIE)?.value);
  if (existing.some((user) => user.email === email)) {
    return NextResponse.json({ error: "User already exists in local registry." }, { status: 409 });
  }

  try {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role }
    });
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("already") || msg.includes("exists")) {
        return NextResponse.json({ error: "User already exists in Supabase." }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const updatedUsers = [...existing, buildRegisteredUser(email, password, role)];
    delete verificationCodes[email];
    let communication: { sent: boolean; message: string } | null = null;
    try {
      const emailTemplate = buildAccountProvisionedEmailTemplate({
        email,
        tempPassword: password,
        role
      });
      await sendEmail({
        to: email,
        subject: emailTemplate.subject,
        text: emailTemplate.text,
        html: emailTemplate.html
      });
      communication = { sent: true, message: "Account details sent to the user email." };
    } catch (emailError) {
      communication = {
        sent: false,
        message: emailError instanceof Error ? emailError.message : "Failed to send account details email."
      };
    }

    const response = NextResponse.json({ ok: true, communication });
    response.cookies.set(DEMO_USERS_COOKIE, serializeRegisteredUsers(updatedUsers), {
      httpOnly: true,
      sameSite: "lax",
      path: "/"
    });
    response.cookies.set(DEMO_EMAIL_VERIFY_COOKIE, serializeEmailVerificationCodes(verificationCodes), {
      httpOnly: true,
      sameSite: "lax",
      path: "/"
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create user." },
      { status: 500 }
    );
  }
}
