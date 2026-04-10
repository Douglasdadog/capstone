"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AccountSettingsForm from "@/components/account-settings-form";

export default function SettingsPage() {
  const router = useRouter();

  useEffect(() => {
    async function check() {
      const response = await fetch("/api/auth/session");
      if (!response.ok) return;
      const data = (await response.json()) as { role?: string };
      if (data.role === "Admin") {
        router.replace("/admin/settings");
      }
    }
    void check();
  }, [router]);

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur">
        <h1 className="bg-gradient-to-r from-slate-900 via-blue-900 to-cyan-700 bg-clip-text text-3xl font-black text-transparent">
          Account Settings
        </h1>
        <p className="mt-2 text-slate-600">Manage your profile details used in this demo workspace.</p>
      </div>
      <AccountSettingsForm />
    </section>
  );
}
