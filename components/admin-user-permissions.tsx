"use client";

import { useEffect, useState } from "react";
import { ROLE_ACCESS, UserRole } from "@/lib/auth/roles";

type UserRow = {
  email: string;
  role: UserRole;
  extraRoutes: string[];
  isSample?: boolean;
};

type RouteOption = string;
const roles: UserRole[] = ["SuperAdmin", "Admin", "Inventory", "Sales", "Client"];

export default function AdminUserPermissions() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteEmail, setPendingDeleteEmail] = useState<string | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");

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

  async function updateRole(email: string, role: UserRole) {
    setMessage(null);
    setError(null);
    const response = await fetch("/api/admin/permissions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "updateRole", email, role })
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(data.error ?? "Unable to update role.");
      return;
    }
    setMessage(`Role updated for ${email}`);
    await load();
  }

  async function deleteAccount(email: string) {
    const ok = window.confirm(`Delete account ${email}? This cannot be undone.`);
    if (!ok) return;

    setMessage(null);
    setError(null);
    const response = await fetch("/api/admin/permissions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deleteUser", email })
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(data.error ?? "Unable to delete account.");
      return;
    }
    setMessage(`Deleted account: ${email}`);
    setPendingDeleteEmail(null);
    setDeleteConfirmInput("");
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
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 shadow-sm">
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
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.email} className="border-t border-slate-100 align-top">
                <td className="px-4 py-3 font-medium text-slate-800">{user.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={user.role}
                    onChange={(event) => void updateRole(user.email, event.target.value as UserRole)}
                    disabled={Boolean(user.isSample)}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    {roles.map((role) => (
                      <option key={`${user.email}-${role}`} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                  {user.isSample ? (
                    <p className="mt-1 text-[11px] text-slate-500">Sample account (role locked)</p>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <div className="grid gap-2 md:grid-cols-2">
                    {routeOptions.map((route) => {
                      const checked = user.extraRoutes.includes(route);
                      const roleHasRoute = ROLE_ACCESS[user.role]?.includes(route);
                      return (
                        <label
                          key={`${user.email}-${route}`}
                          className={`flex items-center gap-2 text-xs ${
                            roleHasRoute ? "text-slate-400" : "text-slate-700"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={roleHasRoute || checked}
                            disabled={roleHasRoute}
                            onChange={(event) =>
                              void togglePermission(user.email, route, event.target.checked)
                            }
                          />
                          {route}
                          {roleHasRoute ? " (from role)" : ""}
                        </label>
                      );
                    })}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => {
                      setPendingDeleteEmail(user.email);
                      setDeleteConfirmInput("");
                    }}
                    disabled={Boolean(user.isSample)}
                    className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    Delete
                  </button>
                  {user.isSample ? (
                    <p className="mt-1 text-[11px] text-slate-500">Sample account cannot be deleted.</p>
                  ) : null}
                </td>
              </tr>
            ))}
            {users.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={4}>
                  No users available.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {pendingDeleteEmail ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">Confirm account deletion</h3>
            <p className="mt-2 text-sm text-slate-600">
              Type this email exactly to confirm permanent delete:
            </p>
            <p className="mt-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-semibold text-slate-800">
              {pendingDeleteEmail}
            </p>
            <input
              type="text"
              value={deleteConfirmInput}
              onChange={(event) => setDeleteConfirmInput(event.target.value)}
              placeholder="Enter exact email"
              className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPendingDeleteEmail(null);
                  setDeleteConfirmInput("");
                }}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteConfirmInput.trim().toLowerCase() !== pendingDeleteEmail}
                onClick={() => {
                  void deleteAccount(pendingDeleteEmail);
                }}
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
              >
                Delete Account
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}


