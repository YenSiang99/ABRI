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

export { SESSION_COOKIE, signSessionToken, verifySessionToken };
