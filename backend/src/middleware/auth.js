import { prisma } from "../prisma.js";
import { SESSION_COOKIE, verifySessionToken } from "../lib/jwt.js";
import { asyncHandler } from "../lib/asyncHandler.js";

// The half both middlewares below share: resolve the session cookie to an
// Account row, or null. Never throws and never responds — every way a session
// can fail (no cookie, forged or expired token, an account deleted since the
// token was minted) collapses to null here, so the caller is the one that
// decides whether that's a 401 or simply "nobody is logged in".
//
// No `include: { business: true }` on purpose: businessId and isAdmin are
// plain columns on Account, which is everything either caller needs today,
// and keeping this to a single primary-key lookup is what makes optionalAuth
// cheap enough to mount on a public, high-traffic route.
async function accountFromSession(req) {
  const accountId = verifySessionToken(req.cookies[SESSION_COOKIE]);
  if (!accountId) return null;
  return prisma.account.findUnique({ where: { id: accountId } });
}

// Loads the account for the session cookie onto req.account. 401s if there's
// no valid session — use this on any route that needs a logged-in account.
// For a route that only needs to *know* whether someone's logged in, see
// optionalAuth below.
const requireAuth = asyncHandler(async (req, res, next) => {
  const account = await accountFromSession(req);
  if (!account) {
    return res.status(401).json({ error: "Not authenticated." });
  }

  req.account = account;
  next();
});

// The non-401ing variant, for routes that are PUBLIC but behave differently
// once they know who's asking. Today that's GET /businesses/:id, which
// withholds a paying member's contact details from anonymous visitors as an
// anti-scraping measure — see lib/contactVisibility.js.
//
// Sets req.account to null rather than leaving it undefined, so a handler can
// tell "optionalAuth ran and nobody is logged in" apart from "the middleware
// isn't mounted on this route".
//
// The footgun this creates is real and worth naming: under requireAuth,
// req.account is guaranteed truthy, and handlers in routes/businesses.js
// reach straight into req.account.businessId. Anything running under THIS
// middleware must use req.account?.something instead. That is the reason the
// contact rule is a function taking (business, viewer) rather than an inline
// check reading req.account at the call site — one place to get it right.
//
// An expired cookie on a public page has to render the page, not error, so
// there is deliberately no failure branch here at all.
const optionalAuth = asyncHandler(async (req, res, next) => {
  req.account = await accountFromSession(req);
  next();
});

export { requireAuth, optionalAuth };
