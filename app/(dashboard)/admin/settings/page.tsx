import AccountSettingsForm from "@/components/account-settings-form";

export default function AdminSettingsPage() {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-slate-600">Account profile for this demo environment.</p>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Your account</h2>
        <p className="text-sm text-slate-600">Name and phone for your admin profile.</p>
        <AccountSettingsForm />
      </div>
    </section>
  );
}
