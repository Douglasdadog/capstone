"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";

type ScanToast = {
  value: string;
  token: number;
};

export default function PublicScannerPage() {
  const params = useParams<{ token: string }>();
  const token = useMemo(() => String(params?.token ?? ""), [params]);
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const scanToastTimeoutRef = useRef<number | null>(null);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraDevices, setCameraDevices] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [scanToast, setScanToast] = useState<ScanToast | null>(null);

  useEffect(() => {
    let active = true;
    async function consume() {
      const response = await fetch("/api/public/scanner-link/consume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
      const payload = (await response.json()) as { error?: string };
      if (!active) return;
      if (!response.ok) {
        setError(payload.error ?? "Scanner link unavailable.");
        setLoading(false);
        return;
      }
      setAllowed(true);
      setLoading(false);
    }
    if (token) {
      void consume();
    } else {
      setError("Invalid scanner link.");
      setLoading(false);
    }
    return () => {
      active = false;
    };
  }, [token]);

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
          const rearCandidate =
            mapped.find((item) => /back|rear|environment/i.test(item.label)) ?? mapped[0];
          setSelectedCameraId(rearCandidate.id);
        }
      } catch {
        if (alive) setCameraDevices([]);
      }
    }
    if (allowed) void loadCameras();
    return () => {
      alive = false;
    };
  }, [allowed]);

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        void scannerRef.current.stop().catch(() => undefined);
        scannerRef.current.clear();
      }
      if (scanToastTimeoutRef.current !== null) {
        window.clearTimeout(scanToastTimeoutRef.current);
      }
    };
  }, []);

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
    if (cameraOn || !allowed) return;
    setError(null);
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("public-scanner", {
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
      try {
        await scanner.start(
          selectedCameraId || { facingMode: "environment" },
          { fps: 12, disableFlip: true },
          (decodedText) => {
            const value = decodedText.trim();
            setLastScan(value);
            showScanToast(value);
          },
          () => undefined
        );
      } catch {
        await scanner.start(
          { facingMode: { ideal: "environment" } },
          { fps: 10, disableFlip: true },
          (decodedText) => {
            const value = decodedText.trim();
            setLastScan(value);
            showScanToast(value);
          },
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
      setError(scanError instanceof Error ? scanError.message : "Unable to start camera.");
    }
  }

  async function stopScanner() {
    if (!scannerRef.current) return;
    await scannerRef.current.stop().catch(() => undefined);
    scannerRef.current.clear();
    scannerRef.current = null;
    setCameraOn(false);
  }

  if (loading) {
    return <section className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-5">Preparing scanner...</section>;
  }

  if (!allowed) {
    return (
      <section className="mx-auto max-w-2xl rounded-xl border border-red-200 bg-red-50 p-5 text-red-700">
        {error ?? "Scanner link is not valid anymore. Please request a new QR link."}
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <h1 className="text-xl font-black text-slate-900">Phone Barcode Scanner</h1>
      <p className="text-sm text-slate-600">No login needed. Scan barcodes directly using this camera page.</p>
      {lastScan ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Last scan: {lastScan}
        </p>
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        {cameraDevices.length > 0 ? (
          <select
            value={selectedCameraId}
            onChange={(event) => setSelectedCameraId(event.target.value)}
            disabled={cameraOn}
            className="min-w-[220px] rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
          >
            {cameraDevices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.label}
              </option>
            ))}
          </select>
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
      <div className="relative h-[56vh] min-h-[320px] max-h-[720px] overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        <div id="public-scanner" className="h-full w-full" />
        {scanToast ? (
          <div
            key={scanToast.token}
            className="pointer-events-none absolute left-1/2 top-3 z-20 w-[min(92%,420px)] -translate-x-1/2 rounded-md border border-emerald-300 bg-emerald-50/95 px-3 py-2 text-xs font-semibold text-emerald-800 shadow-sm animate-scan-toast"
          >
            Scan successful: <span className="font-black">{scanToast.value}</span>
          </div>
        ) : null}
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <style jsx global>{`
        #public-scanner,
        #public-scanner > div,
        #public-scanner__scan_region {
          height: 100% !important;
          max-height: 100% !important;
        }
        #public-scanner #qr-shaded-region {
          border-width: 0 !important;
          background: transparent !important;
        }
        #public-scanner video,
        #public-scanner canvas {
          width: 100% !important;
          height: 100% !important;
          object-fit: contain;
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
