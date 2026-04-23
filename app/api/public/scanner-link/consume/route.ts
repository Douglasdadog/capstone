import { NextRequest, NextResponse } from "next/server";
import { verifyScannerLinkToken } from "@/lib/auth/scanner-link-token";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { token?: string };
  const token = String(body.token ?? "").trim();
  if (!token) {
    return NextResponse.json({ error: "Token is required." }, { status: 400 });
  }
  const result = verifyScannerLinkToken(token);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
