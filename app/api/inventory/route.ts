import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";

const CATEGORY_OPTIONS = ["Maintenance Free", "Conventional"] as const;

function parseNonNegativeInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.floor(value);
  return n >= 0 ? n : null;
}

function normalizeCategory(value: unknown): (typeof CATEGORY_OPTIONS)[number] | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "maintenance free") return "Maintenance Free";
  if (normalized === "conventional") return "Conventional";
  return null;
}

function resolveDefaultImageUrl(category: (typeof CATEGORY_OPTIONS)[number]): string {
  if (category === "Maintenance Free") {
    return "https://placehold.co/320x200/fef3c7/92400e?text=Evvo+Maintenance+Free";
  }
  return "https://placehold.co/320x200/e2e8f0/334155?text=D-Zel+King+Conventional";
}

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("inventory")
      .select("id, category, name, image_url, quantity, threshold_limit, updated_at")
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

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
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

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ item: data }, { status: 201 });
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

  const canOverride =
    auth.session.role === "SuperAdmin" || auth.session.role === "Admin" || auth.session.role === "Inventory";
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
      .select("id, category, name, image_url, quantity, threshold_limit, updated_at")
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
