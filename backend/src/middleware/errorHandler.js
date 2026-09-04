// Catches anything forwarded via next(err) — including DB/network failures
// from Prisma — and always returns JSON instead of Express's default HTML
// error page, which would otherwise leak a full stack trace to the client.
function errorHandler(err, req, res, next) {
  console.error(err);

  if (err.name === "PrismaClientInitializationError" || err.code === "P1001") {
    return res.status(503).json({ error: "Can't reach the database right now." });
  }
  // Unique-constraint violation — most often a duplicate email slipping
  // past the pre-check under concurrent requests.
  if (err.code === "P2002") {
    return res.status(409).json({ error: "That value is already in use." });
  }
  // Foreign-key violation — a delete blocked by rows still pointing at the
  // target, or a write naming a row that doesn't exist. This is a backstop,
  // not a fix: every one of these is a route that should have cleaned up or
  // validated first, and a 409 on (say) "reject this claim" is still a
  // broken admin flow. It's here so the next one names itself in the
  // response instead of rendering as an indistinguishable 500.
  if (err.code === "P2003") {
    return res.status(409).json({ error: "That record is still referenced by something else." });
  }
  if (err.status) {
    return res.status(err.status).json({
      error: err.message,
      // Only set by a paywall throw (failUpgrade in routes/vouches.js), and
      // the reason those are 402s rather than 403s: the client shows an
      // upgrade prompt naming this membership tier instead of toasting the
      // message. Renamed from `upgradeRequired`, which never said upgrade to
      // WHAT — the value was always a tier key.
      // Keyed off the field rather than off the status so a future 402 that
      // isn't a plan gate can't accidentally open a pricing dialog.
      ...(err.requiredMembershipTier ? { requiredMembershipTier: err.requiredMembershipTier } : {}),
    });
  }

  res.status(500).json({ error: "Something went wrong." });
}

export { errorHandler };
