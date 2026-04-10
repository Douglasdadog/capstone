import Link from "next/link";
import AdminUserPermissions from "@/components/admin-user-permissions";

export default function AdminPage() {
  return (
    <section className="space-y-8">
      <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur">
        <h1 className="bg-gradient-to-r from-slate-900 via-amber-900 to-red-700 bg-clip-text text-3xl font-black text-transparent">
          Admin Module
        </h1>
        <p className="mt-2 text-slate-600">Manage users, permissions, and system-wide settings.</p>
        <Link
          href="/admin/settings"
          className="mt-4 inline-block rounded-md bg-gradient-to-r from-amber-700 to-red-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-amber-400/30 transition-all hover:from-amber-800 hover:to-red-700"
        >
          Open Settings
        </Link>
      </div>

      <AdminUserPermissions />
    </section>
  );
}

