import Link from "next/link";

export default function HomePage() {
  const currentYear = new Date().getFullYear();

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="h-2 w-full bg-gradient-to-r from-red-700 via-red-600 to-amber-500" />

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
          <p className="text-3xl font-black italic leading-none text-red-600">imarflex.</p>
          <Link
            href="/login"
            className="rounded-md border border-red-600 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50"
          >
            Secure Login
          </Link>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-8 px-6 py-10 md:grid-cols-2 md:py-14">
        <div className="space-y-5">
          <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-red-800">
            IMARFLEX Mission Control
          </span>
          <h1 className="text-4xl font-black leading-tight text-slate-950 md:text-6xl">
            Powering Smarter Warehouse Operations
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-slate-700">
            Unified visibility for inventory, logistics, and environmental monitoring in one reliable operations
            platform built for day-to-day warehouse execution.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/login"
              className="rounded-md bg-amber-400 px-5 py-2.5 text-sm font-bold text-slate-900 shadow-sm transition-colors hover:bg-amber-300"
            >
              Open Dashboard
            </Link>
            <Link
              href="/shipment-tracking"
              className="rounded-md border border-red-300 bg-red-50 px-5 py-2.5 text-sm font-bold text-red-700 shadow-sm transition-colors hover:bg-red-100"
            >
              Shipment Tracking
            </Link>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
          <div className="bg-red-700 px-5 py-3 text-sm font-bold text-white">Live Operations Snapshot</div>
          <div className="grid grid-cols-2 gap-4 p-5">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Inventory health</p>
              <p className="mt-2 text-2xl font-black text-slate-900">98.2%</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Orders in transit</p>
              <p className="mt-2 text-2xl font-black text-slate-900">24</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active alerts</p>
              <p className="mt-2 text-2xl font-black text-red-600">3</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">System uptime</p>
              <p className="mt-2 text-2xl font-black text-amber-600">99.7%</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-10 md:pb-14">
        <div className="grid gap-4 md:grid-cols-3">
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 h-1 w-12 rounded-full bg-red-600" />
            <h2 className="text-lg font-black text-slate-900">Inventory Intelligence</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">
              Monitor stock levels, thresholds, and adjustments with a clear audit-ready view across storage locations.
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 h-1 w-12 rounded-full bg-amber-500" />
            <h2 className="text-lg font-black text-slate-900">Sales and Logistics</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">
              Keep order fulfillment and delivery status synchronized from dispatch to customer confirmation.
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 h-1 w-12 rounded-full bg-red-600" />
            <h2 className="text-lg font-black text-slate-900">IoT Environment Ready</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">
              Track temperature and humidity telemetry with alerts designed for warehouse compliance workflows.
            </p>
          </article>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-6 py-5 text-xs text-slate-500">
          <p>© {currentYear} IMARFLEX. All rights reserved.</p>
          <p>Warehouse Operations Platform</p>
        </div>
      </footer>
    </main>
  );
}


