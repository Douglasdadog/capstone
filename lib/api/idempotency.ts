import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type IdempotencyRow = {
  idempotency_key: string;
  scope: string;
  status: "processing" | "completed";
  response_status: number | null;
  response_body: unknown;
};

function isMissingTableError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("idempotency_keys") && normalized.includes("does not exist");
}

function isDuplicateKeyError(message: string): boolean {
  return message.toLowerCase().includes("duplicate key");
}

export async function beginIdempotentRequest(
  request: NextRequest,
  scope: string
): Promise<{ key: string | null; replayResponse: NextResponse | null; errorResponse: NextResponse | null }> {
  const rawKey = request.headers.get("x-idempotency-key");
  const key = typeof rawKey === "string" ? rawKey.trim() : "";
  if (!key) {
    return { key: null, replayResponse: null, errorResponse: null };
  }

  const supabase = createAdminClient();
  const { error: insertError } = await supabase.from("idempotency_keys").insert({
    idempotency_key: key,
    scope,
    status: "processing"
  });

  if (!insertError) {
    return { key, replayResponse: null, errorResponse: null };
  }

  if (isMissingTableError(insertError.message)) {
    return {
      key,
      replayResponse: null,
      errorResponse: NextResponse.json(
        {
          error:
            "Idempotency table is missing. Run docs/supabase-idempotency-setup.sql before syncing queued transactions."
        },
        { status: 503 }
      )
    };
  }

  if (!isDuplicateKeyError(insertError.message)) {
    return {
      key,
      replayResponse: null,
      errorResponse: NextResponse.json({ error: insertError.message }, { status: 500 })
    };
  }

  const { data: existing, error: readError } = await supabase
    .from("idempotency_keys")
    .select("idempotency_key, scope, status, response_status, response_body")
    .eq("idempotency_key", key)
    .maybeSingle<IdempotencyRow>();

  if (readError || !existing) {
    return {
      key,
      replayResponse: null,
      errorResponse: NextResponse.json(
        { error: readError?.message ?? "Unable to verify idempotent request state." },
        { status: 500 }
      )
    };
  }

  if (existing.scope !== scope) {
    return {
      key,
      replayResponse: null,
      errorResponse: NextResponse.json(
        { error: "Idempotency key already used for another request type." },
        { status: 409 }
      )
    };
  }

  if (existing.status === "completed" && existing.response_status) {
    const replay = NextResponse.json(existing.response_body ?? { ok: true }, { status: existing.response_status });
    replay.headers.set("x-idempotency-replay", "true");
    return { key, replayResponse: replay, errorResponse: null };
  }

  return {
    key,
    replayResponse: null,
    errorResponse: NextResponse.json(
      { error: "A request with the same idempotency key is still processing." },
      { status: 409 }
    )
  };
}

export async function completeIdempotentRequest(key: string | null, status: number, body: unknown) {
  if (!key) return;
  const supabase = createAdminClient();
  await supabase
    .from("idempotency_keys")
    .update({
      status: "completed",
      response_status: status,
      response_body: body,
      completed_at: new Date().toISOString()
    })
    .eq("idempotency_key", key);
}
