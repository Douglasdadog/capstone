import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";

const REMOTE_TIMEOUT_MS = 8000;

/**
 * Verifies paths your deployment will use:
 * 1) Supabase `sensor_logs` is reachable (same path as GET /api/iot/environment).
 * 2) Optional: set WIS_IOT_HEALTH_URL to your gateway/device HTTP health endpoint.
 */
export async function POST(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  if (auth.session.role !== "Admin" && auth.session.role !== "SuperAdmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let databaseOk = false;
  let databaseMessage: string | undefined;

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("sensor_logs").select("id").limit(1);
    if (error) {
      databaseMessage = error.message;
    } else {
      databaseOk = true;
    }
  } catch (e) {
    databaseMessage = e instanceof Error ? e.message : "Database check failed";
  }

  const healthUrl = process.env.WIS_IOT_HEALTH_URL?.trim();
  let remote:
    | { configured: false }
    | { configured: true; ok: boolean; status?: number; message?: string } = { configured: false };

  if (healthUrl) {
    remote = { configured: true, ok: false };
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);
      const res = await fetch(healthUrl, {
        method: "GET",
        signal: controller.signal,
        headers: { Accept: "application/json, text/plain, */*" }
      });
      clearTimeout(t);
      remote = {
        configured: true,
        ok: res.ok,
        status: res.status,
        message: res.ok ? "Reachable" : `HTTP ${res.status}`
      };
    } catch (e) {
      remote = {
        configured: true,
        ok: false,
        message: e instanceof Error ? e.message : "Request failed"
      };
    }
  }

  const ok =
    databaseOk && (!remote.configured || remote.ok);

  let summary: string;
  if (!databaseOk) {
    summary = `Database: not ready${databaseMessage ? ` (${databaseMessage})` : ""}.`;
  } else if (remote.configured && !remote.ok) {
    summary = `Database OK; IoT health URL failed: ${remote.message ?? "error"}.`;
  } else if (remote.configured && remote.ok) {
    summary = "Database OK; IoT health endpoint OK.";
  } else {
    summary =
      "Database OK. Set WIS_IOT_HEALTH_URL in .env.local to probe your gateway (optional).";
  }

  return NextResponse.json({
    ok,
    database: {
      ok: databaseOk,
      message: databaseMessage
    },
    remote,
    summary
  });
}
