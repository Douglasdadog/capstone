import { generateSecret, generateURI, verify } from "otplib";
import { createAdminClient } from "@/lib/supabase/admin";

export const MFA_ISSUER = "IMARFLEX WIS";

type SupabaseMfaMeta = {
  enabled: boolean;
  secret: string | null;
};

type SupabaseUserMeta = Record<string, unknown>;

function readMetaValue(meta: SupabaseUserMeta | undefined, key: string): unknown {
  if (!meta) return undefined;
  return meta[key];
}

export function generateTotpSecret(email: string) {
  const secret = generateSecret();
  const otpauthUrl = generateURI({
    label: email,
    issuer: MFA_ISSUER,
    secret
  });
  return { secret, otpauthUrl };
}

export async function verifyTotpToken(token: string, secret: string): Promise<boolean> {
  const result = await verify({ token, secret });
  return Boolean(result.valid);
}

export async function getSupabaseMfaMeta(userId: string): Promise<SupabaseMfaMeta> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) {
    return { enabled: false, secret: null };
  }

  const enabled = Boolean(readMetaValue(data.user.user_metadata as SupabaseUserMeta, "mfa_enabled"));
  const secretValue = readMetaValue(data.user.user_metadata as SupabaseUserMeta, "mfa_secret");
  const secret = typeof secretValue === "string" && secretValue.length > 0 ? secretValue : null;

  return { enabled, secret };
}

export async function saveSupabaseMfaSecret(userId: string, secret: string) {
  const admin = createAdminClient();
  const { data, error: readError } = await admin.auth.admin.getUserById(userId);
  if (readError || !data.user) {
    throw new Error(readError?.message ?? "Unable to load Supabase user.");
  }

  const userMetadata = (data.user.user_metadata ?? {}) as SupabaseUserMeta;
  const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...userMetadata,
      mfa_enabled: true,
      mfa_secret: secret
    }
  });

  if (updateError) {
    throw new Error(updateError.message);
  }
}
