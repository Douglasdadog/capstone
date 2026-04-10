import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-white px-6 py-10 sm:py-16">
      <section className="mx-auto w-full max-w-6xl space-y-8">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="grid gap-6 p-8 md:grid-cols-2 md:p-12">
            <div className="space-y-5">
              <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
                Mission Control for Warehousing
              </span>
              <h1 className="text-4xl font-bold leading-tight text-slate-900 md:text-5xl">
                Warehouse Information System
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-slate-600">
                Manage inventory, sales, logistics, and warehouse environment signals in one smart operational
                cockpit built for speed and clarity.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/dashboard"
                  className="rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                >
                  Open Dashboard
                </Link>
                <Link
                  href="/login"
                  className="rounded-md border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                >
                  Sign In
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 to-blue-900 p-6 text-slate-100 shadow-inner">
              <p className="text-xs font-semibold uppercase tracking-widest text-blue-200">Live overview</p>
              <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-white/15 bg-white/10 p-4">
                  <p className="text-xs uppercase tracking-wide text-blue-100">Inventory health</p>
                  <p className="mt-2 text-2xl font-bold">98.2%</p>
                </div>
                <div className="rounded-lg border border-white/15 bg-white/10 p-4">
                  <p className="text-xs uppercase tracking-wide text-blue-100">Orders in transit</p>
                  <p className="mt-2 text-2xl font-bold">24</p>
                </div>
                <div className="rounded-lg border border-white/15 bg-white/10 p-4">
                  <p className="text-xs uppercase tracking-wide text-blue-100">Active alerts</p>
                  <p className="mt-2 text-2xl font-bold">3</p>
                </div>
                <div className="rounded-lg border border-white/15 bg-white/10 p-4">
                  <p className="text-xs uppercase tracking-wide text-blue-100">System uptime</p>
                  <p className="mt-2 text-2xl font-bold text-emerald-300">99.7%</p>
                </div>
              </div>
              <p className="mt-6 text-xs text-blue-100/90">
                Metrics above are preview values. Real-time operational data appears after sign in.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Inventory Intelligence</h2>
            <p className="mt-2 text-sm text-slate-600">
              Track stock thresholds, apply manual overrides, and respond to low-stock alerts fast.
            </p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Sales and Logistics Flow</h2>
            <p className="mt-2 text-sm text-slate-600">
              Monitor shipment status, update fulfillment milestones, and keep delivery operations synced.
            </p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">IoT Environment Ready</h2>
            <p className="mt-2 text-sm text-slate-600">
              Prepare temperature and humidity streams with connection checks for incoming IoT deployment.
            </p>
          </article>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-sm text-slate-600">
            Ready to manage operations? Enter the platform and take control of your warehouse workflow.
          </p>
          <Link
            href="/dashboard"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            Launch Mission Control
          </Link>
        </div>
      </section>
    </main>
  );
}
