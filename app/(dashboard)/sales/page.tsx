export default function SalesPage() {
  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur">
        <h1 className="bg-gradient-to-r from-slate-900 via-blue-900 to-red-700 bg-clip-text text-3xl font-black text-transparent">
          Sales Module
        </h1>
        <p className="mt-2 text-slate-600">Manage sales orders, delivery status, and invoice flow.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-xl border border-white/70 bg-white/80 p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Orders</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">Active</p>
        </article>
        <article className="rounded-xl border border-white/70 bg-white/80 p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Pipeline</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">Visible</p>
        </article>
        <article className="rounded-xl border border-white/70 bg-white/80 p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Dispatch</p>
          <p className="mt-2 text-2xl font-bold text-blue-600">Ready</p>
        </article>
      </div>
    </section>
  );
}

