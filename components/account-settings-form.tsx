"use client";

import { FormEvent, useEffect, useState } from "react";

export default function AccountSettingsForm() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const response = await fetch("/api/account/settings");
      const data = (await response.json()) as {
        email?: string;
        role?: string;
        fullName?: string;
        phone?: string;
        error?: string;
      };
      if (!response.ok) {
        setError(data.error ?? "Unable to load settings.");
        return;
      }
      setEmail(data.email ?? "");
      setRole(data.role ?? "");
      setFullName(data.fullName ?? "");
      setPhone(data.phone ?? "");
    }
    void load();
  }, []);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    const response = await fetch("/api/account/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, phone })
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(data.error ?? "Unable to save settings.");
      setSaving(false);
      return;
    }
    setSaving(false);
    setMessage("Account settings saved.");
  }

  return (
    <div className="space-y-4">
      {message ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <form onSubmit={handleSave} className="max-w-xl space-y-4 rounded-lg border border-slate-200 bg-white p-5">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
          <input value={email} disabled className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Role</label>
          <input value={role} disabled className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Full Name</label>
          <input
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Phone</label>
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-70"
        >
          {saving ? "Saving..." : "Save account"}
        </button>
      </form>
    </div>
  );
}
