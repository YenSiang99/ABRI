import { prisma } from "../prisma.js";
import { SESSION_COOKIE, verifySessionToken } from "../lib/jwt.js";
import { asyncHandler } from "../lib/asyncHandler.js";

// Loads the account for the session cookie onto req.account. 401s if
// there's no valid session — use this on any route that needs a logged-in
// account. (A route that only needs to *know* whether someone's logged in,
// without requiring it, would need a separate non-401ing variant — none of
// today's routes need that yet.)
const requireAuth = asyncHandler(async (req, res, next) => {
  const accountId = verifySessionToken(req.cookies[SESSION_COOKIE]);
  if (!accountId) {
    return res.status(401).json({ error: "Not authenticated." });
  }

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) {
    return res.status(401).json({ error: "Not authenticated." });
  }

  req.account = account;
  next();
});

export { requireAuth };
