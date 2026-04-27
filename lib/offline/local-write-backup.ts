"use client";

export type LocalWriteBackupEntry = {
  id: string;
  url: string;
  method: "POST" | "PATCH" | "PUT" | "DELETE";
  body: unknown;
  createdAt: string;
};

const STORAGE_KEY = "wis_local_write_backup_v1";
const MAX_ENTRIES = 500;
const BACKUP_EVENT_NAME = "wis-local-write-backup-updated";

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
    return Array.isArray(parsed) ? parsed : [];
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

function safeParseBody(body: BodyInit | null | undefined): unknown {
  if (typeof body !== "string") return body ?? null;
  try {
    return JSON.parse(body);
  } catch {
    return body;
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
        url: apiPath,
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

