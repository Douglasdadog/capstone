import { NextRequest, NextResponse } from "next/server";
import { requireDemoSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEMO_PERMISSIONS_COOKIE,
  DEMO_USERS_COOKIE,
  getSampleUsers,
  readPermissions,
  readRegisteredUsers
} from "@/lib/auth/demo-auth";

type TableDumpResult = {
  rows: unknown[];
  warning: string | null;
};

const REDACTED = "***REDACTED***";
const SENSITIVE_KEYS = new Set([
  "password",
  "newpassword",
  "currentpassword",
  "confirmpassword",
  "secret",
  "device_secret",
  "token",
  "access_token",
  "refresh_token",
  "otp",
  "otpcode",
  "authorization",
  "apikey",
  "api_key"
]);

function sanitizeForBackup(value: unknown, parentKey = ""): unknown {
  const normalizedKey = parentKey.toLowerCase();
  if (normalizedKey && SENSITIVE_KEYS.has(normalizedKey)) {
    return REDACTED;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForBackup(item));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
      key,
      sanitizeForBackup(nestedValue, key)
    ]);
    return Object.fromEntries(entries);
  }
  return value;
}

async function dumpTable(
  table: string,
  options?: { orderBy?: string; ascending?: boolean }
): Promise<TableDumpResult> {
  try {
    const supabase = createAdminClient();
    let query = supabase.from(table).select("*");
    if (options?.orderBy) {
      query = query.order(options.orderBy, { ascending: options.ascending ?? false });
    }
    const { data, error } = await query;
    if (error) return { rows: [], warning: `${table}: ${error.message}` };
    return { rows: (sanitizeForBackup(data ?? []) as unknown[]) ?? [], warning: null };
  } catch (error) {
    return { rows: [], warning: `${table}: ${error instanceof Error ? error.message : "unknown error"}` };
  }
}

export async function GET(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.session.role !== "SuperAdmin") {
    return NextResponse.json({ error: "Super Admin access required." }, { status: 403 });
  }

  const warnings: string[] = [];
  const captureWarning = (warning: string | null) => {
    if (warning) warnings.push(warning);
  };

  const [
    inventoryDump,
    alertsDump,
    manifestsDump,
    manifestItemsDump,
    manifestScanEventsDump,
    manifestReportsDump,
    shipmentsDump,
    shipmentItemsDump,
    trackingIssuesDump,
    sensorLogsDump,
    sensorAlertNotificationsDump,
    sensorAlertConfigDump,
    mfaResetRequestsDump,
    idempotencyKeysDump
  ] = await Promise.all([
    dumpTable("inventory", { orderBy: "updated_at", ascending: false }),
    dumpTable("auto_replenishment_alerts", { orderBy: "created_at", ascending: false }),
    dumpTable("manifests", { orderBy: "updated_at", ascending: false }),
    dumpTable("manifest_items", { orderBy: "updated_at", ascending: false }),
    dumpTable("manifest_scan_events", { orderBy: "created_at", ascending: false }),
    dumpTable("manifest_reports", { orderBy: "created_at", ascending: false }),
    dumpTable("shipments", { orderBy: "updated_at", ascending: false }),
    dumpTable("shipment_items", { orderBy: "created_at", ascending: false }),
    dumpTable("tracking_issues", { orderBy: "created_at", ascending: false }),
    dumpTable("sensor_logs", { orderBy: "created_at", ascending: false }),
    dumpTable("sensor_alert_notifications", { orderBy: "created_at", ascending: false }),
    dumpTable("sensor_alert_config", { orderBy: "updated_at", ascending: false }),
    dumpTable("mfa_reset_requests", { orderBy: "created_at", ascending: false }),
    dumpTable("idempotency_keys", { orderBy: "created_at", ascending: false })
  ]);

  captureWarning(inventoryDump.warning);
  captureWarning(alertsDump.warning);
  captureWarning(manifestsDump.warning);
  captureWarning(manifestItemsDump.warning);
  captureWarning(manifestScanEventsDump.warning);
  captureWarning(manifestReportsDump.warning);
  captureWarning(shipmentsDump.warning);
  captureWarning(shipmentItemsDump.warning);
  captureWarning(trackingIssuesDump.warning);
  captureWarning(sensorLogsDump.warning);
  captureWarning(sensorAlertNotificationsDump.warning);
  captureWarning(sensorAlertConfigDump.warning);
  captureWarning(mfaResetRequestsDump.warning);
  captureWarning(idempotencyKeysDump.warning);

  let supabaseUsers: unknown[] = [];
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.listUsers();
    if (error) {
      warnings.push(`supabase-auth-users: ${error.message}`);
    } else {
      supabaseUsers = (sanitizeForBackup(data?.users ?? []) as unknown[]) ?? [];
    }
  } catch (error) {
    warnings.push(`supabase-auth-users: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  const rawRegisteredUsers = readRegisteredUsers(request.cookies.get(DEMO_USERS_COOKIE)?.value);
  const rawSampleUsers = getSampleUsers();
  const rawPermissions = readPermissions(request.cookies.get(DEMO_PERMISSIONS_COOKIE)?.value);
  const registeredUsers = sanitizeForBackup(rawRegisteredUsers);
  const sampleUsers = sanitizeForBackup(rawSampleUsers);
  const permissions = sanitizeForBackup(rawPermissions);

  const payload = {
    backupVersion: "1.0.0",
    capturedAt: new Date().toISOString(),
    modules: {
      auth: {
        supabaseUsers,
        sampleUsers,
        registeredUsers,
        permissions,
        mfaResetRequests: sanitizeForBackup(mfaResetRequestsDump.rows)
      },
      inventory: {
        inventory: sanitizeForBackup(inventoryDump.rows),
        manifests: sanitizeForBackup(manifestsDump.rows),
        manifestItems: sanitizeForBackup(manifestItemsDump.rows),
        manifestScanEvents: sanitizeForBackup(manifestScanEventsDump.rows),
        manifestReports: sanitizeForBackup(manifestReportsDump.rows),
        alerts: sanitizeForBackup(alertsDump.rows)
      },
      logistics: {
        salesOrders: sanitizeForBackup(shipmentsDump.rows),
        shipments: sanitizeForBackup(shipmentsDump.rows),
        shipmentItems: sanitizeForBackup(shipmentItemsDump.rows),
        trackingIssues: sanitizeForBackup(trackingIssuesDump.rows)
      },
      iot: {
        sensorLogs: sanitizeForBackup(sensorLogsDump.rows),
        sensorAlertNotifications: sanitizeForBackup(sensorAlertNotificationsDump.rows),
        sensorAlertConfig: sanitizeForBackup(sensorAlertConfigDump.rows)
      },
      system: {
        idempotencyKeys: sanitizeForBackup(idempotencyKeysDump.rows)
      }
    },
    counts: {
      supabaseUsers: supabaseUsers.length,
      sampleUsers: rawSampleUsers.length,
      registeredUsers: rawRegisteredUsers.length,
      inventory: inventoryDump.rows.length,
      manifests: manifestsDump.rows.length,
      manifestItems: manifestItemsDump.rows.length,
      manifestReports: manifestReportsDump.rows.length,
      salesOrders: shipmentsDump.rows.length,
      shipmentItems: shipmentItemsDump.rows.length,
      trackingIssues: trackingIssuesDump.rows.length,
      sensorLogs: sensorLogsDump.rows.length,
      mfaResetRequests: mfaResetRequestsDump.rows.length
    },
    warnings
  };

  return NextResponse.json(payload);
}

