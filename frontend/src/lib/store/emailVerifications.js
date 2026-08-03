import { readJSON, writeJSON } from "./persist";

const VERIFICATIONS_KEY = "abri:emailVerifications:v1";

// Short TTL for the domain-match path, where the link is generated and
// expected to be clicked in the same sitting. The manually-reviewed path
// uses a much longer TTL (see AuthContext.approveClaim) since the claimant
// may not check back until days after an admin approves.
const DEFAULT_TOKEN_TTL_MS = 15 * 60 * 1000;

let verificationCache = null;

function loadVerifications() {
  if (verificationCache) return verificationCache;
  verificationCache = readJSON(VERIFICATIONS_KEY, []);
  return verificationCache;
}

function persistVerifications() {
  writeJSON(VERIFICATIONS_KEY, verificationCache);
}

function generateToken() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `tok_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

// Stands in for "sending a verification email." Two shapes, depending on
// where in the claim lifecycle it's minted:
//  - `claimPayload` set, `accountId` unset: nothing exists yet (domain-match
//    path) — consuming the token is what creates the account/business.
//  - `accountId` set, `claimPayload` unset: the account/business already
//    exist and are already approved (manual-review path, minted at the
//    moment an admin approves) — consuming the token just finalizes email
//    verification and signs the claimant in.
function createVerificationToken({ email, businessId, claimPayload, accountId, ttlMs = DEFAULT_TOKEN_TTL_MS }) {
  const all = loadVerifications();
  const now = Date.now();
  const record = {
    token: generateToken(),
    email,
    businessId,
    claimPayload: claimPayload ?? null,
    accountId: accountId ?? null,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
    consumed: false,
  };
  verificationCache = [...all, record];
  persistVerifications();
  return record;
}

// Validates and marks the token consumed in one step so a link can't be
// clicked twice. Returns { ok: true, record } or { ok: false, error }.
function consumeToken(token) {
  const all = loadVerifications();
  const idx = all.findIndex((v) => v.token === token);
  if (idx === -1) return { ok: false, error: "This verification link is invalid." };

  const record = all[idx];
  if (record.consumed) {
    return { ok: false, error: "This verification link has already been used." };
  }
  if (new Date(record.expiresAt).getTime() < Date.now()) {
    return { ok: false, error: "This verification link has expired." };
  }

  const consumedRecord = { ...record, consumed: true };
  verificationCache = [...all.slice(0, idx), consumedRecord, ...all.slice(idx + 1)];
  persistVerifications();
  return { ok: true, record: consumedRecord };
}

export { createVerificationToken, consumeToken };
