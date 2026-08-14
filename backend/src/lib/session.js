import { signSessionToken } from "./jwt.js";
import { setSessionCookie } from "./cookies.js";
import { loadAccountView } from "./accountView.js";
import { consumePendingConnections } from "./connections.js";

// The one way a session starts. Every route that logs someone in goes
// through here (routes/auth.js: login, and both verify-claim branches), so
// "what has to happen when a session begins" is answerable by reading one
// function instead of grepping for setSessionCookie.
//
// That matters because of the queued-connection step. Today only the
// manual-review verify branch can be an account's genuine first session —
// login is gated on emailVerified, so a claimant can't reach it first — but
// that's an invariant living two lines away in another file, and if it ever
// changes, a queued connect intent would strand with nothing to report it.
// Running the consume on every session start costs one indexed findMany
// that returns nothing, and consumption is idempotent by construction
// (the rows are deleted), so paying it everywhere buys correctness that
// can't rot.
//
// Awaited, so the client's first GET /connections after this sees the edge.
// Never allowed to throw: a queued connect intent must not be able to fail
// somebody's login. Same rule as pruneActivityEvents in routes/businesses.js
// — housekeeping never fails the request — except logged rather than
// silently swallowed, since a failure here means a connection nobody made.
async function startSession(res, accountId) {
  await consumePendingConnections(accountId).catch((err) => {
    console.error("Failed to consume pending connections", err);
  });

  setSessionCookie(res, signSessionToken(accountId));
  return loadAccountView(accountId);
}

export { startSession };
