import Link from "next/link";
import AdminUserPermissions from "@/components/admin-user-permissions";

export default function AdminPage() {
  return (
    <section className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Admin Module</h1>
        <p className="text-slate-600">Manage users, permissions, and system-wide settings.</p>
        <Link
          href="/admin/settings"
          className="inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Open Settings
        </Link>
      </div>

      <AdminUserPermissions />
    </section>
  );
}
