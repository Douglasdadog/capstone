import AdminManifestManager from "@/components/admin-manifest-manager";
import AdminShipmentsDashboard from "@/components/admin-shipments-dashboard";

export default function AdminPage() {
  return (
    <section className="space-y-8">
      <AdminShipmentsDashboard />
      <AdminManifestManager />
    </section>
  );
}

