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

type HighlightBox = {
  left: number;
  top: number;
  width: number;
  height: number;
  token: number;
};

type ScanToast = {
  value: string;
  token: number;
};

function normalizeBarcodeValue(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function asPoint(value: unknown): { x: number; y: number } | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { x?: unknown; y?: unknown };
  if (typeof candidate.x === "number" && typeof candidate.y === "number") {
    return { x: candidate.x, y: candidate.y };
  }
  return null;
}

export default function InventoryScanningPage() {
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const scannerViewportRef = useRef<HTMLDivElement | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);
  const scanToastTimeoutRef = useRef<number | null>(null);
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
  const [highlightBox, setHighlightBox] = useState<HighlightBox | null>(null);
  const [scanToast, setScanToast] = useState<ScanToast | null>(null);

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
          const rearCandidate = mapped.find((item) => /back|rear|environment/i.test(item.label)) ?? mapped[0];
          setSelectedCameraId((prev) => prev || rearCandidate.id);
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
      if (highlightTimeoutRef.current !== null) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
      if (scanToastTimeoutRef.current !== null) {
        window.clearTimeout(scanToastTimeoutRef.current);
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
  const normalizedPartLookup = useMemo(() => {
    return partKeys.reduce(
      (acc, part) => {
        acc[normalizeBarcodeValue(part)] = part;
        return acc;
      },
      {} as Record<string, string>
    );
  }, [partKeys]);
  const activeTarget = byPart[activePart] ?? 0;
  const activeScanned = scanned[activePart] ?? 0;

  const allMatched = useMemo(() => {
    if (partKeys.length === 0) return false;
    return partKeys.every((part) => (scanned[part] ?? 0) === byPart[part]);
  }, [byPart, partKeys, scanned]);

  function flashHighlight(decodedResult?: unknown) {
    const viewport = scannerViewportRef.current;
    const video = document.querySelector("#manifest-scanner video") as HTMLVideoElement | null;
    const viewportRect = viewport?.getBoundingClientRect();

    let nextBox: HighlightBox | null = null;
    const pointsRaw = (
      decodedResult as {
        result?: {
          resultPoints?: unknown[];
        };
      }
    )?.result?.resultPoints;
    const points = Array.isArray(pointsRaw) ? pointsRaw.map(asPoint).filter(Boolean) as { x: number; y: number }[] : [];

    if (viewportRect && video && points.length >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
      const minX = Math.min(...points.map((point) => point.x));
      const maxX = Math.max(...points.map((point) => point.x));
      const minY = Math.min(...points.map((point) => point.y));
      const maxY = Math.max(...points.map((point) => point.y));

      const containerWidth = viewportRect.width;
      const containerHeight = viewportRect.height;
      const sourceWidth = video.videoWidth;
      const sourceHeight = video.videoHeight;
      const scale = Math.min(containerWidth / sourceWidth, containerHeight / sourceHeight);
      const renderWidth = sourceWidth * scale;
      const renderHeight = sourceHeight * scale;
      const offsetX = (containerWidth - renderWidth) / 2;
      const offsetY = (containerHeight - renderHeight) / 2;

      const left = offsetX + (minX / sourceWidth) * renderWidth;
      const top = offsetY + (minY / sourceHeight) * renderHeight;
      const width = Math.max(28, ((maxX - minX) / sourceWidth) * renderWidth);
      const height = Math.max(28, ((maxY - minY) / sourceHeight) * renderHeight);

      nextBox = {
        left,
        top,
        width,
        height,
        token: Date.now()
      };
    } else if (viewportRect) {
      nextBox = {
        left: viewportRect.width * 0.35,
        top: viewportRect.height * 0.35,
        width: viewportRect.width * 0.3,
        height: viewportRect.height * 0.3,
        token: Date.now()
      };
    }

    if (!nextBox) return;
    setHighlightBox(nextBox);
    if (highlightTimeoutRef.current !== null) {
      window.clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightBox(null);
    }, 520);
  }

  function matchScannedPart(rawCode: string): string | null {
    const normalizedCode = normalizeBarcodeValue(rawCode);
    if (!normalizedCode) return null;
    if (normalizedPartLookup[normalizedCode]) return normalizedPartLookup[normalizedCode];

    // Supplier labels commonly include part code with extra suffix/prefix (e.g., serial chunks).
    for (const [normalizedPart, originalPart] of Object.entries(normalizedPartLookup)) {
      if (normalizedCode.includes(normalizedPart) || normalizedPart.includes(normalizedCode)) {
        return originalPart;
      }
    }
    return null;
  }

  function showScanToast(value: string) {
    setScanToast({ value, token: Date.now() });
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([80, 40, 120]);
    }
    if (scanToastTimeoutRef.current !== null) {
      window.clearTimeout(scanToastTimeoutRef.current);
    }
    scanToastTimeoutRef.current = window.setTimeout(() => {
      setScanToast(null);
    }, 1300);
  }

  async function startScanner() {
    if (cameraOn) return;
    setError(null);
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("manifest-scanner", {
        verbose: false,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.CODABAR,
          Html5QrcodeSupportedFormats.QR_CODE
        ]
      });
      scannerRef.current = scanner;

      const onScan = (decodedText: string, decodedResult: unknown) => {
        const code = decodedText.trim();
        setLastScan(code);
        showScanToast(code);
        flashHighlight(decodedResult);
        if (partKeys.length === 0) {
          setActivePart(code);
          return;
        }
        const matchedPart = matchScannedPart(code);
        if (!matchedPart) return;
        setActivePart(matchedPart);
        setScanned((prev) => {
          const current = prev[matchedPart] ?? 0;
          const max = byPart[matchedPart];
          if (current >= max) return prev;
          return { ...prev, [matchedPart]: current + 1 };
        });
      };

      try {
        await scanner.start(
          selectedCameraId || { facingMode: "environment" },
          {
            fps: 12,
            disableFlip: true
          },
          onScan,
          () => undefined
        );
      } catch {
        await scanner.start(
          { facingMode: { ideal: "environment" } },
          {
            fps: 10,
            disableFlip: true
          },
          onScan,
          () => undefined
        );
      }
      setCameraOn(true);
    } catch (scanError) {
      if (scannerRef.current) {
        await scannerRef.current.stop().catch(() => undefined);
        scannerRef.current.clear();
        scannerRef.current = null;
      }
      setCameraOn(false);
      setError(scanError instanceof Error ? scanError.message : "Unable to start barcode scanner.");
    }
  }

  async function stopScanner() {
    if (!scannerRef.current) return;
    await scannerRef.current.stop().catch(() => undefined);
    scannerRef.current.clear();
    scannerRef.current = null;
    setCameraOn(false);
    setHighlightBox(null);
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
        <div
          ref={scannerViewportRef}
          className="relative mt-3 h-[48vh] min-h-[260px] max-h-[560px] w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
        >
          <div id="manifest-scanner" className="h-full w-full" />
          {scanToast ? (
            <div
              key={scanToast.token}
              className="pointer-events-none absolute left-1/2 top-3 z-20 w-[min(92%,420px)] -translate-x-1/2 rounded-md border border-emerald-300 bg-emerald-50/95 px-3 py-2 text-xs font-semibold text-emerald-800 shadow-sm animate-scan-toast"
            >
              Scan successful: <span className="font-black">{scanToast.value}</span>
            </div>
          ) : null}
          {highlightBox ? (
            <div
              key={highlightBox.token}
              className="pointer-events-none absolute rounded-md border-2 border-emerald-400 shadow-[0_0_0_2px_rgba(16,185,129,0.15)] animate-scan-detect"
              style={{
                left: `${highlightBox.left}px`,
                top: `${highlightBox.top}px`,
                width: `${highlightBox.width}px`,
                height: `${highlightBox.height}px`
              }}
            />
          ) : null}
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

        #manifest-scanner #qr-shaded-region {
          border-width: 0 !important;
          background: transparent !important;
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
          object-fit: contain;
        }

        @keyframes scan-detect {
          0% {
            opacity: 0;
            transform: scale(0.92);
          }
          30% {
            opacity: 1;
            transform: scale(1.02);
          }
          100% {
            opacity: 0;
            transform: scale(1);
          }
        }

        .animate-scan-detect {
          animation: scan-detect 520ms ease-out forwards;
        }

        @keyframes scan-toast {
          0% {
            opacity: 0;
            transform: translate(-50%, -6px);
          }
          15% {
            opacity: 1;
            transform: translate(-50%, 0);
          }
          85% {
            opacity: 1;
            transform: translate(-50%, 0);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -4px);
          }
        }

        .animate-scan-toast {
          animation: scan-toast 1300ms ease-out forwards;
        }
      `}</style>
    </section>
  );
}
