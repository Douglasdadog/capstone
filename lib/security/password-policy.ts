const SPECIAL_CHARACTER_REGEX = /[^A-Za-z0-9]/;
const UPPERCASE_REGEX = /[A-Z]/;

export const PASSWORD_POLICY_MESSAGE =
  "Password must be at least 8 characters and include at least one uppercase letter and one special character.";

export function isStrongPassword(password: string): boolean {
  if (password.length < 8 || password.length > 128) {
    return false;
  }
  if (!UPPERCASE_REGEX.test(password)) {
    return false;
  }
  if (!SPECIAL_CHARACTER_REGEX.test(password)) {
    return false;
  }
  return true;
}
