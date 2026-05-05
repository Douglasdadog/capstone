import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/communication/mailer";

export type SensorAlertSeverity = "warning" | "critical";

type TriggerArgs = {
  deviceId: string;
  temperatureC: number;
  humidityPct: number;
  observedAtIso: string;
};

function warningThresholdC(): number {
  const n = Number(process.env.WIS_SENSOR_WARN_THRESHOLD_C ?? 40);
  return Number.isFinite(n) ? n : 40;
}

function criticalThresholdC(): number {
  const n = Number(process.env.WIS_SENSOR_CRITICAL_THRESHOLD_C ?? 50);
  return Number.isFinite(n) ? n : 50;
}

function cooldownMinutes(): number {
  const n = Number(process.env.WIS_SENSOR_ALERT_COOLDOWN_MINUTES ?? 10);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

function resolveAlertRecipient(): string | null {
  const explicit = process.env.WIS_SENSOR_ALERT_EMAIL?.trim();
  if (explicit) return explicit;
  const fallback = process.env.SMTP_USER?.trim();
  if (fallback) return fallback;
  return null;
}

type SensorAlertConfig = {
  warningThresholdC: number;
  criticalThresholdC: number;
  cooldownMinutes: number;
  recipient: string | null;
};

async function resolveSensorAlertConfig(supabase: ReturnType<typeof createAdminClient>): Promise<SensorAlertConfig> {
  const fallback = {
    warningThresholdC: warningThresholdC(),
    criticalThresholdC: criticalThresholdC(),
    cooldownMinutes: cooldownMinutes(),
    recipient: resolveAlertRecipient()
  };
  try {
    const { data, error } = await supabase
      .from("sensor_alert_config")
      .select("warning_threshold_c, critical_threshold_c, cooldown_minutes, alert_email")
      .eq("id", true)
      .maybeSingle();
    if (error || !data) return fallback;

    const warning = Number(data.warning_threshold_c ?? fallback.warningThresholdC);
    const critical = Number(data.critical_threshold_c ?? fallback.criticalThresholdC);
    const cooldown = Number(data.cooldown_minutes ?? fallback.cooldownMinutes);
    const recipient = typeof data.alert_email === "string" && data.alert_email.trim()
      ? data.alert_email.trim()
      : fallback.recipient;

    return {
      warningThresholdC: Number.isFinite(warning) ? warning : fallback.warningThresholdC,
      criticalThresholdC: Number.isFinite(critical) ? critical : fallback.criticalThresholdC,
      cooldownMinutes: Number.isFinite(cooldown) && cooldown > 0 ? cooldown : fallback.cooldownMinutes,
      recipient
    };
  } catch {
    return fallback;
  }
}

function severityLabel(severity: SensorAlertSeverity): string {
  return severity === "critical" ? "CRITICAL" : "WARNING";
}

function formatObservedAtPht(observedAtIso: string): string {
  const parsed = new Date(observedAtIso);
  if (Number.isNaN(parsed.getTime())) return observedAtIso;
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  }).format(parsed);
}

function buildAlertEmail(args: {
  severity: SensorAlertSeverity;
  deviceId: string;
  temperatureC: number;
  humidityPct: number;
  thresholdC: number;
  observedAtIso: string;
}) {
  const label = severityLabel(args.severity);
  const observedAt = `${formatObservedAtPht(args.observedAtIso)} (PHT)`;
  const subject = `[WIS] ${label} Sensor Alert - ${args.deviceId}`;
  const text =
    `Warehouse Information System Sensor Alert\n\n` +
    `Severity: ${label}\n` +
    `Device: ${args.deviceId}\n` +
    `Temperature: ${args.temperatureC.toFixed(1)} C\n` +
    `Humidity: ${args.humidityPct.toFixed(1)} %RH\n` +
    `Threshold: ${args.thresholdC.toFixed(1)} C\n` +
    `Observed At: ${observedAt}\n\n` +
    `Recommended Action:\n` +
    `- Validate the physical sensor placement and airflow.\n` +
    `- Inspect nearby inventory for heat-sensitive risk.\n` +
    `- Confirm normal readings resume and document any corrective action.`;

  const accent = args.severity === "critical" ? "#b91c1c" : "#b45309";
  const bg = args.severity === "critical" ? "#fef2f2" : "#fffbeb";
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;background:#f8fafc;padding:20px;color:#0f172a">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
        <div style="padding:14px 18px;background:${accent};color:#fff;font-weight:700">
          Warehouse Information System - ${label} Sensor Alert
        </div>
        <div style="padding:18px">
          <p style="margin:0 0 12px 0;color:#334155">
            A sensor threshold event requires attention.
          </p>
          <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px;background:${bg}">
            <p style="margin:4px 0"><b>Device:</b> ${args.deviceId}</p>
            <p style="margin:4px 0"><b>Temperature:</b> ${args.temperatureC.toFixed(1)} C</p>
            <p style="margin:4px 0"><b>Humidity:</b> ${args.humidityPct.toFixed(1)} %RH</p>
            <p style="margin:4px 0"><b>Threshold:</b> ${args.thresholdC.toFixed(1)} C</p>
            <p style="margin:4px 0"><b>Observed At:</b> ${observedAt}</p>
          </div>
          <h4 style="margin:16px 0 8px 0;color:#0f172a">Recommended Action</h4>
          <ul style="margin:0;padding-left:18px;color:#334155">
            <li>Validate sensor placement and surrounding airflow.</li>
            <li>Inspect nearby stock for heat-sensitive risk.</li>
            <li>Monitor readings until values stabilize within safe range.</li>
          </ul>
        </div>
      </div>
    </div>
  `;

  return { subject, text, html };
}

export async function maybeTriggerSensorThresholdAlert(args: TriggerArgs): Promise<void> {
  const supabase = createAdminClient();
  const config = await resolveSensorAlertConfig(supabase);
  const severity =
    args.temperatureC >= config.criticalThresholdC
      ? "critical"
      : args.temperatureC >= config.warningThresholdC
        ? "warning"
        : null;
  if (!severity) return;
  const cooldownSinceIso = new Date(Date.now() - config.cooldownMinutes * 60_000).toISOString();

  // De-duplicate noisy sensor streams: only one alert per device+severity within cooldown.
  const { data: existing, error: existingError } = await supabase
    .from("sensor_alert_notifications")
    .select("id")
    .eq("device_id", args.deviceId)
    .eq("severity", severity)
    .gte("created_at", cooldownSinceIso)
    .order("created_at", { ascending: false })
    .limit(1);

  if (existingError) return;
  if (existing && existing.length > 0) return;

  const recipient = config.recipient;
  const threshold = severity === "critical" ? config.criticalThresholdC : config.warningThresholdC;
  const title = severity === "critical" ? "Critical sensor alert" : "Sensor warning alert";
  const message = `${title}: ${args.deviceId} at ${args.temperatureC.toFixed(1)} C (threshold ${threshold.toFixed(1)} C).`;

  let emailSent = false;
  let emailError: string | null = null;
  if (recipient) {
    try {
      const emailPayload = buildAlertEmail({
        severity,
        deviceId: args.deviceId,
        temperatureC: args.temperatureC,
        humidityPct: args.humidityPct,
        thresholdC: threshold,
        observedAtIso: args.observedAtIso
      });
      await sendEmail({
        to: recipient,
        subject: emailPayload.subject,
        text: emailPayload.text,
        html: emailPayload.html
      });
      emailSent = true;
    } catch (error) {
      emailError = error instanceof Error ? error.message : "Unable to send email.";
    }
  } else {
    emailError = "WIS_SENSOR_ALERT_EMAIL is not configured.";
  }

  await supabase.from("sensor_alert_notifications").insert({
    device_id: args.deviceId,
    severity,
    temperature_c: args.temperatureC,
    humidity_pct: args.humidityPct,
    message,
    email_to: recipient,
    email_sent: emailSent,
    email_error: emailError,
    observed_at: args.observedAtIso
  });
}

