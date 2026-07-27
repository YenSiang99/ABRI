import { readJSON, writeJSON } from "./persist";
import { getBusiness } from "./businesses";

const PENDING_CONNECTIONS_KEY = "abri:pendingConnections:v1";

// Bridges the gap between "scanned a card while logged out" and "actually
// has a session" — registering in this app means claiming a business,
// which (outside the instant domain-match path) doesn't log the claimant
// in until an admin approves and they click an emailed link, possibly days
// later in a different tab. So the intent to connect is queued here and
// consumed whenever that account's first session actually starts (see
// persistSession in AuthContext.jsx), the same way a claim's own
// completion is deferred via emailVerifications.js.
let pendingCache = null;

function loadPending() {
  if (pendingCache) return pendingCache;
  pendingCache = readJSON(PENDING_CONNECTIONS_KEY, []);
  return pendingCache;
}

function persistPending() {
  writeJSON(PENDING_CONNECTIONS_KEY, pendingCache);
}

function addPendingConnection({ accountId, businessId }) {
  const all = loadPending();
  const exists = all.some((p) => p.accountId === accountId && p.businessId === businessId);
  if (exists) return;
  pendingCache = [...all, { accountId, businessId }];
  persistPending();
}

// Removes and returns the businessIds queued for this account, dropping any
// whose target business no longer exists or was reverted to unclaimed
// (e.g. removeClaim) in the meantime — a stale connect target isn't an
// error, it's just nothing to do.
function consumePendingConnections(accountId) {
  const all = loadPending();
  const [matched, rest] = all.reduce(
    ([m, r], p) => (p.accountId === accountId ? [[...m, p], r] : [m, [...r, p]]),
    [[], []],
  );
  if (matched.length === 0) return [];

  pendingCache = rest;
  persistPending();

  return matched.map((p) => p.businessId).filter((businessId) => getBusiness(businessId));
}

export { addPendingConnection, consumePendingConnections };
