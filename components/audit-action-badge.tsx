function classifyAuditAction(
  status: string | undefined,
  message: string | undefined
): "triggered" | "success" | "error" | "neutral" {
  const s = `${status ?? ""} ${message ?? ""}`.toLowerCase();
  if (s.includes("error") || s.includes("failed")) return "error";
  if (s.includes("success") || s.includes("completed")) return "success";
  if (s.includes("triggered") || s.includes("trigger")) return "triggered";
  return "neutral";
}

const toneStyles: Record<
  "triggered" | "success" | "error" | "neutral",
  string
> = {
  triggered: "bg-red-100 text-red-800 ring-1 ring-red-200/80",
  success: "bg-blue-100 text-blue-800 ring-1 ring-blue-200/80",
  error: "bg-red-100 text-red-800 ring-1 ring-red-200/80",
  neutral: "bg-slate-100 text-slate-700 ring-1 ring-slate-200/80"
};

function formatLabel(status: string | undefined) {
  const raw = (status ?? "triggered").trim();
  if (!raw) return "Triggered";
  const lower = raw.toLowerCase();
  if (lower === "success" || lower === "completed") return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  if (lower === "triggered") return "Triggered";
  if (lower === "error" || lower === "failed") return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export default function AuditActionBadge({
  status,
  message
}: {
  status?: string;
  message?: string;
}) {
  const tone = classifyAuditAction(status, message);
  const label = formatLabel(status);

  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${toneStyles[tone]}`}
    >
      {label}
    </span>
  );
}

