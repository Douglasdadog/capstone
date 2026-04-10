 "use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
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
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
      <section className="w-full rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        {showFreshBanner ? (
          <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Demo data was reset. You can sign in again with the sample accounts below.
          </div>
        ) : null}
        <h1 className="text-xl font-semibold">Login</h1>
        <p className="mt-2 text-sm text-slate-600">
          Testing mode uses local demo accounts (no Supabase account required).
        </p>

        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          <p className="font-semibold">Sample test accounts</p>
          <p>Admin: admin@wis.local / admin123</p>
          <p>Inventory: inventory@wis.local / inventory123</p>
          <p>Sales: sales@wis.local / sales123</p>
          <p>Client: client@wis.local / client123</p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`rounded-md px-3 py-2 text-sm ${
              mode === "login" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            className={`rounded-md px-3 py-2 text-sm ${
              mode === "register" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
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
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
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
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
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
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
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
            className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Please wait..." : mode === "login" ? "Sign in" : "Register and continue"}
          </button>
        </form>

        <p className="mt-4 text-xs text-slate-500">
          Middleware checks your demo session role and allows only authorized routes.
        </p>
        <p className="mt-3 text-center text-xs">
          <Link href="/start-fresh" className="text-blue-600 hover:text-blue-800">
            Start fresh (clear all demo cookies)
          </Link>
        </p>
      </section>
    </main>
  );
}
