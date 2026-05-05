import Link from "next/link";

export default function HomePage() {
  const currentYear = new Date().getFullYear();

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="h-1.5 w-full bg-gradient-to-r from-red-700 via-red-600 to-amber-500" />

      <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <p className="text-3xl font-black italic leading-none text-red-600">imarflex.</p>
            <span className="hidden rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 md:inline-flex">
              Warehouse Operations System
            </span>
          </div>
          <Link
            href="/login"
            className="rounded-md border border-red-600 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50"
          >
            Secure Login
          </Link>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-6xl gap-8 px-6 py-12 md:grid-cols-[1.1fr_0.9fr] md:py-16">
        <div className="space-y-6">
          <h1 className="text-4xl font-black leading-tight text-slate-950 md:text-6xl">
            Precision Control for Warehouse and Fulfillment Teams
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-slate-700">
            Manage inventory, logistics, and operations monitoring from one secure platform designed for fast decisions
            and reliable execution.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/login"
              className="rounded-md bg-red-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-red-700"
            >
              Access Platform
            </Link>
            <Link
              href="/client/products"
              className="rounded-md bg-slate-900 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-slate-800"
            >
              Order Now
            </Link>
            <Link
              href="/shipment-tracking"
              className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-800 shadow-sm transition-colors hover:bg-slate-100"
            >
              Track Shipment
            </Link>
          </div>
          <div className="grid max-w-xl grid-cols-3 gap-3 pt-2">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Accuracy</p>
              <p className="mt-1 text-xl font-black text-slate-900">99.2%</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Uptime</p>
              <p className="mt-1 text-xl font-black text-slate-900">99.9%</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Visibility</p>
              <p className="mt-1 text-xl font-black text-slate-900">Real-time</p>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-200 bg-slate-900 px-5 py-3 text-sm font-semibold text-white">
            Operations Snapshot
          </div>
          <div className="space-y-3 p-5">
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Inventory readiness</p>
              <p className="text-lg font-black text-slate-900">98.2%</p>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Orders in transit</p>
              <p className="text-lg font-black text-slate-900">24</p>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Critical alerts</p>
              <p className="text-lg font-black text-red-600">3</p>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Platform uptime</p>
              <p className="text-lg font-black text-amber-600">99.7%</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-12 md:pb-16">
        <div className="grid gap-4 md:grid-cols-3">
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-slate-900">Inventory Management</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">
              Full control over stock movement, threshold monitoring, and verification workflows.
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-slate-900">Logistics Visibility</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">
              Centralized shipment updates from dispatch through final customer delivery.
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-slate-900">Environment Monitoring</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">
              Real-time telemetry and alerts for temperature and humidity-sensitive operations.
            </p>
          </article>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-6 py-5 text-xs text-slate-500">
          <p>© {currentYear} IMARFLEX. All rights reserved.</p>
          <p>Enterprise Warehouse Operations Platform</p>
        </div>
      </footer>
    </main>
  );
}


