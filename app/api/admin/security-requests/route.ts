import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.session.role !== "SuperAdmin") {
    return NextResponse.json({ error: "Super Admin access required." }, { status: 403 });
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("mfa_reset_requests")
      .select("id, user_name, email, role, status, created_at, supabase_user_id")
      .eq("status", "Pending")
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json(
        {
          error:
            "Unable to load security requests. Ensure table `mfa_reset_requests` exists and includes required columns.",
          details: error.message
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ requests: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to fetch security requests." },
      { status: 500 }
    );
  }
}
