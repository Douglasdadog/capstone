import Link from "next/link";

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 px-6 py-10 sm:py-16">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-red-400/20 blur-3xl" />
        <div className="absolute right-0 top-1/3 h-80 w-80 rounded-full bg-amber-500/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-red-500/20 blur-3xl" />
      </div>

      <section className="relative z-10 mx-auto w-full max-w-6xl space-y-8">
        <div className="overflow-hidden rounded-3xl border border-white/15 bg-white/95 shadow-2xl">
          <div className="grid gap-6 p-8 md:grid-cols-2 md:p-12">
            <div className="space-y-5">
              <p className="text-3xl font-black italic leading-none text-red-600">imarflex.</p>
              <span className="inline-flex rounded-full border border-red-300/60 bg-red-100/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-red-900">
                Mission Control for Warehousing
              </span>
              <h1 className="bg-gradient-to-r from-slate-900 via-amber-900 to-red-700 bg-clip-text text-4xl font-black leading-tight text-transparent md:text-6xl">
                Warehouse Information System
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-slate-700">
                Manage inventory, sales, logistics, and warehouse environment signals in one smart operational
                cockpit built for speed and clarity.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/dashboard"
                  className="rounded-md bg-gradient-to-r from-yellow-500 to-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-900 shadow-lg shadow-amber-300/50 transition-all hover:scale-[1.02] hover:from-yellow-400 hover:to-amber-400"
                >
                  Launch Mission Control
                </Link>
                <Link
                  href="/login"
                  className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                >
                  Enter Secure Login
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-900/50 bg-gradient-to-br from-slate-950 via-amber-950 to-amber-900 p-6 text-slate-100 shadow-inner">
              <p className="text-xs font-semibold uppercase tracking-widest text-red-200">Live overview</p>
              <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-white/20 bg-white/10 p-4 backdrop-blur">
                  <p className="text-xs uppercase tracking-wide text-red-100">Inventory health</p>
                  <p className="mt-2 text-2xl font-bold">98.2%</p>
                </div>
                <div className="rounded-lg border border-white/20 bg-white/10 p-4 backdrop-blur">
                  <p className="text-xs uppercase tracking-wide text-red-100">Orders in transit</p>
                  <p className="mt-2 text-2xl font-bold">24</p>
                </div>
                <div className="rounded-lg border border-white/20 bg-white/10 p-4 backdrop-blur">
                  <p className="text-xs uppercase tracking-wide text-red-100">Active alerts</p>
                  <p className="mt-2 text-2xl font-bold text-rose-300">3</p>
                </div>
                <div className="rounded-lg border border-white/20 bg-white/10 p-4 backdrop-blur">
                  <p className="text-xs uppercase tracking-wide text-red-100">System uptime</p>
                  <p className="mt-2 text-2xl font-bold text-amber-300">99.7%</p>
                </div>
              </div>
              <p className="mt-6 text-xs text-amber-100/90">
                Metrics above are preview values. Real-time operational data appears after sign in.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-white/20 bg-white/90 p-5 shadow-xl transition-transform hover:-translate-y-1">
            <h2 className="text-lg font-bold text-slate-900">Inventory Intelligence</h2>
            <p className="mt-2 text-sm text-slate-700">
              Track stock thresholds, apply manual overrides, and respond to low-stock alerts fast.
            </p>
          </article>
          <article className="rounded-2xl border border-white/20 bg-white/90 p-5 shadow-xl transition-transform hover:-translate-y-1">
            <h2 className="text-lg font-bold text-slate-900">Sales and Logistics Flow</h2>
            <p className="mt-2 text-sm text-slate-700">
              Monitor shipment status, update fulfillment milestones, and keep delivery operations synced.
            </p>
          </article>
          <article className="rounded-2xl border border-white/20 bg-white/90 p-5 shadow-xl transition-transform hover:-translate-y-1">
            <h2 className="text-lg font-bold text-slate-900">IoT Environment Ready</h2>
            <p className="mt-2 text-sm text-slate-700">
              Prepare temperature and humidity streams with connection checks for incoming IoT deployment.
            </p>
          </article>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-300/30 bg-gradient-to-r from-red-500/20 to-amber-500/20 px-5 py-4 text-white shadow-lg">
          <p className="text-sm text-slate-100">
            Ready to run operations like a pro? Jump in and take full control of your warehouse floor.
          </p>
          <Link
            href="/dashboard"
            className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-100"
          >
            Open Dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}


