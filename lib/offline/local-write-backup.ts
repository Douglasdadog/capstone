"use client";

export type LocalWriteBackupEntry = {
  id: string;
  url: string;
  method: "POST" | "PATCH" | "PUT" | "DELETE";
  body: unknown;
  createdAt: string;
};

export type LocalWriteBackupSnapshot = {
  id: string;
  createdAt: string;
  entries: LocalWriteBackupEntry[];
  serverData?: {
    capturedAt: string;
    inventory?: unknown[];
    shipments?: unknown[];
    salesOrders?: unknown[];
    alerts?: unknown[];
    sensorLogs?: unknown[];
    manifestReports?: unknown[];
    trackingIssues?: unknown[];
    fullBackupPayload?: unknown;
  };
};

const STORAGE_KEY = "wis_local_write_backup_v1";
const SNAPSHOT_STORAGE_KEY = "wis_local_write_backup_snapshots_v1";
const MAX_ENTRIES = 500;
const MAX_SNAPSHOTS = 50;
const BACKUP_EVENT_NAME = "wis-local-write-backup-updated";
const MASKED_VALUE = "***MASKED***";
const SENSITIVE_KEYS = new Set([
  "password",
  "currentpassword",
  "newpassword",
  "confirmpassword",
  "otp",
  "otpcode",
  "token",
  "secret",
  "authorization",
  "apikey",
  "api_key",
  "device_secret",
  "bearer"
]);

declare global {
  interface Window {
    __wisWriteBackupInstalled?: boolean;
  }
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function emitBackupUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(BACKUP_EVENT_NAME));
}

function readBackups(): LocalWriteBackupEntry[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalWriteBackupEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((entry) => ({
      ...entry,
      url: typeof entry?.url === "string" ? sanitizeApiPath(entry.url) : "/api/unknown",
      body: sanitizeUnknown(entry?.body)
    }));
  } catch {
    return [];
  }
}

function writeBackups(entries: LocalWriteBackupEntry[]) {
  if (!canUseStorage()) return;
  const trimmed = entries.slice(-MAX_ENTRIES);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  emitBackupUpdated();
}

function normalizeMethod(method: string | undefined): LocalWriteBackupEntry["method"] | null {
  const upper = (method ?? "GET").toUpperCase();
  if (upper === "POST" || upper === "PATCH" || upper === "PUT" || upper === "DELETE") return upper;
  return null;
}

function normalizeApiPath(input: string): string | null {
  if (input.startsWith("/api/")) return input;
  try {
    const parsed = new URL(input, window.location.origin);
    if (parsed.origin !== window.location.origin) return null;
    if (!parsed.pathname.startsWith("/api/")) return null;
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

function sanitizeApiPath(input: string): string {
  try {
    const parsed = new URL(input, window.location.origin);
    const sensitiveParams = ["token", "secret", "password", "otp", "api_key", "apikey"];
    for (const key of sensitiveParams) {
      if (parsed.searchParams.has(key)) {
        parsed.searchParams.set(key, MASKED_VALUE);
      }
    }
    const safePath = `${parsed.pathname}${parsed.search}`;
    return safePath.startsWith("/api/") ? safePath : "/api/unknown";
  } catch {
    return input.startsWith("/api/") ? input : "/api/unknown";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeUnknown(value: unknown, parentKey = ""): unknown {
  const key = parentKey.toLowerCase();
  if (SENSITIVE_KEYS.has(key)) return MASKED_VALUE;
  if (typeof value === "string") {
    if (key.includes("password") || key.includes("otp") || key.includes("secret") || key.includes("token")) {
      return MASKED_VALUE;
    }
    if (key === "authorization" && value.trim().length > 0) return MASKED_VALUE;
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeUnknown(entry, parentKey));
  }
  if (isPlainObject(value)) {
    const next: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      const lowered = entryKey.toLowerCase();
      if (SENSITIVE_KEYS.has(lowered)) {
        next[entryKey] = MASKED_VALUE;
      } else {
        next[entryKey] = sanitizeUnknown(entryValue, entryKey);
      }
    }
    return next;
  }
  return value;
}

function safeParseBody(body: BodyInit | null | undefined): unknown {
  if (typeof body !== "string") return sanitizeUnknown(body ?? null);
  try {
    return sanitizeUnknown(JSON.parse(body));
  } catch {
    return sanitizeUnknown(body);
  }
}

function appendBackup(entry: Omit<LocalWriteBackupEntry, "id" | "createdAt">) {
  const current = readBackups();
  current.push({
    ...entry,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString()
  });
  writeBackups(current);
}

export function installLocalWriteBackupInterceptor() {
  if (typeof window === "undefined") return;
  if (window.__wisWriteBackupInstalled) return;
  window.__wisWriteBackupInstalled = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = normalizeMethod(init?.method ?? (typeof input !== "string" && !(input instanceof URL) ? input.method : undefined));
    const apiPath = normalizeApiPath(requestUrl);
    if (method && apiPath) {
      appendBackup({
        url: sanitizeApiPath(apiPath),
        method,
        body: safeParseBody(init?.body)
      });
    }
    return originalFetch(input, init);
  };
}

export function getLocalWriteBackups(): LocalWriteBackupEntry[] {
  return readBackups();
}

export function getLocalWriteBackupCount(): number {
  return readBackups().length;
}

export function clearLocalWriteBackups() {
  writeBackups([]);
}

export function onLocalWriteBackupUpdated(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const wrapped = () => listener();
  window.addEventListener(BACKUP_EVENT_NAME, wrapped);
  return () => window.removeEventListener(BACKUP_EVENT_NAME, wrapped);
}

function readSnapshots(): LocalWriteBackupSnapshot[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalWriteBackupSnapshot[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSnapshots(snapshots: LocalWriteBackupSnapshot[]) {
  if (!canUseStorage()) return;
  const trimmed = snapshots.slice(-MAX_SNAPSHOTS);
  window.localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(trimmed));
}

export function createLocalWriteBackupSnapshot(serverData?: LocalWriteBackupSnapshot["serverData"]): LocalWriteBackupSnapshot {
  const entries = readBackups();
  const snapshots = readSnapshots();
  const snapshot: LocalWriteBackupSnapshot = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    entries,
    serverData
  };
  snapshots.push(snapshot);
  writeSnapshots(snapshots);
  return snapshot;
}

export function getLocalWriteBackupSnapshots(): LocalWriteBackupSnapshot[] {
  return readSnapshots();
}

