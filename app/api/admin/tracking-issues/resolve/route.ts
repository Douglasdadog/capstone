import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";
import { sendEmail } from "@/lib/communication/mailer";

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
  if (!Number.isFinite(issueId) || issueId < 1) {
    return NextResponse.json({ error: "Invalid issue id." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: issue, error: issueError } = await supabase
    .from("tracking_issues")
    .select("id, issue_type, contact_email, shipments(tracking_number)")
    .eq("id", issueId)
    .maybeSingle();
  if (issueError) {
    return NextResponse.json({ error: issueError.message }, { status: 500 });
  }
  if (!issue) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const candidates: Array<Record<string, unknown>> = [
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

  let lastColumnError: string | null = null;
  for (const payload of candidates) {
    const updateResult = await supabase.from("tracking_issues").update(payload).eq("id", issueId);
    if (!updateResult.error) {
      const to = issue.contact_email ? String(issue.contact_email).trim() : "";
      if (!to) {
        return NextResponse.json({
          ok: true,
          warning: "Marked as resolved, but no customer email is on file for this report."
        });
      }
      const shipment = Array.isArray(issue.shipments) ? issue.shipments[0] : issue.shipments;
      const tracking =
        shipment && typeof shipment === "object" && "tracking_number" in shipment
          ? String((shipment as { tracking_number?: string | null }).tracking_number ?? "")
          : "";
      const ticketLabel = tracking || `Ticket #${issueId}`;
      const subject = `Resolution update: ${ticketLabel} has been closed`;
      const resolvedAt = new Date().toISOString();
      const resolvedAtLocal = new Date(resolvedAt).toLocaleString();
      const text = [
        "Dear Customer,",
        "",
        `This is to confirm that your reported issue has been resolved and the ticket is now closed.`,
        "",
        `Ticket reference: ${ticketLabel}`,
        `Issue type: ${issue.issue_type}`,
        `Resolved at: ${resolvedAtLocal}`,
        "",
        "If you believe this issue is still unresolved, please reply to this email and our team will reopen and review it immediately.",
        "",
        `Resolved by: ${auth.session.email} (${auth.session.role})`,
        "",
        "Best regards,",
        "WIS Support Team",
        "Warehouse Information System"
      ].join("\n");
      const html = `
        <div style="margin:0;padding:24px;background:#f8fafc;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(2,6,23,0.08);">
            <tr>
              <td style="padding:20px 24px;background:linear-gradient(135deg,#0f172a,#1e293b);color:#ffffff;">
                <div style="font-size:18px;font-weight:800;letter-spacing:0.02em;">WIS Support</div>
                <div style="font-size:12px;opacity:0.9;margin-top:4px;">Issue Resolution Confirmation</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <p style="margin:0 0 12px;font-size:15px;line-height:1.65;color:#334155;">Dear Customer,</p>
                <p style="margin:0 0 12px;font-size:15px;line-height:1.65;color:#334155;">
                  This is to confirm that your reported issue has been resolved and your ticket is now closed.
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:14px 0;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
                  <tr>
                    <td style="padding:12px 14px;">
                      <div style="font-size:12px;color:#64748b;line-height:1.7;">
                        <div><strong style="color:#334155;">Ticket reference:</strong> ${escapeHtml(ticketLabel)}</div>
                        <div><strong style="color:#334155;">Issue type:</strong> ${escapeHtml(String(issue.issue_type))}</div>
                        <div><strong style="color:#334155;">Resolved at:</strong> ${escapeHtml(resolvedAtLocal)}</div>
                        <div><strong style="color:#334155;">Resolved by:</strong> ${escapeHtml(auth.session.email)} (${escapeHtml(auth.session.role)})</div>
                      </div>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 12px;font-size:14px;line-height:1.65;color:#475569;">
                  If you believe this issue is still unresolved, please reply to this email and our team will reopen and review it immediately.
                </p>
                <p style="margin:18px 0 0;font-size:14px;color:#334155;">
                  Best regards,<br/>
                  <strong>WIS Support Team</strong><br/>
                  <span style="color:#64748b;">Warehouse Information System</span>
                </p>
                <p style="margin:18px 0 0;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px;">
                  This is an automated service message for ticket closure confirmation.
                </p>
              </td>
            </tr>
          </table>
        </div>`;
      try {
        await sendEmail({ to, subject, text, html });
      } catch (emailError) {
        return NextResponse.json(
          {
            ok: true,
            warning: emailError instanceof Error ? emailError.message : "Issue resolved, but email delivery failed."
          },
          { status: 200 }
        );
      }
      return NextResponse.json({ ok: true });
    }
    const message = updateResult.error.message;
    const hasMissingColumn = Object.keys(payload).some((column) => isMissingColumnError(message, column));
    if (!hasMissingColumn) {
      return NextResponse.json({ error: message }, { status: 500 });
    }
    lastColumnError = message;
  }

  return NextResponse.json({
    ok: true,
    warning:
      lastColumnError ??
      "Marked as resolved locally, but DB resolution columns are missing. Run the logistics SQL migration to persist resolved state."
  });
}
