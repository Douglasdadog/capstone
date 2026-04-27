"use client";

export type OfflineTransaction = {
  id: string;
  path: `/api/${string}`;
  method: "POST" | "PATCH" | "PUT" | "DELETE";
  body: Record<string, unknown>;
  createdAt: string;
};

const STORAGE_KEY = "wis_offline_transaction_queue_v1";
const QUEUE_EVENT_NAME = "wis-offline-queue-updated";

function emitQueueUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(QUEUE_EVENT_NAME));
}

function isValidMethod(value: unknown): value is OfflineTransaction["method"] {
  return value === "POST" || value === "PATCH" || value === "PUT" || value === "DELETE";
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readRawQueue(): OfflineTransaction[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflineTransaction[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => {
      return (
        typeof entry?.id === "string" &&
        typeof entry?.path === "string" &&
        entry.path.startsWith("/api/") &&
        isValidMethod(entry?.method) &&
        typeof entry?.body === "object" &&
        entry?.body !== null &&
        typeof entry?.createdAt === "string"
      );
    });
  } catch {
    return [];
  }
}

function writeRawQueue(entries: OfflineTransaction[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  emitQueueUpdated();
}

export function getQueuedTransactionCount(): number {
  return readRawQueue().length;
}

export function queueOfflineTransaction(
  tx: Omit<OfflineTransaction, "id" | "createdAt">
): OfflineTransaction {
  const entry: OfflineTransaction = {
    ...tx,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString()
  };
  const current = readRawQueue();
  current.push(entry);
  writeRawQueue(current);
  return entry;
}

export function onOfflineQueueUpdated(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const wrapped = () => listener();
  window.addEventListener(QUEUE_EVENT_NAME, wrapped);
  return () => window.removeEventListener(QUEUE_EVENT_NAME, wrapped);
}

export async function flushQueuedTransactions() {
  const queue = readRawQueue();
  if (queue.length === 0) {
    return { total: 0, synced: 0, failed: 0 };
  }

  const remaining: OfflineTransaction[] = [];
  let synced = 0;
  for (const tx of queue) {
    try {
      const response = await fetch(tx.path, {
        method: tx.method,
        headers: {
          "Content-Type": "application/json",
          "x-idempotency-key": tx.id
        },
        body: JSON.stringify(tx.body)
      });
      if (!response.ok) {
        remaining.push(tx);
        continue;
      }
      synced += 1;
    } catch {
      remaining.push(tx);
    }
  }

  writeRawQueue(remaining);
  return { total: queue.length, synced, failed: remaining.length };
}
