"use client";

import { FormEvent, useMemo, useState } from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const reasons = ["Short Shipment", "Damaged on Arrival", "Mismatched Part", "Over-shipment"] as const;

export default function ManifestReportPage() {
  return (
    <Suspense fallback={<section className="rounded-xl border border-slate-200 bg-white p-5">Loading...</section>}>
      <ManifestReportContent />
    </Suspense>
  );
}

function ManifestReportContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const manifestId = useMemo(() => searchParams.get("manifestId") ?? "", [searchParams]);
  const [reason, setReason] = useState<(typeof reasons)[number]>("Short Shipment");
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!manifestId) {
      setError("Missing manifest reference.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const response = await fetch(`/api/inventory/manifests/${manifestId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, comments })
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Unable to submit report.");
      setSubmitting(false);
      return;
    }

    router.push("/inventory");
    router.refresh();
  }

  return (
    <section className="mx-auto w-full max-w-xl space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h1 className="text-xl font-black text-slate-900">Make Report</h1>
      <p className="text-sm text-slate-600">
        Select a discrepancy reason and include notes for Admin verification.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {reasons.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setReason(option)}
              className={`rounded-md border px-3 py-2 text-sm font-semibold ${
                reason === option
                  ? "border-red-400 bg-red-50 text-red-700"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        <div>
          <label htmlFor="comments" className="mb-1 block text-sm font-medium text-slate-700">
            Comments
          </label>
          <textarea
            id="comments"
            rows={4}
            value={comments}
            onChange={(event) => setComments(event.target.value)}
            placeholder="Describe what was found during scanning..."
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-gradient-to-r from-yellow-500 to-amber-500 px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
        >
          {submitting ? "Submitting..." : "Submit Report"}
        </button>
      </form>
    </section>
  );
}
