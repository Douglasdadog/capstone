"use client";

import { useEffect, useState } from "react";
import { queueOfflineTransaction } from "@/lib/offline/transaction-queue";

type SensorAlertConfig = {
  warning_threshold_c: number;
  critical_threshold_c: number;
  cooldown_minutes: number;
  alert_email: string | null;
  updated_at: string;
};

export default function SuperAdminSensorAlertSettings() {
  const [config, setConfig] = useState<SensorAlertConfig | null>(null);
  const [warning, setWarning] = useState("40");
  const [critical, setCritical] = useState("50");
  const [cooldown, setCooldown] = useState("10");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingAlert, setSendingAlert] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/admin/sensor-alert-config");
        const payload = (await response.json()) as {
          error?: string;
          config?: SensorAlertConfig;
          setupRequired?: boolean;
          setupMessage?: string;
        };
        if (!response.ok || !payload.config) {
          throw new Error(payload.error ?? "Unable to load sensor alert settings.");
        }
        setConfig(payload.config);
        setSetupRequired(Boolean(payload.setupRequired));
        setSetupMessage(payload.setupMessage ?? null);
        setWarning(String(payload.config.warning_threshold_c));
        setCritical(String(payload.config.critical_threshold_c));
        setCooldown(String(payload.config.cooldown_minutes));
        setEmail(payload.config.alert_email ?? "");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unable to load sensor alert settings.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payloadBody = {
        warning_threshold_c: warning,
        critical_threshold_c: critical,
        cooldown_minutes: cooldown,
        alert_email: email
      };
      if (!window.navigator.onLine) {
        queueOfflineTransaction({
          path: "/api/admin/sensor-alert-config",
          method: "PATCH",
          body: payloadBody
        });
        setMessage("Offline: threshold changes queued. Sync when online.");
        return;
      }
      const response = await fetch("/api/admin/sensor-alert-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadBody)
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; config?: SensorAlertConfig };
      if (!response.ok || !payload.config) {
        throw new Error(payload.error ?? "Unable to save settings.");
      }
      setConfig(payload.config);
      setMessage("Sensor alert settings saved.");
    } catch (e) {
      if (e instanceof TypeError || !window.navigator.onLine) {
        queueOfflineTransaction({
          path: "/api/admin/sensor-alert-config",
          method: "PATCH",
          body: {
            warning_threshold_c: warning,
            critical_threshold_c: critical,
            cooldown_minutes: cooldown,
            alert_email: email
          }
        });
        setError(null);
        setMessage("Network issue: threshold changes queued.");
        return;
      }
      setError(e instanceof Error ? e.message : "Unable to save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function sendAlert() {
    setSendingAlert(true);
    setError(null);
    setMessage(null);
    try {
      if (!window.navigator.onLine) {
        queueOfflineTransaction({
          path: "/api/admin/sensor-alert-config",
          method: "POST",
          body: { email }
        });
        setMessage("Offline: alert-send request queued. Sync when online.");
        return;
      }
      const response = await fetch("/api/admin/sensor-alert-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const payload = (await response.json()) as { ok?: boolean; message?: string; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Unable to send alert.");
      }
      setMessage(payload.message ?? "Alert sent.");
    } catch (e) {
      if (e instanceof TypeError || !window.navigator.onLine) {
        queueOfflineTransaction({
          path: "/api/admin/sensor-alert-config",
          method: "POST",
          body: { email }
        });
        setError(null);
        setMessage("Network issue: alert-send request queued.");
        return;
      }
      setError(e instanceof Error ? e.message : "Unable to send alert.");
    } finally {
      setSendingAlert(false);
    }
  }

  return (
    <section className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur">
      <h2 className="text-lg font-semibold text-slate-900">Sensor Alert Thresholds</h2>
      <p className="mt-1 text-sm text-slate-600">
        Configure warning/critical thresholds and alert delivery for owner notifications.
      </p>

      {loading ? <p className="mt-3 text-sm text-slate-500">Loading settings...</p> : null}
      {setupRequired && setupMessage ? (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {setupMessage}
        </p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {message ? <p className="mt-3 text-sm text-green-700">{message}</p> : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-sm text-slate-700">
          <span className="mb-1 block">Warning threshold (°C)</span>
          <input
            value={warning}
            onChange={(event) => setWarning(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            inputMode="decimal"
          />
        </label>
        <label className="text-sm text-slate-700">
          <span className="mb-1 block">Critical threshold (°C)</span>
          <input
            value={critical}
            onChange={(event) => setCritical(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            inputMode="decimal"
          />
        </label>
        <label className="text-sm text-slate-700">
          <span className="mb-1 block">Alert cooldown (minutes)</span>
          <input
            value={cooldown}
            onChange={(event) => setCooldown(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            inputMode="numeric"
          />
        </label>
        <label className="text-sm text-slate-700">
          <span className="mb-1 block">Owner alert email</span>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            placeholder="owner@example.com"
            type="email"
          />
        </label>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Last updated: {config ? new Date(config.updated_at).toLocaleString() : "—"}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void sendAlert()}
            disabled={sendingAlert || saving || loading}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
          >
            {sendingAlert ? "Sending..." : "Send alert"}
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || sendingAlert || loading || setupRequired}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save threshold settings"}
          </button>
        </div>
      </div>
    </section>
  );
}

