// How long an auto-approve claim link (domain or listing-email match) stays
// open. Short, because it is meant to be clicked in one sitting, and shared
// because two routes mint it: the claim itself (routes/businesses.js) and a
// resend after it expired (routes/auth.js).
const CLAIM_TOKEN_TTL_MS = 15 * 60 * 1000;

export { CLAIM_TOKEN_TTL_MS };
