"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { normalizeRole, resolvePostLoginPath } from "@/lib/auth/roles";

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="mx-auto flex min-h-screen max-w-md items-center px-6">Loading...</main>}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const showFreshBanner = searchParams.get("fresh") === "1";

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("Client");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const endpoint = mode === "login" ? "/api/auth/demo-login" : "/api/auth/demo-register";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        role
      })
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setError(data.error ?? "Unable to continue.");
      setLoading(false);
      return;
    }

    const sessionRes = await fetch("/api/auth/session");
    const sessionData = (await sessionRes.json()) as { role?: string };
    const userRole = normalizeRole(sessionData.role);
    const from = searchParams.get("redirectedFrom");
    const nextPath = resolvePostLoginPath(userRole, from);

    router.push(nextPath);
    router.refresh();
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-6 py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 top-0 h-72 w-72 rounded-full bg-red-400/20 blur-3xl" />
        <div className="absolute right-0 top-1/3 h-80 w-80 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-fuchsia-500/20 blur-3xl" />
      </div>

      <section className="relative z-10 w-full max-w-md rounded-2xl border border-white/15 bg-white/95 p-7 shadow-2xl backdrop-blur">
        {showFreshBanner ? (
          <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Demo data was reset. You can sign in again with the sample accounts below.
          </div>
        ) : null}

        <h1 className="bg-gradient-to-r from-slate-900 via-blue-900 to-red-700 bg-clip-text text-3xl font-black text-transparent">
          Login
        </h1>
        <p className="mt-2 text-sm text-slate-600">Access your WIS mission control workspace.</p>

        <div className="mt-5 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50 p-4 text-xs text-slate-700">
          <p className="font-semibold uppercase tracking-wide text-slate-800">Sample test accounts</p>
          <p>Admin: admin@wis.local / admin123</p>
          <p>Inventory: inventory@wis.local / inventory123</p>
          <p>Sales: sales@wis.local / sales123</p>
          <p>Client: client@wis.local / client123</p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`rounded-md px-3 py-2 text-sm ${
              mode === "login"
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-transparent text-slate-700 hover:bg-slate-200/80"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            className={`rounded-md px-3 py-2 text-sm ${
              mode === "register"
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-transparent text-slate-700 hover:bg-slate-200/80"
            }`}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSignIn} className="mt-5 space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
            />
          </div>

          {mode === "register" ? (
            <div>
              <label htmlFor="role" className="mb-1 block text-sm font-medium text-slate-700">
                Role
              </label>
              <select
                id="role"
                value={role}
                onChange={(event) => setRole(event.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
              >
                <option value="Admin">Admin</option>
                <option value="Inventory">Inventory</option>
                <option value="Sales">Sales</option>
                <option value="Client">Client</option>
              </select>
            </div>
          ) : null}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-gradient-to-r from-blue-700 to-red-600 px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-400/30 transition-all hover:from-blue-800 hover:to-red-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Please wait..." : mode === "login" ? "Sign in" : "Register and continue"}
          </button>
        </form>
      </section>
    </main>
  );
}
