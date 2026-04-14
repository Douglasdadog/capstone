"use client";

import { FormEvent, useState } from "react";

const roles = ["Admin", "Inventory", "Sales", "Client"] as const;

export default function AdminCreateUserForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<(typeof roles)[number]>("Client");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const response = await fetch("/api/admin/users/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, role })
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Unable to create account.");
      setLoading(false);
      return;
    }

    setMessage(`Created ${role} account: ${email}`);
    setPassword("");
    setLoading(false);
  }

  return (
    <div className="space-y-4 rounded-2xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Create User Account</h2>
        <p className="mt-1 text-sm text-slate-600">
          Admin-only account creation with role assignment.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-3 md:grid-cols-4">
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          placeholder="new.user@company.com"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm md:col-span-2"
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={6}
          placeholder="Temporary password"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <select
          value={role}
          onChange={(event) => setRole(event.target.value as (typeof roles)[number])}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          {roles.map((value) => (
            <option key={value} value={value}>
              {value}
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

      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
