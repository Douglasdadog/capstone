import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";
import { sendSmtpEmail } from "@/lib/communication/mailer";
import { buildShipmentOrderCreatedEmail } from "@/lib/communication/shipment-email";

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
    items?: Array<{ item_name?: string; quantity?: number }>;
  };

  const client_name = normalizeText(body.client_name, 120);
  const client_email = normalizeText(body.client_email, 160).toLowerCase();
  const origin = normalizeText(body.origin, 120);
  const destination = normalizeText(body.destination, 120);
  const item_name = normalizeText(body.item_name, 120);
  const quantity = typeof body.quantity === "number" && Number.isFinite(body.quantity) ? Math.floor(body.quantity) : null;
  const rawItems = Array.isArray(body.items) ? body.items : [];
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
  const normalizedItems =
    rawItems.length > 0
      ? rawItems
          .map((row) => ({
            item_name: normalizeText(row?.item_name, 120),
            quantity: typeof row?.quantity === "number" && Number.isFinite(row.quantity) ? Math.floor(row.quantity) : 0
          }))
          .filter((row) => row.item_name.length > 0 && row.quantity > 0)
      : item_name && quantity && quantity > 0
        ? [{ item_name, quantity }]
        : [];

  if (normalizedItems.length === 0) {
    return NextResponse.json({ error: "At least one valid item and quantity is required." }, { status: 400 });
  }

  const mergedItems = Array.from(
    normalizedItems.reduce((map, row) => {
      map.set(row.item_name, (map.get(row.item_name) ?? 0) + row.quantity);
      return map;
    }, new Map<string, number>())
  ).map(([item_name: itemName, qty]) => ({ item_name: itemName, quantity: qty }));

  const supabase = createAdminClient();
  const itemNames = mergedItems.map((row) => row.item_name);
  const { data: inventoryRows, error: inventoryError } = await supabase
    .from("inventory")
    .select("id, name, quantity")
    .in("name", itemNames);

  if (inventoryError) {
    return NextResponse.json({ error: inventoryError.message }, { status: 500 });
  }

  const inventoryMap = new Map(
    (inventoryRows ?? []).map((row) => [String(row.name), Number(row.quantity ?? 0)] as const)
  );

  for (const row of mergedItems) {
    const available = inventoryMap.get(row.item_name);
    if (available === undefined) {
      return NextResponse.json({ error: `Item not found in inventory: ${row.item_name}` }, { status: 400 });
    }
    if (row.quantity > available) {
      return NextResponse.json(
        { error: `Insufficient stock for ${row.item_name}. Available: ${available}.` },
        { status: 400 }
      );
    }
  }

  const totalQuantity = mergedItems.reduce((sum, row) => sum + row.quantity, 0);
  const primaryItemName =
    mergedItems.length === 1 ? mergedItems[0].item_name : `${mergedItems[0].item_name} +${mergedItems.length - 1} more`;

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
        item_name: primaryItemName,
        quantity: totalQuantity,
        eta,
        status: "Pending",
        updated_at: new Date().toISOString()
      })
      .select(
        "id, tracking_number, client_name, client_email, origin, destination, status, updated_at, eta, provider_name, waybill_number, tracking_token"
      )
      .single();

    if (!error) {
      const { error: itemsError } = await supabase.from("shipment_items").insert(
        mergedItems.map((row) => ({
          shipment_id: data.id,
          part_number: row.item_name,
          quantity: row.quantity
        }))
      );

      if (itemsError) {
        return NextResponse.json(
          { error: `Order created but items could not be saved: ${itemsError.message}` },
          { status: 500 }
        );
      }

      const trackingLink = data.tracking_token ? `${request.nextUrl.origin}/track/${data.tracking_token}` : null;
      const details = mergedItems.map((row) => `${row.item_name} x${row.quantity}`);

      let communication: { sent: boolean; message: string } | null = null;
      try {
        await sendSmtpEmail(
          buildShipmentOrderCreatedEmail({
            clientName: client_name,
            clientEmail: client_email,
            trackingNumber: data.tracking_number,
            origin,
            destination,
            eta,
            trackingLink,
            itemDetails: details
          })
        );
        communication = { sent: true, message: "Order confirmation email sent." };
      } catch (emailError) {
        communication = {
          sent: false,
          message: emailError instanceof Error ? emailError.message : "Failed to send order confirmation email."
        };
      }

      return NextResponse.json({ ok: true, shipment: data, communication }, { status: 201 });
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
