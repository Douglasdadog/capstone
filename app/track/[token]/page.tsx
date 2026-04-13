"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Shipment = {
  id: string;
  tracking_number: string;
  client_name: string;
  origin: string;
  destination: string;
  status: "Pending" | "In Transit" | "Delivered";
  updated_at: string;
  eta?: string | null;
  provider_name?: string | null;
  waybill_number?: string | null;
};

type ShipmentItem = {
  part_number: string;
  quantity: number;
  batch_id?: string | null;
};

const issueTypes = ["Delayed Shipment", "Incorrect Status", "Order Inquiry"] as const;

export default function PublicTrackingPage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [items, setItems] = useState<ShipmentItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [issueType, setIssueType] = useState<(typeof issueTypes)[number]>("Delayed Shipment");
  const [message, setMessage] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    async function load() {
      const response = await fetch(`/api/public/tracking/${token}`);
      const payload = (await response.json()) as {
        shipment?: Shipment;
        items?: ShipmentItem[];
        error?: string;
      };
      if (!response.ok) {
        setError(payload.error ?? "Unable to load tracking details.");
        return;
      }
      setShipment(payload.shipment ?? null);
      setItems(payload.items ?? []);
    }
    void load();
  }, [token]);

  async function handleReportIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError(null);

    const response = await fetch(`/api/public/tracking/${token}/issue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        issueType,
        message,
        contactEmail
      })
    });
    const payload = (await response.json()) as { ticketId?: string; error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Failed to submit issue.");
      setSubmitting(false);
      return;
    }

    router.push(`/track/${token}/thank-you?ticket=${encodeURIComponent(payload.ticketId ?? "#000")}`);
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl space-y-4 px-6 py-10">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-black text-slate-900">Shipment Tracking</h1>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        {!error && !shipment ? <p className="mt-3 text-sm text-slate-500">Loading...</p> : null}
        {shipment ? (
          <div className="mt-4 space-y-2 text-sm text-slate-700">
            <p>
              <span className="font-semibold">Tracking #:</span> {shipment.tracking_number}
            </p>
            <p>
              <span className="font-semibold">Client:</span> {shipment.client_name}
            </p>
            <p>
              <span className="font-semibold">Route:</span> {shipment.origin} &rarr; {shipment.destination}
            </p>
            <p>
              <span className="font-semibold">Status:</span> {shipment.status}
            </p>
            <p>
              <span className="font-semibold">3PL Provider:</span> {shipment.provider_name ?? "-"}
            </p>
            <p>
              <span className="font-semibold">Waybill/Trucker #:</span> {shipment.waybill_number ?? "-"}
            </p>
            <p>
              <span className="font-semibold">ETA:</span>{" "}
              {shipment.eta ? new Date(shipment.eta).toLocaleString() : "-"}
            </p>
            <p>
              <span className="font-semibold">Last Updated:</span>{" "}
              {new Date(shipment.updated_at).toLocaleString()}
            </p>
            <div className="pt-2">
              <a
                href={`/api/public/tracking/${token}/packing-list`}
                className="inline-flex rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100"
              >
                Download Digital Packing List (PDF)
              </a>
            </div>
          </div>
        ) : null}
      </section>

      {shipment ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Order Summary</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-3 py-2">Battery Part</th>
                  <th className="px-3 py-2">Qty</th>
                  <th className="px-3 py-2">Batch</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={`${item.part_number}-${idx}`} className="border-t border-slate-100">
                    <td className="px-3 py-2">{item.part_number}</td>
                    <td className="px-3 py-2">{item.quantity}</td>
                    <td className="px-3 py-2">{item.batch_id ?? "-"}</td>
                  </tr>
                ))}
                {items.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-slate-500" colSpan={3}>
                      No itemized batteries available yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {shipment ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Report Issue</h2>
          <form onSubmit={handleReportIssue} className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-2">
              {issueTypes.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setIssueType(option)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
                    issueType === option
                      ? "border-red-300 bg-red-50 text-red-700"
                      : "border-slate-300 bg-white text-slate-700"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
            <input
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
              type="email"
              placeholder="Your email (optional)"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Describe the issue..."
              rows={4}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {submitting ? "Submitting..." : "Report Issue"}
            </button>
          </form>
        </section>
      ) : null}

      <div className="text-center text-xs text-slate-500">
        <Link href="/" className="text-red-600 hover:underline">
          Back to home
        </Link>
      </div>
    </main>
  );
}
