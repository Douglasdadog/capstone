import { NextRequest, NextResponse } from "next/server";
import {
  DEMO_PERMISSIONS_COOKIE,
  DEMO_USERS_COOKIE,
  getSampleUsers,
  readPermissions,
  readRegisteredUsers,
  serializePermissions,
  serializeRegisteredUsers,
  setUserExtraRoutes
} from "@/lib/auth/demo-auth";
import { requireDemoSession } from "@/lib/auth/session";
import { ROLE_ACCESS, SIDEBAR_LINKS, UserRole, normalizeRole } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { beginIdempotentRequest, completeIdempotentRequest } from "@/lib/api/idempotency";

const grantableRoutes = SIDEBAR_LINKS.filter((link) => link.grantable).map((link) => link.href);
const allRoles: UserRole[] = ["SuperAdmin", "Admin", "Inventory", "Sales", "Client"];

type SupabaseUserRow = {
  id: string;
  email: string;
  role: UserRole;
};

async function listSupabaseUsersSafe(): Promise<SupabaseUserRow[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.listUsers();
    if (error) return [];
    return (data?.users ?? [])
      .map((user) => {
        const email = String(user.email ?? "").trim().toLowerCase();
        if (!email) return null;
        const metadataRole = (user.user_metadata as { role?: unknown } | null)?.role;
        const appRole = (user.app_metadata as { role?: unknown } | null)?.role;
        return {
          id: String(user.id),
          email,
          role: normalizeRole(metadataRole ?? appRole)
        } as SupabaseUserRow;
      })
      .filter((row): row is SupabaseUserRow => Boolean(row));
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.session.role !== "SuperAdmin") {
    return NextResponse.json({ error: "Super Admin access required." }, { status: 403 });
  }

  const sampleUsers = getSampleUsers();
  const registeredUsers = readRegisteredUsers(request.cookies.get(DEMO_USERS_COOKIE)?.value);
  const supabaseUsers = await listSupabaseUsersSafe();
  const permissions = readPermissions(request.cookies.get(DEMO_PERMISSIONS_COOKIE)?.value);
  const mergedByEmail = new Map<
    string,
    {
      email: string;
      role: UserRole;
      isSample: boolean;
    }
  >();

  for (const user of supabaseUsers) {
    mergedByEmail.set(user.email, {
      email: user.email,
      role: user.role,
      isSample: false
    });
  }
  for (const user of registeredUsers) {
    mergedByEmail.set(user.email, {
      email: user.email,
      role: user.role,
      isSample: false
    });
  }
  for (const user of sampleUsers) {
    mergedByEmail.set(user.email, {
      email: user.email,
      role: user.role,
      isSample: true
    });
  }

  const users = Array.from(mergedByEmail.values()).sort((a, b) => a.email.localeCompare(b.email));

  return NextResponse.json({
    users: users.map((user) => ({
      email: user.email,
      role: user.role,
      extraRoutes: permissions[user.email] ?? [],
      isSample: user.isSample
    })),
    grantableRoutes
  });
}

export async function POST(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.session.role !== "SuperAdmin") {
    return NextResponse.json({ error: "Super Admin access required." }, { status: 403 });
  }

  const body = (await request.json()) as { email?: string; extraRoutes?: string[] };
  const email = body.email?.toLowerCase().trim();
  const extraRoutes = (body.extraRoutes ?? []).filter((route) => grantableRoutes.includes(route));

  if (!email) {
    return NextResponse.json({ error: "User email is required." }, { status: 400 });
  }
  const idempotency = await beginIdempotentRequest(request, "admin:permissions-post");
  if (idempotency.errorResponse) return idempotency.errorResponse;
  if (idempotency.replayResponse) return idempotency.replayResponse;

  const updated = setUserExtraRoutes(
    email,
    [...new Set(extraRoutes)],
    request.cookies.get(DEMO_PERMISSIONS_COOKIE)?.value
  );

  const responseBody = { ok: true };
  await completeIdempotentRequest(idempotency.key, 200, responseBody);
  const response = NextResponse.json(responseBody);
  response.cookies.set(DEMO_PERMISSIONS_COOKIE, serializePermissions(updated), {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });
  return response;
}

export async function DELETE(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.session.role !== "SuperAdmin") {
    return NextResponse.json({ error: "Super Admin access required." }, { status: 403 });
  }
  const idempotency = await beginIdempotentRequest(request, "admin:permissions-delete");
  if (idempotency.errorResponse) return idempotency.errorResponse;
  if (idempotency.replayResponse) return idempotency.replayResponse;

  const responseBody = { ok: true };
  await completeIdempotentRequest(idempotency.key, 200, responseBody);
  const response = NextResponse.json(responseBody);
  response.cookies.set(DEMO_PERMISSIONS_COOKIE, serializePermissions({}), {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });
  return response;
}

export async function PATCH(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.session.role !== "SuperAdmin") {
    return NextResponse.json({ error: "Super Admin access required." }, { status: 403 });
  }

  const body = (await request.json()) as {
    action?: "updateRole" | "deleteUser";
    email?: string;
    role?: UserRole;
  };
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "User email is required." }, { status: 400 });
  }
  const idempotency = await beginIdempotentRequest(request, "admin:permissions-patch");
  if (idempotency.errorResponse) return idempotency.errorResponse;
  if (idempotency.replayResponse) return idempotency.replayResponse;

  const sampleUsers = getSampleUsers();
  const isSample = sampleUsers.some((user) => user.email === email);
  if (isSample) {
    return NextResponse.json({ error: "Sample users cannot be edited or deleted." }, { status: 400 });
  }
  if (email === auth.session.email && body.action === "deleteUser") {
    return NextResponse.json({ error: "You cannot delete your own active account." }, { status: 400 });
  }

  const registeredUsers = readRegisteredUsers(request.cookies.get(DEMO_USERS_COOKIE)?.value);
  const localUserExists = registeredUsers.some((user) => user.email === email);
  const supabaseUsers = await listSupabaseUsersSafe();
  const supabaseMatch = supabaseUsers.find((user) => user.email === email);
  const userExists = localUserExists || Boolean(supabaseMatch);
  if (!userExists) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (body.action === "deleteUser") {
    const updatedUsers = registeredUsers.filter((user) => user.email !== email);
    const permissions = readPermissions(request.cookies.get(DEMO_PERMISSIONS_COOKIE)?.value);
    delete permissions[email];

    try {
      if (supabaseMatch) {
        const admin = createAdminClient();
        await admin.auth.admin.deleteUser(supabaseMatch.id);
      }
    } catch {
      // Local delete still proceeds even if Supabase cleanup fails.
    }

    const responseBody = { ok: true };
    await completeIdempotentRequest(idempotency.key, 200, responseBody);
    const response = NextResponse.json(responseBody);
    response.cookies.set(DEMO_USERS_COOKIE, serializeRegisteredUsers(updatedUsers), {
      httpOnly: true,
      sameSite: "lax",
      path: "/"
    });
    response.cookies.set(DEMO_PERMISSIONS_COOKIE, serializePermissions(permissions), {
      httpOnly: true,
      sameSite: "lax",
      path: "/"
    });
    return response;
  }

  if (body.action !== "updateRole") {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }
  const normalizedRole = normalizeRole(body.role);
  if (!allRoles.includes(normalizedRole)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }

  const updatedUsers = registeredUsers.map((user) => (user.email === email ? { ...user, role: normalizedRole } : user));
  const permissions = readPermissions(request.cookies.get(DEMO_PERMISSIONS_COOKIE)?.value);
  const currentExtras = permissions[email] ?? [];
  const nextExtras = currentExtras.filter((route) => !ROLE_ACCESS[normalizedRole].includes(route));
  permissions[email] = nextExtras;

  try {
    if (supabaseMatch) {
      const admin = createAdminClient();
      const { data: existingUserResult, error: existingUserError } = await admin.auth.admin.getUserById(supabaseMatch.id);
      if (existingUserError) {
        throw new Error(existingUserError.message);
      }
      const existingUserMetadata =
        (existingUserResult.user?.user_metadata as Record<string, unknown> | undefined) ?? {};
      await admin.auth.admin.updateUserById(supabaseMatch.id, {
        user_metadata: {
          ...existingUserMetadata,
          role: normalizedRole
        }
      });
    }
  } catch {
    // Local role update still proceeds if Supabase metadata sync fails.
  }

  const responseBody = { ok: true };
  await completeIdempotentRequest(idempotency.key, 200, responseBody);
  const response = NextResponse.json(responseBody);
  response.cookies.set(DEMO_USERS_COOKIE, serializeRegisteredUsers(updatedUsers), {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });
  response.cookies.set(DEMO_PERMISSIONS_COOKIE, serializePermissions(permissions), {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });
  return response;
}
