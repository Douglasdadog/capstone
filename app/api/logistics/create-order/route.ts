import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeText(value: unknown, max = 160): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function generateTrackingCandidate(): string {
  const code = 1000 + Math.floor(Math.random() * 9000);
  return `WIS-${code}`;
}

function isUniqueViolation(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("duplicate key") || normalized.includes("unique");
}

export async function POST(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const canCreateOrder =
    auth.session.role === "SuperAdmin" || auth.session.role === "Admin" || auth.session.role === "Sales";
  if (!canCreateOrder) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    client_name?: string;
    client_email?: string;
    origin?: string;
    destination?: string;
    item_name?: string;
    quantity?: number;
    eta?: string | null;
    tracking_number?: string;
  };

  const client_name = normalizeText(body.client_name, 120);
  const client_email = normalizeText(body.client_email, 160).toLowerCase();
  const origin = normalizeText(body.origin, 120);
  const destination = normalizeText(body.destination, 120);
  const item_name = normalizeText(body.item_name, 120);
  const quantity = typeof body.quantity === "number" && Number.isFinite(body.quantity) ? Math.floor(body.quantity) : null;
  const eta = typeof body.eta === "string" && body.eta.trim().length > 0 ? body.eta : null;
  const requestedTracking = normalizeText(body.tracking_number, 40).toUpperCase();

  if (!client_name || !client_email || !origin || !destination) {
    return NextResponse.json(
      { error: "client_name, client_email, origin, and destination are required." },
      { status: 400 }
    );
  }
  if (!isValidEmail(client_email)) {
    return NextResponse.json({ error: "client_email must be a valid email address." }, { status: 400 });
  }
  if (quantity !== null && quantity <= 0) {
    return NextResponse.json({ error: "quantity must be greater than zero." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const maxAttempts = requestedTracking ? 1 : 8;
  let attempt = 0;
  let lastError: string | null = null;

  while (attempt < maxAttempts) {
    attempt += 1;
    const tracking_number = requestedTracking || generateTrackingCandidate();

    const { data, error } = await supabase
      .from("shipments")
      .insert({
        tracking_number,
        client_name,
        client_email,
        origin,
        destination,
        item_name: item_name || null,
        quantity,
        eta,
        status: "Pending",
        updated_at: new Date().toISOString()
      })
      .select(
        "id, tracking_number, client_name, client_email, origin, destination, status, updated_at, eta, provider_name, waybill_number, tracking_token"
      )
      .single();

    if (!error) {
      return NextResponse.json({ ok: true, shipment: data }, { status: 201 });
    }

    lastError = error.message;
    if (!isUniqueViolation(error.message) || requestedTracking) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json(
    { error: lastError ?? "Unable to generate a unique tracking number. Please retry." },
    { status: 500 }
  );
}
