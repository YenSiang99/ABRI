// Simplest thing that works for a solo founder: a hardcoded allowlist via
// env var rather than an isAdmin column + role management. Revisit once
// there's more than one admin to manage.
function isAdminEmail(email) {
  const allowlist = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return allowlist.includes(email.toLowerCase());
}

// Must run after requireAuth (needs req.account already loaded).
function requireAdmin(req, res, next) {
  if (!isAdminEmail(req.account.email)) {
    return res.status(403).json({ error: "Admin access required." });
  }
  next();
}

export { requireAdmin, isAdminEmail };
