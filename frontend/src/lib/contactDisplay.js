// Shared by the contact block and the unclaimed About section.

export const linkClass =
  "underline underline-offset-4 hover:text-grey-600 dark:hover:text-muted-foreground";

// The scheme is stripped for display only — the href keeps the full absolute
// URL the server normalised and validated (http/https only, enforced in
// backend/src/lib/contactFields.js).
export function hostOf(website) {
  try {
    return new URL(website).host;
  } catch {
    return website;
  }
}
