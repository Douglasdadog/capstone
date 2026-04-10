import AccountSettingsForm from "@/components/account-settings-form";

export default function AdminSettingsPage() {
  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur">
        <h1 className="bg-gradient-to-r from-slate-900 via-amber-900 to-red-700 bg-clip-text text-3xl font-black text-transparent">
          Settings
        </h1>
        <p className="mt-2 text-slate-600">Account profile for this demo environment.</p>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Your account</h2>
        <p className="text-sm text-slate-600">Name and phone for your admin profile.</p>
        <AccountSettingsForm />
      </div>
    </section>
  );
}

