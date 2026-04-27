import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";
import { sendEmail } from "@/lib/communication/mailer";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { beginIdempotentRequest, completeIdempotentRequest } from "@/lib/api/idempotency";

type SecurityRequestRow = {
  id: number;
  user_name?: string | null;
  email: string;
  role: string;
  status: string;
  created_at: string;
  supabase_user_id?: string | null;
};

function buildMfaResetDeniedEmailTemplate(input: {
  userEmail: string;
  userName?: string | null;
  deniedBy: string;
  reason: string;
}) {
  const greeting = input.userName?.trim() ? input.userName.trim() : input.userEmail;
  return {
    subject: "MFA Reset Request Update - Action Required",
    text: [
      "Warehouse Information System (WIS)",
      "",
      `Hello ${greeting},`,
      "",
      "Your request to reset Multi-Factor Authentication (MFA) was reviewed and has been denied at this time.",
      "",
      `Reviewed by: ${input.deniedBy}`,
      `Reason: ${input.reason}`,
      "",
      "If you still need assistance, please contact your Super Admin and provide additional verification details.",
      "",
      "WIS Security Team"
    ].join("\n"),
    html: `
      <div style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:16px 24px;background:linear-gradient(90deg,#0f172a,#334155);color:#ffffff;">
              <div style="font-size:22px;font-weight:800;letter-spacing:0.2px;">imarflex.</div>
              <div style="font-size:12px;opacity:0.95;margin-top:2px;">WIS Security Notice</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <h2 style="margin:0 0 12px 0;font-size:24px;line-height:1.3;color:#111827;">MFA reset request denied</h2>
              <p style="margin:0 0 12px 0;font-size:14px;line-height:1.6;color:#334155;">Hello <strong>${greeting}</strong>,</p>
              <p style="margin:0 0 12px 0;font-size:14px;line-height:1.6;color:#334155;">
                Your request to reset Multi-Factor Authentication (MFA) was reviewed and has been denied at this time.
              </p>
              <div style="margin:14px 0;padding:12px;border:1px solid #fed7aa;background:#fff7ed;border-radius:10px;">
                <p style="margin:0 0 6px 0;font-size:13px;color:#9a3412;"><strong>Reviewed by:</strong> ${input.deniedBy}</p>
                <p style="margin:0;font-size:13px;color:#9a3412;"><strong>Reason:</strong> ${input.reason}</p>
              </div>
              <p style="margin:0 0 8px 0;font-size:13px;line-height:1.6;color:#475569;">
                If you still need assistance, contact your Super Admin and provide additional verification details.
              </p>
              <p style="margin:18px 0 0 0;font-size:12px;color:#64748b;">WIS Security Team</p>
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

  const rateLimited = enforceRateLimit(request, "super-admin-deny-mfa-reset", 20, 60_000);
  if (rateLimited) return rateLimited;

  const body = (await request.json()) as { requestId?: number; reason?: string; confirmationText?: string };
  const requestId = Number(body.requestId);
  const reason = String(body.reason ?? "").trim();
  const confirmationText = String(body.confirmationText ?? "").trim();

  if (!Number.isInteger(requestId) || requestId <= 0) {
    return NextResponse.json({ error: "Valid requestId is required." }, { status: 400 });
  }
  if (confirmationText !== "DENY") {
    return NextResponse.json({ error: "Confirmation text must be DENY." }, { status: 400 });
  }
  if (reason.length < 8 || reason.length > 240) {
    return NextResponse.json(
      { error: "Reason is required (8-240 characters)." },
      { status: 400 }
    );
  }

  const idempotency = await beginIdempotentRequest(request, "admin:deny-security-request");
  if (idempotency.errorResponse) return idempotency.errorResponse;
  if (idempotency.replayResponse) return idempotency.replayResponse;

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
    try {
      const template = buildMfaResetDeniedEmailTemplate({
        userEmail: requestRow.email,
        userName: requestRow.user_name,
        deniedBy: auth.session.email,
        reason
      });
      await sendEmail({
        to: requestRow.email,
        subject: template.subject,
        text: template.text,
        html: template.html
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
    if (!inventoryRef || inventoryError) {
      return NextResponse.json(
        { error: "Request denied, but audit log could not be recorded due to missing inventory reference." },
        { status: 500 }
      );
    }

    const auditMessage = `MFA reset denied for ${requestRow.email} by ${auth.session.email}. Reason: ${reason}`;
    const auditMessageWithEmail = emailWarning
      ? `${auditMessage} Email warning: ${emailWarning}`
      : auditMessage;
    const { error: auditError } = await supabase.from("auto_replenishment_alerts").insert({
      inventory_id: inventoryRef.id,
      item_name: inventoryRef.name,
      reading_quantity: Number(inventoryRef.quantity ?? 0),
      threshold_limit: Number(inventoryRef.threshold_limit ?? 0),
      status: "Denied",
      message: auditMessageWithEmail
    });
    if (auditError) {
      return NextResponse.json(
        { error: `Request denied, but audit log insert failed: ${auditError.message}` },
        { status: 500 }
      );
    }

    const { error: denyError } = await supabase
      .from("mfa_reset_requests")
      .update({ status: "Denied" })
      .eq("id", requestId);
    if (denyError) {
      return NextResponse.json({ error: denyError.message }, { status: 500 });
    }

    const responseBody = { ok: true, emailWarning };
    await completeIdempotentRequest(idempotency.key, 200, responseBody);
    return NextResponse.json(responseBody);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to deny MFA reset request." },
      { status: 500 }
    );
  }
}
