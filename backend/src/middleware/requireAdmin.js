// Simplest thing that works for a solo founder: a hardcoded allowlist via
// env var rather than an isAdmin column + role management. Must run after
// requireAuth (needs req.account already loaded). Revisit once there's
// more than one admin to manage.
function requireAdmin(req, res, next) {
  const allowlist = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!allowlist.includes(req.account.email.toLowerCase())) {
    return res.status(403).json({ error: "Admin access required." });
  }
  next();
}

export { requireAdmin };
