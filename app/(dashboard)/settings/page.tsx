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
      <div>
        <h1 className="text-2xl font-bold">Account Settings</h1>
        <p className="text-slate-600">Manage your profile details used in this demo workspace.</p>
      </div>
      <AccountSettingsForm />
    </section>
  );
}
