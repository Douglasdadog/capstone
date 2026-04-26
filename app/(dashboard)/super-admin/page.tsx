import AdminCreateUserForm from "@/components/admin-create-user-form";
import AdminUserPermissions from "@/components/admin-user-permissions";
import SuperAdminGovernancePanel from "@/components/super-admin-governance-panel";
import SuperAdminIotProvisioningPanel from "@/components/super-admin-iot-provisioning-panel";

export default function SuperAdminPage() {
  return (
    <section className="space-y-8">
      <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur">
        <h1 className="bg-gradient-to-r from-slate-900 via-amber-900 to-red-700 bg-clip-text text-3xl font-black text-transparent">
          Super Admin Module
        </h1>
        <p className="mt-2 text-slate-600">
          Govern privileged access, account provisioning, and permission overrides.
        </p>
      </div>

      <SuperAdminGovernancePanel />
      <SuperAdminIotProvisioningPanel />
      <AdminCreateUserForm />
      <AdminUserPermissions />
    </section>
  );
}
