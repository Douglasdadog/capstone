"use client";

import { useEffect, useState } from "react";

export default function StartFreshPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function reset() {
      try {
        const response = await fetch("/api/auth/demo-reset", { method: "POST" });
        if (!response.ok) {
          const data = (await response.json()) as { error?: string };
          setError(data.error ?? "Reset failed.");
          return;
        }
        window.location.replace("/login?fresh=1");
      } catch {
        setError("Network error while resetting.");
      }
    }
    void reset();
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 px-6">
      <p className="text-slate-700">{error ? error : "Clearing demo session and data…"}</p>
      {!error ? <p className="text-sm text-slate-500">You will be redirected to the login page.</p> : null}
    </main>
  );
}
