import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";
import { sendEmail } from "@/lib/communication/mailer";
import { beginIdempotentRequest, completeIdempotentRequest } from "@/lib/api/idempotency";

const MAX_SUBJECT = 200;
const MAX_BODY = 8000;

function isMissingColumnError(message: string, column: string): boolean {
  const escaped = column.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`column\\s+['"]?${escaped}['"]?\\s+does not exist`, "i"),
    new RegExp(`Could not find the ['"]${escaped}['"] column`, "i")
  ];
  return patterns.some((pattern) => pattern.test(message));
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function nl2br(s: string) {
  return escapeHtml(s).replace(/\r\n/g, "\n").replace(/\n/g, "<br/>");
}

export async function POST(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.session.role !== "Admin" && auth.session.role !== "SuperAdmin" && auth.session.role !== "Sales") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const issueId =
    typeof raw === "object" && raw !== null && "issueId" in raw
      ? Number((raw as { issueId: unknown }).issueId)
      : NaN;
  const subject =
    typeof raw === "object" && raw !== null && "subject" in raw
      ? String((raw as { subject: unknown }).subject).trim()
      : "";
  const message =
    typeof raw === "object" && raw !== null && "message" in raw
      ? String((raw as { message: unknown }).message).trim()
      : "";

  if (!Number.isFinite(issueId) || issueId < 1) {
    return NextResponse.json({ error: "Invalid issue id." }, { status: 400 });
  }
  if (!subject || subject.length > MAX_SUBJECT) {
    return NextResponse.json({ error: "Subject is required (max 200 characters)." }, { status: 400 });
  }
  if (!message || message.length > MAX_BODY) {
    return NextResponse.json({ error: "Message is required (max 8000 characters)." }, { status: 400 });
  }
  const idempotency = await beginIdempotentRequest(request, "admin:tracking-issue-respond");
  if (idempotency.errorResponse) return idempotency.errorResponse;
  if (idempotency.replayResponse) return idempotency.replayResponse;

  const supabase = createAdminClient();
  const { data: issue, error } = await supabase
    .from("tracking_issues")
    .select("id, contact_email, issue_type, shipments(tracking_number)")
    .eq("id", issueId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!issue) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const to = issue.contact_email ? String(issue.contact_email).trim() : "";
  if (!to) {
    return NextResponse.json({ error: "This report has no contact email on file." }, { status: 400 });
  }

  const shipment = Array.isArray(issue.shipments) ? issue.shipments[0] : issue.shipments;
  const tracking =
    shipment && typeof shipment === "object" && "tracking_number" in shipment
      ? String((shipment as { tracking_number?: string | null }).tracking_number ?? "")
      : "";

  const staffLine = `Sent by ${auth.session.email} (${auth.session.role}) regarding your tracking report.`;
  const text = [
    message,
    "",
    "---",
    `Issue type: ${issue.issue_type}`,
    tracking ? `Tracking: ${tracking}` : `Report #${issueId}`,
    "",
    staffLine
  ].join("\n");

  const html = `
      <div style="margin:0;padding:24px;background:#f8fafc;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 10px 40px rgba(15,23,42,0.08);">
          <tr>
            <td style="padding:20px 24px;background:linear-gradient(135deg,#0f172a,#334155);color:#ffffff;">
              <div style="font-size:18px;font-weight:800;letter-spacing:0.02em;">WIS</div>
              <div style="font-size:12px;opacity:0.9;margin-top:4px;">Shipment support</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 24px 8px;">
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">${nl2br(message)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 24px;">
              <div style="border-top:1px solid #e2e8f0;padding-top:16px;font-size:12px;color:#64748b;line-height:1.5;">
                <div><strong style="color:#475569;">Issue:</strong> ${escapeHtml(String(issue.issue_type))}</div>
                ${tracking ? `<div style="margin-top:4px;"><strong style="color:#475569;">Tracking:</strong> ${escapeHtml(tracking)}</div>` : ""}
                <div style="margin-top:12px;font-size:11px;color:#94a3b8;">${escapeHtml(staffLine)}</div>
              </div>
            </td>
          </tr>
        </table>
      </div>`;

  try {
    await sendEmail({ to, subject, text, html });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to send email." },
      { status: 502 }
    );
  }

  // Progressive resolution update for partially migrated schemas.
  const candidates: Array<Record<string, unknown>> = [
    {
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolved_by: auth.session.email,
      resolution_note: message
    },
    {
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolved_by: auth.session.email
    },
    {
      status: "resolved",
      resolved_at: new Date().toISOString()
    },
    {
      status: "resolved"
    }
  ];

  for (const payload of candidates) {
    const resolveUpdate = await supabase.from("tracking_issues").update(payload).eq("id", issueId);
    if (!resolveUpdate.error) {
      const responseBody = { ok: true };
      await completeIdempotentRequest(idempotency.key, 200, responseBody);
      return NextResponse.json(responseBody);
    }
    const hasMissingColumn = Object.keys(payload).some((column) =>
      isMissingColumnError(resolveUpdate.error.message, column)
    );
    if (!hasMissingColumn) {
      return NextResponse.json({ error: resolveUpdate.error.message }, { status: 500 });
    }
  }

  const responseBody = {
    ok: true,
    warning:
      "Email sent, but resolution columns are missing in DB. Run the logistics SQL migration to enable resolved-panel movement."
  };
  await completeIdempotentRequest(idempotency.key, 200, responseBody);
  return NextResponse.json(responseBody);
}
