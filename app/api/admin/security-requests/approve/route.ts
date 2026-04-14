import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDemoSession } from "@/lib/auth/session";
import { sendSmtpEmail } from "@/lib/communication/mailer";
import { enforceRateLimit } from "@/lib/security/rate-limit";

type SecurityRequestRow = {
  id: number;
  user_name?: string | null;
  email: string;
  role: string;
  status: string;
  created_at: string;
  supabase_user_id?: string | null;
};

async function resolveSupabaseUserId(supabase: ReturnType<typeof createAdminClient>, request: SecurityRequestRow) {
  if (request.supabase_user_id) return request.supabase_user_id;

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200
    });
    if (error) throw new Error(error.message);
    const found = data.users.find((user) => user.email?.toLowerCase() === request.email.toLowerCase());
    if (found?.id) return found.id;
    if (!data.users.length) break;
  }
  return null;
}

export async function POST(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.session.role !== "Admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rateLimited = enforceRateLimit(request, "admin-approve-mfa-reset", 20, 60_000);
  if (rateLimited) return rateLimited;

  const body = (await request.json()) as { requestId?: number };
  const requestId = Number(body.requestId);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return NextResponse.json({ error: "Valid requestId is required." }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    const { data: resetRequest, error: fetchError } = await supabase
      .from("mfa_reset_requests")
      .select("id, user_name, email, role, status, created_at, supabase_user_id")
      .eq("id", requestId)
      .eq("status", "Pending")
      .single();

    if (fetchError || !resetRequest) {
      return NextResponse.json({ error: "Security request not found." }, { status: 404 });
    }

    const requestRow = resetRequest as SecurityRequestRow;

    const supabaseUserId = await resolveSupabaseUserId(supabase, requestRow);
    if (!supabaseUserId) {
      return NextResponse.json({ error: "Unable to locate Supabase user for this request." }, { status: 404 });
    }

    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(supabaseUserId);
    if (userError || !userData.user) {
      return NextResponse.json({ error: userError?.message ?? "User not found." }, { status: 404 });
    }

    const currentMetadata = (userData.user.user_metadata ?? {}) as Record<string, unknown>;
    const { error: updateUserError } = await supabase.auth.admin.updateUserById(supabaseUserId, {
      user_metadata: {
        ...currentMetadata,
        mfa_enabled: false,
        mfa_secret: null
      }
    });
    if (updateUserError) {
      return NextResponse.json({ error: updateUserError.message }, { status: 500 });
    }

    await sendSmtpEmail({
      to: requestRow.email,
      subject: "Your MFA Has Been Reset",
      text: "Your MFA has been reset by the Admin. You will be prompted to set up a new MFA device upon your next login.",
      html: `
        <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
          <h2 style="margin-bottom: 8px;">MFA Reset Processed</h2>
          <p>Your MFA has been reset by the Admin.</p>
          <p>You will be prompted to set up a new MFA device upon your next login.</p>
        </div>
      `
    });

    const { data: inventoryRef, error: inventoryError } = await supabase
      .from("inventory")
      .select("id, name, quantity, threshold_limit")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (inventoryError || !inventoryRef) {
      return NextResponse.json(
        { error: "MFA reset processed, but audit log could not be recorded because no inventory reference was found." },
        { status: 500 }
      );
    }

    const auditMessage = `MFA reset approved for ${requestRow.email} by ${auth.session.email}.`;
    const { error: auditError } = await supabase.from("auto_replenishment_alerts").insert({
      inventory_id: inventoryRef.id,
      item_name: inventoryRef.name,
      reading_quantity: Number(inventoryRef.quantity ?? 0),
      threshold_limit: Number(inventoryRef.threshold_limit ?? 0),
      status: "Success",
      message: auditMessage
    });
    if (auditError) {
      return NextResponse.json(
        { error: `MFA reset processed, but audit log insert failed: ${auditError.message}` },
        { status: 500 }
      );
    }

    const { error: deleteError } = await supabase
      .from("mfa_reset_requests")
      .delete()
      .eq("id", requestId);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to process MFA reset request." },
      { status: 500 }
    );
  }
}
