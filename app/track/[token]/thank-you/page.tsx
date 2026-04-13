"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

export default function TrackingThankYouPage() {
  return (
    <Suspense fallback={<main className="mx-auto min-h-screen max-w-2xl px-6 py-10">Loading...</main>}>
      <ThankYouContent />
    </Suspense>
  );
}

function ThankYouContent() {
  const searchParams = useSearchParams();
  const ticket = searchParams.get("ticket") ?? "#000";

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-6 py-10">
      <section className="rounded-2xl border border-green-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-black text-slate-900">Thank You</h1>
        <p className="mt-3 text-sm text-slate-700">
          Your issue has been submitted successfully.
        </p>
        <p className="mt-2 text-sm">
          Ticket ID: <span className="font-semibold text-red-600">{ticket}</span>
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Our support team will respond within <span className="font-semibold">24 hours</span>.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Return Home
        </Link>
      </section>
    </main>
  );
}
