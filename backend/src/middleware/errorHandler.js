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
  if (err.status) {
    return res.status(err.status).json({ error: err.message });
  }

  res.status(500).json({ error: "Something went wrong." });
}

export { errorHandler };
