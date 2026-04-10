import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";

function parseNonNegativeInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.floor(value);
  return n >= 0 ? n : null;
}

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("inventory")
      .select("id, name, quantity, threshold_limit, updated_at")
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ items: data ?? [] });
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

export async function PATCH(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const canOverride = auth.session.role === "Admin" || auth.session.role === "Inventory";
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

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("inventory")
      .update({
        quantity,
        threshold_limit,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .select("id, name, quantity, threshold_limit, updated_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Inventory item not found." }, { status: 404 });
    }

    return NextResponse.json({ item: data });
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
