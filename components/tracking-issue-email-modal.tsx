"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Mail, X } from "lucide-react";
import { queueOfflineTransaction } from "@/lib/offline/transaction-queue";

export type TrackingIssueEmailContext = {
  id: number;
  tracking_number: string | null;
  issue_type: string;
  message: string | null;
  contact_email: string | null;
  client_name: string | null;
};

type Props = {
  issue: TrackingIssueEmailContext | null;
  open: boolean;
  onClose: () => void;
  onSent?: () => void;
};

export default function TrackingIssueEmailModal({ issue, open, onClose, onSent }: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [queued, setQueued] = useState(false);

  useEffect(() => {
    if (!open || !issue) return;
    setError(null);
    setSuccess(false);
    setQueued(false);
    const tn = issue.tracking_number?.trim() || `report #${issue.id}`;
    setSubject(`Re: Your shipment report — ${tn}`);
    setBody(
      [
        `Hello,`,
        ``,
        `Thank you for reporting "${issue.issue_type}" regarding tracking ${tn}.`,
        ``,
        `We are looking into this and will update you shortly.`,
        ``,
        `Best regards,`,
        `WIS Support`
      ].join("\n")
    );
    const t = window.setTimeout(() => closeRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open, issue]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  const send = useCallback(async () => {
    if (!issue?.contact_email?.trim()) {
      setError("No contact email is on file for this report.");
      return;
    }
    setSending(true);
    setError(null);
    setSuccess(false);
    try {
      if (!window.navigator.onLine) {
        queueOfflineTransaction({
          path: "/api/admin/tracking-issues/respond",
          method: "POST",
          body: {
            issueId: issue.id,
            subject: subject.trim(),
            message: body.trim()
          }
        });
        setQueued(true);
        setSuccess(true);
        onSent?.();
        window.setTimeout(() => {
          onClose();
        }, 1200);
        return;
      }
      const response = await fetch("/api/admin/tracking-issues/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueId: issue.id,
          subject: subject.trim(),
          message: body.trim()
        })
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not send email.");
        setSending(false);
        return;
      }
      setSuccess(true);
      setQueued(false);
      onSent?.();
      window.setTimeout(() => {
        onClose();
      }, 1200);
    } catch {
      queueOfflineTransaction({
        path: "/api/admin/tracking-issues/respond",
        method: "POST",
        body: {
          issueId: issue.id,
          subject: subject.trim(),
          message: body.trim()
        }
      });
      setError(null);
      setQueued(true);
      setSuccess(true);
      onSent?.();
      window.setTimeout(() => {
        onClose();
      }, 1200);
    } finally {
      setSending(false);
    }
  }, [issue, subject, body, onClose, onSent]);

  if (!open || !issue) return null;

  const canSend = Boolean(issue.contact_email?.trim()) && subject.trim().length > 0 && body.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border-2 border-slate-200 bg-white shadow-2xl shadow-slate-900/20 ring-1 ring-slate-200/80"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-slate-900 to-slate-700 px-5 py-4 text-white">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
              <Mail className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h2 id={titleId} className="text-base font-bold tracking-tight">
                Email customer
              </h2>
              <p className="mt-0.5 text-xs text-white/85">
                Message will be sent to the contact on this report using your configured mail provider.
              </p>
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/90 hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[min(70vh,520px)] overflow-y-auto px-5 py-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3 text-sm">
            <div className="grid gap-1.5 text-slate-700">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">To</span>
                <p className="font-medium text-slate-900">{issue.contact_email || "—"}</p>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span>
                  <span className="text-slate-500">Tracking:</span>{" "}
                  <span className="font-medium text-slate-800">{issue.tracking_number || "—"}</span>
                </span>
                <span>
                  <span className="text-slate-500">Issue:</span>{" "}
                  <span className="font-medium text-amber-800">{issue.issue_type}</span>
                </span>
              </div>
              {issue.message ? (
                <p className="border-t border-slate-200/80 pt-2 text-xs text-slate-600">
                  <span className="font-semibold text-slate-500">Their message: </span>
                  {issue.message}
                </p>
              ) : null}
            </div>
          </div>

          {!issue.contact_email?.trim() ? (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              This report has no contact email. You cannot send mail until the customer provides one.
            </p>
          ) : null}

          <label className="mt-4 block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Subject</span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1 w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              maxLength={200}
              disabled={sending || success}
            />
          </label>

          <label className="mt-3 block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Message</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="mt-1 w-full resize-y rounded-lg border-2 border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed shadow-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              disabled={sending || success}
            />
          </label>

          {error ? (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
          ) : null}
          {success ? (
            <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">
              {queued ? "Offline: email response queued for sync." : "Email sent successfully."}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/80 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            disabled={sending}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void send()}
            disabled={!canSend || sending || success}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-md hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Sending…
              </>
            ) : (
              <>
                <Mail className="h-4 w-4" />
                Send email
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
