import jwt from "jsonwebtoken";

const SESSION_COOKIE = "abri_session";
const TOKEN_TTL = "7d";

function signSessionToken(accountId) {
  return jwt.sign({ accountId }, process.env.JWT_SECRET, { expiresIn: TOKEN_TTL });
}

// Returns the accountId, or null if the token is missing/invalid/expired —
// callers treat any of those the same way (not authenticated), so there's
// no need to distinguish them here.
function verifySessionToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET).accountId;
  } catch {
    return null;
  }
}

// Handed back by POST /businesses/claim on the admin path, so the claimant can
// use the listing-email code (lib/claimCode.js) on the very next screen,
// before they have confirmed their own email and so before any session. It
// is scoped: verifySessionToken ignores it, because a session token has no
// `scope` and this one never carries `accountId` — it can't log anyone in.
const CLAIM_HANDLE_TTL = "30m";
const CLAIM_HANDLE_SCOPE = "claim-code";

function signClaimHandle(accountId) {
  return jwt.sign({ claimAccountId: accountId, scope: CLAIM_HANDLE_SCOPE }, process.env.JWT_SECRET, {
    expiresIn: CLAIM_HANDLE_TTL,
  });
}

// The accountId, or null for anything else — including a session token.
function verifyClaimHandle(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return payload.scope === CLAIM_HANDLE_SCOPE ? payload.claimAccountId ?? null : null;
  } catch {
    return null;
  }
}

export { SESSION_COOKIE, signSessionToken, verifySessionToken, signClaimHandle, verifyClaimHandle };
