// Ported from the frontend (lib/domainVerification.js) — same rules, same
// reasoning: public webmail can never satisfy a company-domain match since
// anyone can create an address on it, so those always fall back to manual
// admin review regardless of the business's `domain` field.
const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "outlook.com",
  "hotmail.com",
  "hotmail.co.uk",
  "live.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "qq.com",
  "163.com",
  "126.com",
  "msn.com",
  "mail.com",
  "yandex.com",
  "gmx.com",
]);

function extractDomain(email) {
  if (!email || typeof email !== "string") return null;
  const at = email.lastIndexOf("@");
  if (at === -1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return domain || null;
}

function isPublicEmailDomain(domain) {
  return Boolean(domain) && PUBLIC_EMAIL_DOMAINS.has(domain.toLowerCase());
}

// True only when the business has a known, non-public canonical domain that
// exactly matches the claimant email's domain. `business.domain` is set at
// seed/import time (or by an admin) — never by the claimant themselves — so
// this can't be gamed by typing in an arbitrary company name.
function matchesBusinessDomain(email, businessDomain) {
  const domain = businessDomain?.trim().toLowerCase();
  if (!domain || isPublicEmailDomain(domain)) return false;
  const emailDomain = extractDomain(email);
  return Boolean(emailDomain) && emailDomain === domain;
}

export { extractDomain, isPublicEmailDomain, matchesBusinessDomain };