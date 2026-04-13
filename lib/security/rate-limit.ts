import { NextRequest, NextResponse } from "next/server";

type Bucket = {
  count: number;
  resetAt: number;
};

const store = new Map<string, Bucket>();

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export function enforceRateLimit(
  request: NextRequest,
  keyPrefix: string,
  maxRequests: number,
  windowMs: number
): NextResponse | null {
  const now = Date.now();
  const key = `${keyPrefix}:${getClientIp(request)}`;
  const current = store.get(key);

  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  if (current.count >= maxRequests) {
    const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter)
        }
      }
    );
  }

  current.count += 1;
  store.set(key, current);
  return null;
}

export async function delayOnFailure(ms = 550) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
