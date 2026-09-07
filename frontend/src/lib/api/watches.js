import { apiFetch } from "./client";

// Mirrors backend/src/routes/watches.js — the two Pro tools on the
// check-a-business screen.
//
// Every call is keyed off the SESSION. There is no function here that takes a
// business id and asks who is watching or who has checked it, and there must
// not be: "what have I checked" becoming "who has been checking me" is what
// would turn a trust directory into surveillance. Same rule
// lib/api/follows.js states about follower lists.
//
// All four reject with a 402 carrying `requiredMembershipTier` below Pro, so
// a caller can open an upgrade prompt rather than toasting an error.

function fetchWatches() {
  return apiFetch("/watches").then((data) => data.watches);
}

// Idempotent — watching something you already watch succeeds.
//
// Unlike followBusiness, an UNCLAIMED listing is allowed and is the best
// reason to use this: the whole point is being told the moment somebody
// stands behind a bare listing.
function watchBusiness(businessId) {
  return apiFetch("/watches", { method: "POST", body: { businessId } }).then((d) => d.watch);
}

// Keyed by BUSINESS id, matching unfollowBusiness: the caller is a result card
// that knows the business and nothing else.
function unwatchBusiness(businessId) {
  return apiFetch(`/watches/${businessId}`, { method: "DELETE" });
}

// The member's own history. Takes no argument, and that is the feature.
function fetchChecks() {
  return apiFetch("/watches/checks").then((data) => data.checks);
}

export { fetchWatches, watchBusiness, unwatchBusiness, fetchChecks };
