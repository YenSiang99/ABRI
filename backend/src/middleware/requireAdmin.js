// Must run after requireAuth (needs req.account already loaded).
function requireAdmin(req, res, next) {
  if (!req.account.isAdmin) {
    return res.status(403).json({ error: "Admin access required." });
  }
  next();
}

export { requireAdmin };
