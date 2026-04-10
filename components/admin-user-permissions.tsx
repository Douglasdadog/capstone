"use client";

import { useEffect, useState } from "react";

type UserRow = {
  email: string;
  role: string;
  extraRoutes: string[];
};

type RouteOption = string;

export default function AdminUserPermissions() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/admin/permissions");
    const data = (await response.json()) as {
      users?: UserRow[];
      grantableRoutes?: RouteOption[];
      error?: string;
    };
    if (!response.ok) {
      setError(data.error ?? "Unable to load permissions.");
      return;
    }
    setUsers(data.users ?? []);
    setRouteOptions(data.grantableRoutes ?? []);
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  async function togglePermission(email: string, route: string, checked: boolean) {
    setMessage(null);
    setError(null);
    const current = users.find((user) => user.email === email)?.extraRoutes ?? [];
    const nextRoutes = checked
      ? [...new Set([...current, route])]
      : current.filter((entry) => entry !== route);

    const response = await fetch("/api/admin/permissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, extraRoutes: nextRoutes })
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(data.error ?? "Unable to update permissions.");
      return;
    }
    setMessage(`Permissions updated for ${email}`);
    await load();
  }

  async function resetAllCustomPermissions() {
    const ok = window.confirm(
      "Reset all custom permissions? This removes every extra panel grant for all users. Your base role access stays the same."
    );
    if (!ok) return;

    setMessage(null);
    setError(null);
    const response = await fetch("/api/admin/permissions", {
      method: "DELETE"
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(data.error ?? "Unable to reset custom permissions.");
      return;
    }
    setMessage("All custom permissions have been reset.");
    await load();
  }

  return (
    <div className="space-y-4 rounded-2xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">User permissions</h2>
        <p className="mt-1 text-sm text-slate-600">
          Grant extra panel visibility and route access per user for this demo environment.
        </p>
        <button
          type="button"
          onClick={() => {
            void resetAllCustomPermissions();
          }}
          className="mt-3 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-100"
        >
          Reset All Custom Permissions
        </button>
      </div>

      {message ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 shadow-sm">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
          {error}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white/95 shadow-inner">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Extra Panels</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.email} className="border-t border-slate-100 align-top">
                <td className="px-4 py-3 font-medium text-slate-800">{user.email}</td>
                <td className="px-4 py-3">{user.role}</td>
                <td className="px-4 py-3">
                  <div className="grid gap-2 md:grid-cols-2">
                    {routeOptions.map((route) => {
                      const checked = user.extraRoutes.includes(route);
                      return (
                        <label key={`${user.email}-${route}`} className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) =>
                              void togglePermission(user.email, route, event.target.checked)
                            }
                          />
                          {route}
                        </label>
                      );
                    })}
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={3}>
                  No users available.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
