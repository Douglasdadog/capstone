import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";

type ManifestStatus = "Pending Verification" | "Completed" | "Discrepancies";

type ParsedRow = {
  partNumber: string;
  quantity: number;
  batchId: string;
};

function toPositiveInt(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.floor(n);
  return rounded > 0 ? rounded : null;
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, " ");
}

function pickValue(row: Record<string, unknown>, keys: string[]): unknown {
  const entry = Object.entries(row).find(([key]) => keys.includes(normalizeHeader(key)));
  return entry?.[1];
}

function parseWorksheetRows(rows: Record<string, unknown>[]): ParsedRow[] {
  const parsed: ParsedRow[] = [];
  for (const row of rows) {
    const partRaw = pickValue(row, ["part number", "part no", "part", "partnumber", "product"]);
    const qtyRaw = pickValue(row, ["quantity", "qty"]);
    const batchRaw = pickValue(row, ["batch id", "batch", "batchid", "product serial id", "serial id"]);

    const partNumber = String(partRaw ?? "").trim();
    const serialOrBatch = String(batchRaw ?? "").trim();
    const explicitQuantity = toPositiveInt(qtyRaw);
    // Support per-unit serial format: Product + Product Serial ID, with implied qty=1.
    const quantity = explicitQuantity ?? (partNumber && serialOrBatch ? 1 : null);
    const batchId = serialOrBatch;

    if (!partNumber || !batchId || quantity === null) continue;
    parsed.push({ partNumber, quantity, batchId });
  }
  return parsed;
}

async function parseManifestFile(file: File): Promise<ParsedRow[]> {
  const bytes = await file.arrayBuffer();
  const workbook = XLSX.read(bytes, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return parseWorksheetRows(rows);
}

export async function GET(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.session.role !== "Admin" && auth.session.role !== "SuperAdmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("manifests")
      .select("id, file_name, uploaded_by, status, discrepancy_notes, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json(
        {
          error:
            "Unable to fetch manifests. Ensure tables `manifests` and `manifest_items` exist in Supabase.",
          details: error.message
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ manifests: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load manifests." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.session.role !== "Admin" && auth.session.role !== "SuperAdmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Please upload a .xlsx or .csv file." }, { status: 400 });
  }

  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith(".xlsx") && !lowerName.endsWith(".csv")) {
    return NextResponse.json({ error: "Invalid file type. Use .xlsx or .csv only." }, { status: 400 });
  }

  const parsedRows = await parseManifestFile(file);
  if (parsedRows.length === 0) {
    return NextResponse.json(
      {
        error:
          "No valid rows found. Use either (Part Number, Quantity, Batch ID) or (Product, Product Serial ID)."
      },
      { status: 400 }
    );
  }

  try {
    const supabase = createAdminClient();
    const { data: manifest, error: manifestError } = await supabase
      .from("manifests")
      .insert({
        file_name: file.name,
        uploaded_by: auth.session.email,
        status: "Pending Verification" satisfies ManifestStatus
      })
      .select("id")
      .single();

    if (manifestError || !manifest) {
      return NextResponse.json(
        {
          error:
            "Unable to create manifest. Ensure table `manifests` exists with columns file_name, uploaded_by, status.",
          details: manifestError?.message
        },
        { status: 500 }
      );
    }

    const items = parsedRows.map((row) => ({
      manifest_id: manifest.id,
      part_number: row.partNumber,
      quantity: row.quantity,
      batch_id: row.batchId
    }));

    const { error: itemsError } = await supabase.from("manifest_items").insert(items);
    if (itemsError) {
      return NextResponse.json(
        {
          error:
            "Manifest header saved, but items failed. Ensure table `manifest_items` exists with manifest_id, part_number, quantity, batch_id.",
          details: itemsError.message
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      inserted: items.length,
      message: "Manifest uploaded and marked as Pending Verification."
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Manifest upload failed." },
      { status: 500 }
    );
  }
}
