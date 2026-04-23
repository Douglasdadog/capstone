"use client";

import { FormEvent, useEffect, useState } from "react";

export default function AccountSettingsForm() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setChangingPassword(true);
    setMessage(null);
    setError(null);

    const response = await fetch("/api/account/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
    });
    const data = (await response.json()) as { error?: string; warning?: string };
    if (!response.ok) {
      setError(data.error ?? "Unable to change password.");
      setChangingPassword(false);
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setChangingPassword(false);
    setMessage(data.warning ?? "Password changed successfully. Use your new password next login.");
  }

  return (
    <div className="space-y-4">
      {message ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 shadow-sm">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">{error}</div>
      ) : null}

      <form
        onSubmit={handleSave}
        className="max-w-xl space-y-4 rounded-2xl border border-white/70 bg-white/85 p-5 shadow-sm backdrop-blur"
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
          <input
            value={email}
            disabled
            className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Role</label>
          <input
            value={role}
            disabled
            className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Full Name</label>
          <input
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Phone</label>
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-gradient-to-r from-amber-700 to-red-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-amber-400/30 transition-all hover:from-amber-800 hover:to-red-700 disabled:opacity-70"
        >
          {saving ? "Saving..." : "Save account"}
        </button>
      </form>

      <form
        onSubmit={handleChangePassword}
        className="max-w-xl space-y-4 rounded-2xl border border-white/70 bg-white/85 p-5 shadow-sm backdrop-blur"
      >
        <div>
          <h3 className="text-base font-semibold text-slate-900">Change password</h3>
          <p className="mt-1 text-xs text-slate-600">
            Update your password using at least 8 characters, one uppercase letter, and one special
            character.
          </p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Current Password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
            autoComplete="current-password"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">New Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
            minLength={8}
            pattern="(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}"
            title="Use at least 8 characters, with one uppercase letter and one special character."
            autoComplete="new-password"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Confirm New Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            minLength={8}
            pattern="(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}"
            title="Use at least 8 characters, with one uppercase letter and one special character."
            autoComplete="new-password"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
          />
        </div>
        <button
          type="submit"
          disabled={changingPassword}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-slate-800 disabled:opacity-70"
        >
          {changingPassword ? "Updating..." : "Change password"}
        </button>
      </form>
    </div>
  );
}


