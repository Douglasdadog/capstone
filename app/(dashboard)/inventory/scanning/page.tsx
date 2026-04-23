"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type Manifest = {
  id: string;
  file_name: string;
  status: string;
  created_at: string;
};

type ManifestItem = {
  id: string;
  part_number: string;
  quantity: number;
  batch_id: string;
};

export default function InventoryScanningPage() {
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const [loading, setLoading] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraDevices, setCameraDevices] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [items, setItems] = useState<ManifestItem[]>([]);
  const [scanned, setScanned] = useState<Record<string, number>>({});
  const [activePart, setActivePart] = useState<string>("");
  const [lastScan, setLastScan] = useState<string | null>(null);

  useEffect(() => {
    async function loadPending() {
      const response = await fetch("/api/inventory/manifests/pending");
      const payload = (await response.json()) as { error?: string; manifest: Manifest | null; items: ManifestItem[] };
      if (!response.ok) {
        setError(payload.error ?? "Unable to fetch pending manifest.");
        setLoading(false);
        return;
      }
      setManifest(payload.manifest);
      setItems(payload.items ?? []);
      if ((payload.items ?? []).length > 0) {
        setActivePart(payload.items[0].part_number);
      }
      setLoading(false);
    }
    void loadPending();
  }, []);

  useEffect(() => {
    let alive = true;
    async function loadCameras() {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const devices = await Html5Qrcode.getCameras();
        if (!alive) return;

        const mapped = devices.map((device, index) => ({
          id: device.id,
          label: device.label || `Camera ${index + 1}`
        }));
        setCameraDevices(mapped);
        if (mapped.length > 0) {
          setSelectedCameraId((prev) => prev || mapped[0].id);
        }
      } catch {
        if (alive) {
          setCameraDevices([]);
        }
      }
    }
    void loadCameras();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        void scannerRef.current.stop().catch(() => undefined);
        scannerRef.current.clear();
      }
    };
  }, []);

  const byPart = useMemo(() => {
    return items.reduce(
      (acc, row) => {
        acc[row.part_number] = (acc[row.part_number] ?? 0) + Number(row.quantity ?? 0);
        return acc;
      },
      {} as Record<string, number>
    );
  }, [items]);

  const partKeys = useMemo(() => Object.keys(byPart), [byPart]);
  const activeTarget = byPart[activePart] ?? 0;
  const activeScanned = scanned[activePart] ?? 0;

  const allMatched = useMemo(() => {
    if (partKeys.length === 0) return false;
    return partKeys.every((part) => (scanned[part] ?? 0) === byPart[part]);
  }, [byPart, partKeys, scanned]);

  async function startScanner() {
    if (cameraOn) return;
    setError(null);
    const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
    const scanner = new Html5Qrcode("manifest-scanner");
    scannerRef.current = scanner;

    await scanner.start(
      selectedCameraId || { facingMode: "environment" },
      {
        fps: 10,
        qrbox: { width: 320, height: 120 },
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.CODABAR
        ]
      },
      (decodedText: string) => {
        const code = decodedText.trim();
        setLastScan(code);
        if (partKeys.length === 0) {
          setActivePart(code);
          return;
        }
        if (!byPart[code]) return;
        setActivePart(code);
        setScanned((prev) => {
          const current = prev[code] ?? 0;
          const max = byPart[code];
          if (current >= max) return prev;
          return { ...prev, [code]: current + 1 };
        });
      },
      () => undefined
    );
    setCameraOn(true);
  }

  async function stopScanner() {
    if (!scannerRef.current) return;
    await scannerRef.current.stop().catch(() => undefined);
    scannerRef.current.clear();
    scannerRef.current = null;
    setCameraOn(false);
  }

  async function completeManifest() {
    if (!manifest) return;
    const response = await fetch(`/api/inventory/manifests/${manifest.id}/complete`, {
      method: "POST"
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Unable to complete manifest.");
      return;
    }
    window.location.href = "/inventory";
  }

  if (loading) return <section className="rounded-xl border border-slate-200 bg-white p-5">Loading scanner...</section>;

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h1 className="text-xl font-black text-slate-900">Mobile Barcode Scanning</h1>
        {manifest ? (
          <p className="mt-1 text-xs text-slate-600">
            Manifest: {manifest.file_name} • {new Date(manifest.created_at).toLocaleString()}
          </p>
        ) : (
          <p className="mt-1 text-xs text-slate-600">
            Quick scan mode is active. Barcode scanning works even without a pending manifest.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        {manifest ? (
          <p className="text-base font-semibold text-slate-800">
            Part: <span className="text-red-600">{activePart || "N/A"}</span> | {activeScanned}/{activeTarget} Scanned
          </p>
        ) : (
          <p className="text-base font-semibold text-slate-800">
            Last decoded barcode: <span className="text-red-600">{activePart || "N/A"}</span>
          </p>
        )}
        {lastScan ? <p className="mt-1 text-xs text-slate-500">Last scan: {lastScan}</p> : null}
        <div className="mt-3 flex flex-wrap items-end gap-2">
          {cameraDevices.length > 0 ? (
            <div className="min-w-[260px] max-w-sm flex-1">
              <label
                htmlFor="camera-device"
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
              >
                Camera Device
              </label>
              <select
                id="camera-device"
                value={selectedCameraId}
                onChange={(event) => setSelectedCameraId(event.target.value)}
                disabled={cameraOn}
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700 disabled:opacity-60"
              >
                {cameraDevices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => void startScanner()}
            disabled={cameraOn}
            className="rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Start Camera
          </button>
          <button
            type="button"
            onClick={() => void stopScanner()}
            disabled={!cameraOn}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
          >
            Stop Camera
          </button>
        </div>
        <div className="mt-3 h-[38vh] min-h-[220px] max-h-[420px] w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          <div id="manifest-scanner" className="h-full w-full" />
        </div>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </div>

      {manifest ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Parts Counter</h2>
          <div className="mt-3 space-y-2">
            {partKeys.map((part) => {
              const target = byPart[part];
              const value = scanned[part] ?? 0;
              const done = value === target;
              return (
                <button
                  key={part}
                  type="button"
                  onClick={() => setActivePart(part)}
                  className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left ${
                    activePart === part ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"
                  }`}
                >
                  <span className="text-sm font-semibold text-slate-800">{part}</span>
                  <span className={`text-xs font-semibold ${done ? "text-green-600" : "text-slate-600"}`}>
                    {value}/{target}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {manifest ? (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void completeManifest()}
            disabled={!allMatched}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
          >
            Complete Verification
          </button>
          {!allMatched ? (
            <Link
              href={`/inventory/scanning/report?manifestId=${manifest.id}`}
              className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700"
            >
              Make Report
            </Link>
          ) : null}
        </div>
      ) : null}

      <style jsx global>{`
        #manifest-scanner {
          height: 100% !important;
          max-height: 100% !important;
        }

        #manifest-scanner__scan_region {
          height: 100% !important;
          max-height: 100% !important;
          overflow: hidden !important;
        }

        #manifest-scanner > div {
          height: 100%;
          max-height: 100%;
        }

        #manifest-scanner video,
        #manifest-scanner canvas {
          width: 100% !important;
          height: 100% !important;
          max-height: 100% !important;
          object-fit: cover;
        }
      `}</style>
    </section>
  );
}
