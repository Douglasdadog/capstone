import { NextRequest, NextResponse } from "next/server";
import { requireDemoSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSampleUsers, readRegisteredUsers, DEMO_USERS_COOKIE } from "@/lib/auth/demo-auth";

type ClientAccount = { email: string; name: string; source: "registered" | "sample" | "supabase" };

function nameFromEmail(email: string): string {
  return email.split("@")[0].replace(/[._-]+/g, " ").trim() || email;
}

export async function GET(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  const canView = auth.session.role === "SuperAdmin" || auth.session.role === "Admin" || auth.session.role === "Sales";
  if (!canView) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const entries = new Map<string, ClientAccount>();
  const register = (email: string, source: ClientAccount["source"], name?: string) => {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;
    if (!entries.has(normalized)) {
      entries.set(normalized, { email: normalized, name: name?.trim() || nameFromEmail(normalized), source });
    }
  };

  for (const user of getSampleUsers()) {
    if (user.role === "Client") register(user.email, "sample");
  }
  for (const user of readRegisteredUsers(request.cookies.get(DEMO_USERS_COOKIE)?.value)) {
    if (user.role === "Client") register(user.email, "registered");
  }

  try {
    const admin = createAdminClient();
    for (let page = 1; page <= 10; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) break;
      const users = data?.users ?? [];
      for (const user of users) {
        const role = String(user.user_metadata?.role ?? "");
        if (role.toLowerCase() !== "client") continue;
        register(user.email ?? "", "supabase", String(user.user_metadata?.full_name ?? ""));
      }
      if (users.length < 200) break;
    }
  } catch {
    // Keep cookie/sample accounts as fallback.
  }

  return NextResponse.json({
    clients: [...entries.values()].sort((a, b) => a.email.localeCompare(b.email))
  });
}
