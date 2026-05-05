import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";
import { beginIdempotentRequest, completeIdempotentRequest } from "@/lib/api/idempotency";

type InventoryCategory = "Maintenance Free" | "Conventional";

function parseNonNegativeInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.floor(value);
  return n >= 0 ? n : null;
}

function normalizeCategory(value: unknown): InventoryCategory | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "maintenance free") return "Maintenance Free";
  if (normalized === "conventional") return "Conventional";
  return null;
}

function resolveDefaultImageUrl(category: InventoryCategory): string {
  if (category === "Maintenance Free") {
    return "https://placehold.co/320x200/fef3c7/92400e?text=Evvo+Maintenance+Free";
  }
  return "https://placehold.co/320x200/e2e8f0/334155?text=D-Zel+King+Conventional";
}

function isMissingInventoryColumnError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("column") && normalized.includes("inventory.") && normalized.includes("does not exist");
}

async function logLowStockAlert(
  supabase: ReturnType<typeof createAdminClient>,
  item: { id: string; name: string; quantity: number; threshold_limit: number }
): Promise<string | null> {
  if (item.quantity >= item.threshold_limit) return null;

  const { error } = await supabase.from("auto_replenishment_alerts").insert({
    inventory_id: item.id,
    item_name: item.name,
    reading_quantity: item.quantity,
    threshold_limit: item.threshold_limit,
    status: "triggered",
    message: `Low stock alert triggered for ${item.name}`
  });

  return error ? error.message : null;
}

export async function GET() {
  try {
    const supabase = createAdminClient();
    const modernQuery = await supabase
      .from("inventory")
      .select("id, category, name, image_url, quantity, threshold_limit, updated_at")
      .order("name", { ascending: true });

    if (modernQuery.error) {
      if (!isMissingInventoryColumnError(modernQuery.error.message)) {
        return NextResponse.json({ error: modernQuery.error.message }, { status: 500 });
      }

      const legacyQuery = await supabase
        .from("inventory")
        .select("id, name, quantity, threshold_limit, updated_at")
        .order("name", { ascending: true });

      if (legacyQuery.error) {
        return NextResponse.json({ error: legacyQuery.error.message }, { status: 500 });
      }

      const items = (legacyQuery.data ?? []).map((item) => ({
        ...item,
        category: null,
        image_url: null
      }));
      return NextResponse.json({ items });
    }

    return NextResponse.json({ items: modernQuery.data ?? [] });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to fetch inventory. Check Supabase env configuration."
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const canCreate =
    auth.session.role === "SuperAdmin" || auth.session.role === "Admin" || auth.session.role === "Inventory";
  if (!canCreate) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    name?: string;
    category?: string;
    quantity?: number;
    threshold_limit?: number;
    image_url?: string;
  };

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 120) {
    return NextResponse.json({ error: "name is required and must be 1-120 characters." }, { status: 400 });
  }

  const category = normalizeCategory(body.category);
  if (!category) {
    return NextResponse.json({ error: "category must be Maintenance Free or Conventional." }, { status: 400 });
  }

  const quantity = parseNonNegativeInt(body.quantity);
  const threshold_limit = parseNonNegativeInt(body.threshold_limit);
  if (quantity === null || threshold_limit === null) {
    return NextResponse.json(
      { error: "quantity and threshold_limit must be non-negative integers." },
      { status: 400 }
    );
  }

  const image_url =
    typeof body.image_url === "string" && body.image_url.trim().length > 0
      ? body.image_url.trim()
      : resolveDefaultImageUrl(category);

  const idempotency = await beginIdempotentRequest(request, "inventory:create-item");
  if (idempotency.errorResponse) return idempotency.errorResponse;
  if (idempotency.replayResponse) return idempotency.replayResponse;

  try {
    const supabase = createAdminClient();
    const modernInsert = await supabase
      .from("inventory")
      .insert({
        name,
        category,
        image_url,
        quantity,
        threshold_limit
      })
      .select("id, category, name, image_url, quantity, threshold_limit, updated_at")
      .single();

    if (modernInsert.error) {
      if (!isMissingInventoryColumnError(modernInsert.error.message)) {
        return NextResponse.json({ error: modernInsert.error.message }, { status: 500 });
      }

      const legacyInsert = await supabase
        .from("inventory")
        .insert({
          name,
          quantity,
          threshold_limit
        })
        .select("id, name, quantity, threshold_limit, updated_at")
        .single();

      if (legacyInsert.error) {
        return NextResponse.json({ error: legacyInsert.error.message }, { status: 500 });
      }

      const lowStockAlertError = await logLowStockAlert(supabase, {
        id: legacyInsert.data.id,
        name: legacyInsert.data.name,
        quantity: legacyInsert.data.quantity,
        threshold_limit: legacyInsert.data.threshold_limit
      });

      const responseBody = {
        item: {
          ...(legacyInsert.data ?? {}),
          category: null,
          image_url: null
        },
        warning: lowStockAlertError ? `Inventory created, but alert logging failed: ${lowStockAlertError}` : null
      };
      await completeIdempotentRequest(idempotency.key, 201, responseBody);
      return NextResponse.json(responseBody, { status: 201 });
    }

    const lowStockAlertError = modernInsert.data
      ? await logLowStockAlert(supabase, {
          id: modernInsert.data.id,
          name: modernInsert.data.name,
          quantity: modernInsert.data.quantity,
          threshold_limit: modernInsert.data.threshold_limit
        })
      : null;

    const responseBody = {
      item: modernInsert.data,
      warning: lowStockAlertError ? `Inventory created, but alert logging failed: ${lowStockAlertError}` : null
    };
    await completeIdempotentRequest(idempotency.key, 201, responseBody);
    return NextResponse.json(responseBody, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to create inventory item. Check Supabase env configuration."
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const canOverride = auth.session.role === "SuperAdmin" || auth.session.role === "Admin";
  if (!canOverride) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    id?: string;
    quantity?: number;
    threshold_limit?: number;
  };

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const quantity = parseNonNegativeInt(body.quantity);
  const threshold_limit = parseNonNegativeInt(body.threshold_limit);
  if (quantity === null || threshold_limit === null) {
    return NextResponse.json(
      { error: "quantity and threshold_limit must be non-negative integers." },
      { status: 400 }
    );
  }

  const idempotency = await beginIdempotentRequest(request, "inventory:update-item");
  if (idempotency.errorResponse) return idempotency.errorResponse;
  if (idempotency.replayResponse) return idempotency.replayResponse;

  try {
    const supabase = createAdminClient();
    const modernUpdate = await supabase
      .from("inventory")
      .update({
        quantity,
        threshold_limit,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .select("id, category, name, image_url, quantity, threshold_limit, updated_at")
      .single();

    if (modernUpdate.error) {
      if (!isMissingInventoryColumnError(modernUpdate.error.message)) {
        return NextResponse.json({ error: modernUpdate.error.message }, { status: 500 });
      }

      const legacyUpdate = await supabase
        .from("inventory")
        .update({
          quantity,
          threshold_limit,
          updated_at: new Date().toISOString()
        })
        .eq("id", id)
        .select("id, name, quantity, threshold_limit, updated_at")
        .single();

      if (legacyUpdate.error) {
        return NextResponse.json({ error: legacyUpdate.error.message }, { status: 500 });
      }

      if (!legacyUpdate.data) {
        return NextResponse.json({ error: "Inventory item not found." }, { status: 404 });
      }

      const lowStockAlertError = await logLowStockAlert(supabase, {
        id: legacyUpdate.data.id,
        name: legacyUpdate.data.name,
        quantity: legacyUpdate.data.quantity,
        threshold_limit: legacyUpdate.data.threshold_limit
      });

      const responseBody = {
        item: {
          ...legacyUpdate.data,
          category: null,
          image_url: null
        },
        warning: lowStockAlertError ? `Inventory updated, but alert logging failed: ${lowStockAlertError}` : null
      };
      await completeIdempotentRequest(idempotency.key, 200, responseBody);
      return NextResponse.json(responseBody);
    }

    if (!modernUpdate.data) {
      return NextResponse.json({ error: "Inventory item not found." }, { status: 404 });
    }

    const lowStockAlertError = await logLowStockAlert(supabase, {
      id: modernUpdate.data.id,
      name: modernUpdate.data.name,
      quantity: modernUpdate.data.quantity,
      threshold_limit: modernUpdate.data.threshold_limit
    });

    const responseBody = {
      item: modernUpdate.data,
      warning: lowStockAlertError ? `Inventory updated, but alert logging failed: ${lowStockAlertError}` : null
    };
    await completeIdempotentRequest(idempotency.key, 200, responseBody);
    return NextResponse.json(responseBody);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to update inventory. Check Supabase env configuration."
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  if (auth.session.role !== "SuperAdmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ error: "id query parameter is required." }, { status: 400 });
  }
  const idempotency = await beginIdempotentRequest(request, `inventory:delete-item:${id}`);
  if (idempotency.errorResponse) return idempotency.errorResponse;
  if (idempotency.replayResponse) return idempotency.replayResponse;

  try {
    const supabase = createAdminClient();
    const { data: removed, error } = await supabase.from("inventory").delete().eq("id", id).select("id").maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!removed) {
      return NextResponse.json({ error: "Inventory item not found." }, { status: 404 });
    }

    const responseBody = { ok: true };
    await completeIdempotentRequest(idempotency.key, 200, responseBody);
    return NextResponse.json(responseBody);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to delete inventory item. Check Supabase env configuration."
      },
      { status: 500 }
    );
  }
}
