import { NextRequest, NextResponse } from "next/server";
import {
  DEMO_USERS_COOKIE,
  buildRegisteredUser,
  findUser,
  readRegisteredUsers,
  serializeRegisteredUsers
} from "@/lib/auth/demo-auth";
import { requireDemoSession } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { isStrongPassword, PASSWORD_POLICY_MESSAGE } from "@/lib/security/password-policy";

type ChangePasswordBody = {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
};

export async function POST(request: NextRequest) {
  const auth = requireDemoSession(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const rateLimited = enforceRateLimit(request, "account-change-password", 10, 60_000);
  if (rateLimited) return rateLimited;

  const body = (await request.json()) as ChangePasswordBody;
  const currentPassword = String(body.currentPassword ?? "");
  const newPassword = String(body.newPassword ?? "");
  const confirmPassword = String(body.confirmPassword ?? "");

  if (!currentPassword || !newPassword || !confirmPassword) {
    return NextResponse.json({ error: "All password fields are required." }, { status: 400 });
  }
  if (!isStrongPassword(newPassword)) {
    return NextResponse.json({ error: PASSWORD_POLICY_MESSAGE }, { status: 400 });
  }
  if (newPassword !== confirmPassword) {
    return NextResponse.json({ error: "New password and confirmation do not match." }, { status: 400 });
  }
  if (newPassword === currentPassword) {
    return NextResponse.json(
      { error: "New password must be different from current password." },
      { status: 400 }
    );
  }

  const existingUsers = readRegisteredUsers(request.cookies.get(DEMO_USERS_COOKIE)?.value);
  const currentUser = findUser(auth.session.email, currentPassword, existingUsers);
  if (!currentUser || currentUser.email !== auth.session.email) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });
  }

  const withoutCurrentEmail = existingUsers.filter((user) => user.email !== auth.session.email);
  const updatedUsers = [
    ...withoutCurrentEmail,
    buildRegisteredUser(auth.session.email, newPassword, auth.session.role)
  ];

  let warning: string | undefined;
  if (auth.session.supabaseUserId) {
    try {
      const admin = createAdminClient();
      const { error } = await admin.auth.admin.updateUserById(auth.session.supabaseUserId, {
        password: newPassword
      });
      if (error) {
        warning = "Password changed locally, but Supabase sync failed.";
      }
    } catch {
      warning = "Password changed locally, but Supabase sync failed.";
    }
  }

  const response = NextResponse.json({ ok: true, warning });
  response.cookies.set(DEMO_USERS_COOKIE, serializeRegisteredUsers(updatedUsers), {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });
  return response;
}
