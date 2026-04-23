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

const grantableRoutes = SIDEBAR_LINKS.filter((link) => link.grantable).map((link) => link.href);
const allRoles: UserRole[] = ["SuperAdmin", "Admin", "Inventory", "Sales", "Client"];

export async function GET(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.session.role !== "SuperAdmin") {
    return NextResponse.json({ error: "Super Admin access required." }, { status: 403 });
  }

  const users = [...getSampleUsers(), ...readRegisteredUsers(request.cookies.get(DEMO_USERS_COOKIE)?.value)];
  const permissions = readPermissions(request.cookies.get(DEMO_PERMISSIONS_COOKIE)?.value);

  return NextResponse.json({
    users: users.map((user) => ({
      email: user.email,
      role: user.role,
      extraRoutes: permissions[user.email] ?? [],
      isSample: getSampleUsers().some((sample) => sample.email === user.email)
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

  const updated = setUserExtraRoutes(
    email,
    [...new Set(extraRoutes)],
    request.cookies.get(DEMO_PERMISSIONS_COOKIE)?.value
  );

  const response = NextResponse.json({ ok: true });
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

  const response = NextResponse.json({ ok: true });
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

  const sampleUsers = getSampleUsers();
  const isSample = sampleUsers.some((user) => user.email === email);
  if (isSample) {
    return NextResponse.json({ error: "Sample users cannot be edited or deleted." }, { status: 400 });
  }
  if (email === auth.session.email && body.action === "deleteUser") {
    return NextResponse.json({ error: "You cannot delete your own active account." }, { status: 400 });
  }

  const registeredUsers = readRegisteredUsers(request.cookies.get(DEMO_USERS_COOKIE)?.value);
  const existing = registeredUsers.find((user) => user.email === email);
  if (!existing) {
    return NextResponse.json({ error: "User not found in local registry." }, { status: 404 });
  }

  if (body.action === "deleteUser") {
    const updatedUsers = registeredUsers.filter((user) => user.email !== email);
    const permissions = readPermissions(request.cookies.get(DEMO_PERMISSIONS_COOKIE)?.value);
    delete permissions[email];

    try {
      const admin = createAdminClient();
      const { data: usersResult, error: listError } = await admin.auth.admin.listUsers();
      if (!listError) {
        const supabaseUser = usersResult.users.find((user) => user.email?.toLowerCase() === email);
        if (supabaseUser) {
          await admin.auth.admin.deleteUser(supabaseUser.id);
        }
      }
    } catch {
      // Local delete still proceeds even if Supabase cleanup fails.
    }

    const response = NextResponse.json({ ok: true });
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

  const updatedUsers = registeredUsers.map((user) =>
    user.email === email ? { ...user, role: normalizedRole } : user
  );
  const permissions = readPermissions(request.cookies.get(DEMO_PERMISSIONS_COOKIE)?.value);
  const currentExtras = permissions[email] ?? [];
  const nextExtras = currentExtras.filter((route) => !ROLE_ACCESS[normalizedRole].includes(route));
  permissions[email] = nextExtras;

  try {
    const admin = createAdminClient();
    const { data: usersResult, error: listError } = await admin.auth.admin.listUsers();
    if (!listError) {
      const supabaseUser = usersResult.users.find((user) => user.email?.toLowerCase() === email);
      if (supabaseUser) {
        await admin.auth.admin.updateUserById(supabaseUser.id, {
          user_metadata: {
            ...(supabaseUser.user_metadata ?? {}),
            role: normalizedRole
          }
        });
      }
    }
  } catch {
    // Local role update still proceeds if Supabase metadata sync fails.
  }

  const response = NextResponse.json({ ok: true });
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
