import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";

type ReportRow = {
  id: string;
  manifest_id: string;
  reason: string;
  comments: string | null;
  reported_by: string;
  created_at: string;
  file_name: string | null;
};

function parseNotes(notes: string | null): { reason: string; comments: string | null } {
  const raw = String(notes ?? "").trim();
  if (!raw) return { reason: "Discrepancy", comments: null };
  const separator = raw.indexOf(":");
  if (separator <= 0) return { reason: raw, comments: null };
  return {
    reason: raw.slice(0, separator).trim() || "Discrepancy",
    comments: raw.slice(separator + 1).trim() || null
  };
}

function isMissingManifestReportsTable(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("manifest_reports") && (lower.includes("does not exist") || lower.includes("could not find"));
}

export async function GET(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.session.role !== "Admin" && auth.session.role !== "SuperAdmin" && auth.session.role !== "Sales") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const supabase = createAdminClient();
    let reportRows: Array<{
      id: string;
      manifest_id: string;
      reason: string;
      comments: string | null;
      reported_by: string;
      created_at: string;
      manifests: unknown;
    }> = [];

    const { data, error } = await supabase
      .from("manifest_reports")
      .select("id, manifest_id, reason, comments, reported_by, created_at, manifests(file_name)")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error && !isMissingManifestReportsTable(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!error) {
      reportRows = (data ?? []) as typeof reportRows;
    }

    const reports: ReportRow[] = reportRows.map((row) => {
      const manifest = Array.isArray(row.manifests) ? row.manifests[0] : row.manifests;
      return {
        id: row.id,
        manifest_id: row.manifest_id,
        reason: row.reason,
        comments: row.comments,
        reported_by: row.reported_by,
        created_at: row.created_at,
        file_name:
          manifest && typeof manifest === "object" && "file_name" in manifest
            ? String((manifest as { file_name?: string | null }).file_name ?? "")
            : null
      };
    });

    const existingManifestIds = new Set(reports.map((row) => row.manifest_id));
    const { data: manifests, error: manifestError } = await supabase
      .from("manifests")
      .select("id, file_name, uploaded_by, discrepancy_notes, updated_at, created_at")
      .eq("status", "Discrepancies")
      .order("updated_at", { ascending: false })
      .limit(100);

    if (manifestError) {
      return NextResponse.json({ error: manifestError.message }, { status: 500 });
    }

    const fallbackReports: ReportRow[] = (manifests ?? [])
      .filter((manifest) => !existingManifestIds.has(String(manifest.id)))
      .map((manifest) => {
        const rawNotes = String(manifest.discrepancy_notes ?? "").trim();
        const parsed =
          rawNotes.length > 0
            ? parseNotes(manifest.discrepancy_notes ?? null)
            : { reason: "Discrepancy (status flag)", comments: "Manifest marked as Discrepancies." };
        return {
          id: `fallback-${manifest.id}`,
          manifest_id: manifest.id,
          reason: parsed.reason,
          comments: parsed.comments,
          reported_by: String(manifest.uploaded_by ?? "Unknown"),
          created_at: String(manifest.updated_at ?? manifest.created_at ?? new Date().toISOString()),
          file_name: String(manifest.file_name ?? "")
        };
      });

    const mergedReports = [...reports, ...fallbackReports].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return NextResponse.json({ reports: mergedReports });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load discrepancy reports." },
      { status: 500 }
    );
  }
}
