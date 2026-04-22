import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";
import { sendEmail } from "@/lib/communication/mailer";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import {
  DEMO_MFA_COOKIE,
  DEMO_MFA_PENDING_COOKIE,
  readMfaSecrets,
  serializeMfaSecrets
} from "@/lib/auth/demo-auth";

type SecurityRequestRow = {
  id: number;
  user_name?: string | null;
  email: string;
  role: string;
  status: string;
  created_at: string;
  supabase_user_id?: string | null;
};

function buildMfaResetEmailTemplate(userEmail: string) {
  return {
    subject: "MFA Reset Confirmation - WIS Security",
    text: [
      "MFA Reset Processed",
      "",
      `Hello ${userEmail},`,
      "",
      "Your multi-factor authentication (MFA) was reset by a Super Admin.",
      "For security, you must configure a new authenticator device at your next login.",
      "",
      "If you did not request this action, contact your administrator immediately.",
      "",
      "WIS Security Team"
    ].join("\n"),
    html: `
      <div style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:16px 24px;background:linear-gradient(90deg,#b91c1c,#f59e0b);color:#ffffff;">
              <div style="font-size:22px;font-weight:800;letter-spacing:0.2px;">imarflex.</div>
              <div style="font-size:12px;opacity:0.95;margin-top:2px;">WIS Security Notification</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <h2 style="margin:0 0 12px 0;font-size:24px;line-height:1.3;color:#111827;">MFA Reset Processed</h2>
              <p style="margin:0 0 12px 0;font-size:14px;line-height:1.6;color:#334155;">Hello <strong>${userEmail}</strong>,</p>
              <p style="margin:0 0 12px 0;font-size:14px;line-height:1.6;color:#334155;">
                Your multi-factor authentication (MFA) has been reset by a Super Admin.
              </p>
              <div style="margin:16px 0;padding:14px;border:1px solid #fde68a;background:#fffbeb;border-radius:10px;">
                <p style="margin:0;font-size:13px;line-height:1.6;color:#92400e;">
                  For security, you will be prompted to set up a new authenticator device on your next login.
                </p>
              </div>
              <p style="margin:0 0 8px 0;font-size:13px;line-height:1.6;color:#475569;">
                If you did not request this action, contact your administrator immediately.
              </p>
              <p style="margin:18px 0 0 0;font-size:12px;color:#64748b;">WIS Security Team</p>
            </td>
          </tr>
        </table>
      </div>
    `
  };
}

async function resolveSupabaseUserId(supabase: ReturnType<typeof createAdminClient>, request: SecurityRequestRow) {
  if (request.supabase_user_id) return request.supabase_user_id;

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200
    });
    if (error) throw new Error(error.message);
    const found = data.users.find((user) => user.email?.toLowerCase() === request.email.toLowerCase());
    if (found?.id) return found.id;
    if (!data.users.length) break;
  }
  return null;
}

export async function POST(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.session.role !== "SuperAdmin") {
    return NextResponse.json({ error: "Super Admin access required." }, { status: 403 });
  }

  const rateLimited = enforceRateLimit(request, "super-admin-approve-mfa-reset", 20, 60_000);
  if (rateLimited) return rateLimited;

  const body = (await request.json()) as { requestId?: number; reason?: string; confirmationText?: string };
  const requestId = Number(body.requestId);
  const reason = String(body.reason ?? "").trim();
  const confirmationText = String(body.confirmationText ?? "").trim();
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return NextResponse.json({ error: "Valid requestId is required." }, { status: 400 });
  }
  if (confirmationText !== "APPROVE") {
    return NextResponse.json({ error: "Confirmation text must be APPROVE." }, { status: 400 });
  }
  if (reason.length < 8 || reason.length > 240) {
    return NextResponse.json(
      { error: "Reason is required (8-240 characters)." },
      { status: 400 }
    );
  }

  try {
    const supabase = createAdminClient();
    const { data: resetRequest, error: fetchError } = await supabase
      .from("mfa_reset_requests")
      .select("id, user_name, email, role, status, created_at, supabase_user_id")
      .eq("id", requestId)
      .eq("status", "Pending")
      .single();

    if (fetchError || !resetRequest) {
      return NextResponse.json({ error: "Security request not found." }, { status: 404 });
    }

    const requestRow = resetRequest as SecurityRequestRow;
    let emailWarning: string | null = null;
    const emailTemplate = buildMfaResetEmailTemplate(requestRow.email);

    const supabaseUserId = await resolveSupabaseUserId(supabase, requestRow);
    let resetMode: "supabase-user" | "demo-local" = "demo-local";

    if (supabaseUserId) {
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(supabaseUserId);
      if (userError || !userData.user) {
        return NextResponse.json({ error: userError?.message ?? "User not found." }, { status: 404 });
      }

      const currentMetadata = (userData.user.user_metadata ?? {}) as Record<string, unknown>;
      const { error: updateUserError } = await supabase.auth.admin.updateUserById(supabaseUserId, {
        user_metadata: {
          ...currentMetadata,
          mfa_enabled: false,
          mfa_secret: null
        }
      });
      if (updateUserError) {
        return NextResponse.json({ error: updateUserError.message }, { status: 500 });
      }
      resetMode = "supabase-user";
    }

    try {
      await sendEmail({
        to: requestRow.email,
        subject: emailTemplate.subject,
        text: emailTemplate.text,
        html: emailTemplate.html
      });
    } catch (err) {
      emailWarning = err instanceof Error ? err.message : "Unable to send email notification.";
    }

    const { data: inventoryRef, error: inventoryError } = await supabase
      .from("inventory")
      .select("id, name, quantity, threshold_limit")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (inventoryError || !inventoryRef) {
      return NextResponse.json(
        { error: "MFA reset processed, but audit log could not be recorded because no inventory reference was found." },
        { status: 500 }
      );
    }

    const auditMessage =
      resetMode === "supabase-user"
        ? `MFA reset approved for ${requestRow.email} by ${auth.session.email}. Reason: ${reason}`
        : `MFA reset approved for ${requestRow.email} by ${auth.session.email}. Reason: ${reason} (Demo/local account: no Supabase user record found.)`;
    const auditMessageWithEmail = emailWarning
      ? `${auditMessage} Email warning: ${emailWarning}`
      : auditMessage;
    const { error: auditError } = await supabase.from("auto_replenishment_alerts").insert({
      inventory_id: inventoryRef.id,
      item_name: inventoryRef.name,
      reading_quantity: Number(inventoryRef.quantity ?? 0),
      threshold_limit: Number(inventoryRef.threshold_limit ?? 0),
      status: "Success",
      message: auditMessageWithEmail
    });
    if (auditError) {
      return NextResponse.json(
        { error: `MFA reset processed, but audit log insert failed: ${auditError.message}` },
        { status: 500 }
      );
    }

    const { error: deleteError } = await supabase
      .from("mfa_reset_requests")
      .delete()
      .eq("id", requestId);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    const response = NextResponse.json({ ok: true, emailWarning });
    if (resetMode === "demo-local") {
      const normalizedEmail = requestRow.email.toLowerCase();
      const persistedMfa = readMfaSecrets(request.cookies.get(DEMO_MFA_COOKIE)?.value);
      const pendingMfa = readMfaSecrets(request.cookies.get(DEMO_MFA_PENDING_COOKIE)?.value);

      delete persistedMfa[normalizedEmail];
      delete pendingMfa[normalizedEmail];

      response.cookies.set(DEMO_MFA_COOKIE, serializeMfaSecrets(persistedMfa), {
        httpOnly: true,
        sameSite: "lax",
        path: "/"
      });
      response.cookies.set(DEMO_MFA_PENDING_COOKIE, serializeMfaSecrets(pendingMfa), {
        httpOnly: true,
        sameSite: "lax",
        path: "/"
      });
    }

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to process MFA reset request." },
      { status: 500 }
    );
  }
}
