"use client";

import { useMemo, useState } from "react";

type ProvisionPayload = {
  ssid: string;
  password: string;
  device_id: string;
  secret: string;
};

const BAUD_RATE = 115200;

function canUseWebSerial(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((navigator as Navigator & { serial?: unknown }).serial) && window.isSecureContext;
}

export default function SuperAdminIotProvisioningPanel() {
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [deviceId, setDeviceId] = useState("BAT-01");
  const [deviceSecret, setDeviceSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const supported = useMemo(() => canUseWebSerial(), []);

  async function sendProvisioning() {
    if (!supported) {
      setError("Web Serial is unavailable. Use Chrome or Edge over HTTPS.");
      return;
    }
    if (!ssid.trim() || !password.trim() || !deviceId.trim() || !deviceSecret.trim()) {
      setError("SSID, password, device id, and device secret are required.");
      return;
    }

    setBusy(true);
    setError(null);
    setStatus("Connecting to USB serial device...");

    let port: any = null;
    let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;

    try {
      const serial = (navigator as any).serial;
      port = await serial.requestPort();
      await port.open({ baudRate: BAUD_RATE });
      if (!port.writable) {
        throw new Error("Serial port is not writable.");
      }

      setStatus("Sending Wi-Fi provisioning payload to ESP32...");
      writer = port.writable.getWriter();
      const payload: ProvisionPayload = {
        ssid: ssid.trim(),
        password: password.trim(),
        device_id: deviceId.trim(),
        secret: deviceSecret.trim()
      };

      // ESP32 sketch listens for lines prefixed with PROVISION:
      const line = `PROVISION:${JSON.stringify(payload)}\n`;
      const bytes = new TextEncoder().encode(line);
      await writer!.write(bytes);
      setStatus("Provisioning command sent. Device should save and reboot.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to provision device over USB.");
      setStatus(null);
    } finally {
      try {
        if (writer) {
          writer.releaseLock();
        }
      } catch {
        // ignore
      }
      try {
        if (port) {
          await port.close();
        }
      } catch {
        // ignore
      }
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur">
      <h2 className="text-lg font-semibold text-slate-900">IoT USB Provisioning</h2>
      <p className="mt-1 text-sm text-slate-600">
        Connect ESP32 via Type-C, then send SSID and credentials over USB serial from this panel.
      </p>
      {!supported ? (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Web Serial requires Chrome or Edge in a secure context (HTTPS or localhost).
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <input
          value={ssid}
          onChange={(event) => setSsid(event.target.value)}
          placeholder="Wi-Fi SSID"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Wi-Fi Password"
          type="password"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          value={deviceId}
          onChange={(event) => setDeviceId(event.target.value)}
          placeholder="Device ID (BAT-01)"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          value={deviceSecret}
          onChange={(event) => setDeviceSecret(event.target.value)}
          placeholder="Device Secret"
          type="password"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            void sendProvisioning();
          }}
          disabled={busy || !supported}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {busy ? "Provisioning..." : "Provision via USB"}
        </button>
      </div>

      {status ? <p className="mt-3 text-sm text-green-700">{status}</p> : null}
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </section>
  );
}

