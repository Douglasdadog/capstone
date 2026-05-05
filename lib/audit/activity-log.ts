import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type ActivityLogArgs = {
  actorEmail: string;
  actorName?: string | null;
  actorRole?: string | null;
  action: string;
  targetModule: string;
  targetId?: string | null;
  details?: Record<string, unknown>;
};

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

function resolveActorName(email: string, rawName?: string | null): string {
  const trimmed = rawName?.trim();
  if (trimmed) return trimmed;
  const base = email.split("@")[0] ?? "user";
  return base.replace(/[._-]+/g, " ").trim();
}

export async function writeActivityLog(request: NextRequest, args: ActivityLogArgs): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.from("system_activity_logs").insert({
      actor_email: args.actorEmail.toLowerCase(),
      actor_name: resolveActorName(args.actorEmail, args.actorName),
      actor_role: args.actorRole ?? null,
      actor_ip: getClientIp(request),
      action: args.action,
      target_module: args.targetModule,
      target_id: args.targetId ?? null,
      details: args.details ?? {}
    });
  } catch {
    // Logging should never block the user action.
  }
}
