/**
 * Admin access helpers.
 *
 * An "admin" is any logged-in user whose email appears in the
 * ADMIN_EMAILS environment variable (comma-separated, case-insensitive).
 *
 *   ADMIN_EMAILS=srbow.tw@gmail.com,someone@else.com
 */

export function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = getAdminEmails();
  if (list.length === 0) return false;
  return list.includes(email.toLowerCase());
}
