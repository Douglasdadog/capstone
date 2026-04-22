"use client";

import { FormEvent, useState } from "react";

const roles = ["SuperAdmin", "Admin", "Inventory", "Sales", "Client"] as const;
const roleLabels: Record<(typeof roles)[number], string> = {
  SuperAdmin: "Super Admin",
  Admin: "Admin",
  Inventory: "Inventory",
  Sales: "Sales",
  Client: "Client"
};

export default function AdminCreateUserForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<(typeof roles)[number]>("Client");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    setMessage(null);

    const normalizedEmail = email.trim().toLowerCase();
    const response = await fetch("/api/admin/users/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail, password, role })
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Unable to create account.");
      setLoading(false);
      return;
    }

    setMessage(`Created ${roleLabels[role]} account: ${normalizedEmail}`);
    setEmail("");
    setPassword("");
    setLoading(false);
  }

  return (
    <div className="space-y-4 rounded-2xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Create user account</h2>
        <p className="mt-1 text-sm text-slate-600">
          Provision a new user and assign the minimum role they need.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-3 md:grid-cols-4">
        <label className="sr-only" htmlFor="create-user-email">
          Email address
        </label>
        <input
          id="create-user-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="email"
          placeholder="user@company.com"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm md:col-span-2"
        />
        <label className="sr-only" htmlFor="create-user-password">
          Temporary password
        </label>
        <input
          id="create-user-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
          placeholder="Temporary password"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <label className="sr-only" htmlFor="create-user-role">
          Role
        </label>
        <select
          id="create-user-role"
          value={role}
          onChange={(event) => setRole(event.target.value as (typeof roles)[number])}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          {roles.map((value) => (
            <option key={value} value={value}>
              {roleLabels[value]}
            </option>
          ))}
        </select>

        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-gradient-to-r from-amber-700 to-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:from-amber-800 hover:to-red-700 disabled:opacity-60 md:col-span-4 md:w-fit"
        >
          {loading ? "Creating..." : "Create account"}
        </button>
      </form>
      <p className="text-xs text-slate-500">
        Tip: use a temporary password and ask the user to change it after first login.
      </p>

      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
