import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";
import { writeActivityLog } from "@/lib/audit/activity-log";
import { sendSmtpEmail } from "@/lib/communication/mailer";
import { buildShipmentOrderCreatedEmail } from "@/lib/communication/shipment-email";

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
  if (auth.session.role !== "Client" && auth.session.role !== "SuperAdmin" && auth.session.role !== "Admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    full_name?: string;
    business_name?: string;
    tin?: string;
    destination?: string;
    contact_number?: string;
    items?: Array<{ item_name?: string; quantity?: number }>;
  };

  const fullName = normalizeText(body.full_name, 120);
  const businessName = normalizeText(body.business_name, 160);
  const tin = normalizeText(body.tin, 30);
  const destination = normalizeText(body.destination, 220);
  const contactNumber = normalizeText(body.contact_number, 40);
  const clientEmail = auth.session.email.toLowerCase();
  const items = Array.isArray(body.items) ? body.items : [];

  if (!fullName || !destination || !contactNumber) {
    return NextResponse.json(
      { error: "full_name, destination, and contact_number are required." },
      { status: 400 }
    );
  }
  if (destination.length < 20) {
    return NextResponse.json({ error: "destination must be a detailed address." }, { status: 400 });
  }
  const normalizedItems = items
    .map((row) => ({
      item_name: normalizeText(row?.item_name, 120),
      quantity: typeof row?.quantity === "number" && Number.isFinite(row.quantity) ? Math.floor(row.quantity) : 0
    }))
    .filter((row) => row.item_name.length > 0 && row.quantity > 0);
  if (normalizedItems.length === 0) {
    return NextResponse.json({ error: "At least one valid item is required." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const itemNames = normalizedItems.map((row) => row.item_name);
  const { data: inventoryRows, error: invError } = await supabase
    .from("inventory")
    .select("id, name, quantity")
    .in("name", itemNames);
  if (invError) return NextResponse.json({ error: invError.message }, { status: 500 });

  const inventoryMap = new Map((inventoryRows ?? []).map((row) => [String(row.name), Number(row.quantity ?? 0)] as const));
  for (const row of normalizedItems) {
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

  const mergedItems = Array.from(
    normalizedItems.reduce((map, row) => {
      map.set(row.item_name, (map.get(row.item_name) ?? 0) + row.quantity);
      return map;
    }, new Map<string, number>())
  ).map(([itemName, qty]) => ({ item_name: itemName, quantity: qty }));
  const totalQuantity = mergedItems.reduce((sum, row) => sum + row.quantity, 0);
  const primaryItemName =
    mergedItems.length === 1 ? mergedItems[0].item_name : `${mergedItems[0].item_name} +${mergedItems.length - 1} more`;

  let lastError: string | null = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const trackingNumber = generateTrackingCandidate();
    const trackingToken = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const { data: shipment, error: shipmentError } = await supabase
      .from("shipments")
      .insert({
        tracking_number: trackingNumber,
        tracking_token: trackingToken,
        client_name: fullName,
        client_email: clientEmail,
        assigned_client_name: fullName,
        assigned_client_email: clientEmail,
        origin: "Imarflex Battery Mfg. Corp. F10, 118 Mercedes Ave, Pasig, Metro Manila",
        destination,
        item_name: primaryItemName,
        quantity: totalQuantity,
        status: "Pending",
        milestone_status: "Pending",
        payment_status: "Awaiting Payment",
        client_contact_number: contactNumber,
        business_name: businessName || null,
        tin: tin || null,
        order_source: "client",
        updated_at: nowIso
      })
      .select(
        "id, tracking_number, tracking_token, client_name, client_email, destination, status, milestone_status, payment_status, updated_at"
      )
      .single();

    if (shipmentError) {
      lastError = shipmentError.message;
      if (!isUniqueViolation(shipmentError.message)) {
        return NextResponse.json({ error: shipmentError.message }, { status: 500 });
      }
      continue;
    }

    const { error: itemsError } = await supabase.from("shipment_items").insert(
      mergedItems.map((row) => ({
        shipment_id: shipment.id,
        part_number: row.item_name,
        quantity: row.quantity
      }))
    );
    if (itemsError) {
      return NextResponse.json({ error: `Order created but items save failed: ${itemsError.message}` }, { status: 500 });
    }

    const trackingLink = shipment.tracking_token ? `${request.nextUrl.origin}/track/${shipment.tracking_token}` : null;
    try {
      await sendSmtpEmail(
        buildShipmentOrderCreatedEmail({
          clientName: fullName,
          clientEmail,
          trackingNumber: shipment.tracking_number,
          origin: "Imarflex Battery Mfg. Corp. F10, 118 Mercedes Ave, Pasig, Metro Manila",
          destination,
          orderCreatedAt: shipment.updated_at,
          eta: null,
          trackingLink,
          itemDetails: mergedItems.map((row) => `${row.item_name} x${row.quantity}`)
        })
      );
    } catch {
      // Email is best-effort for request submission.
    }

    await writeActivityLog(request, {
      actorEmail: auth.session.email,
      actorRole: auth.session.role,
      action: "client.submit_order_request",
      targetModule: "client-portal",
      targetId: shipment.id,
      details: {
        tracking_number: shipment.tracking_number,
        item_count: mergedItems.length
      }
    });

    return NextResponse.json({ ok: true, shipment }, { status: 201 });
  }

  return NextResponse.json({ error: lastError ?? "Unable to generate tracking number." }, { status: 500 });
}
