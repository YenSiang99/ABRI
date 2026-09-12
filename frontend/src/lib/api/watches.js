import { apiFetch } from "./client";

// Mirrors backend/src/routes/watches.js — the two Pro tools on the
// check-a-business screen.
//
// Every call is keyed off the SESSION. None takes a business id and asks who
// is watching or who has checked THAT business, and none may: watches are
// private to the watcher, and "what have I checked" must not become "who has
// been checking me". Same rule lib/api/follows.js states about follower lists.
//
// fetchProfileViewers is the one thing here that reads inbound, and it reads a
// different table for it (ProfileView, not BusinessCheck) — see its note
// below and the model comment in backend/prisma/schema.prisma.
//
// The first four reject with a 402 carrying `requiredMembershipTier` below
// Pro, so a caller can open an upgrade prompt rather than toasting an error.
// fetchProfileViewers is the exception and never rejects on plan: it always
// resolves, and the caller reads `identitiesLocked` off the body.

function fetchWatches() {
  return apiFetch("/watches").then((data) => data.watches);
}

// Idempotent — watching something you already watch succeeds.
//
// Unlike followBusiness, an UNCLAIMED listing is allowed and is the best
// reason to use this: the whole point is being told the moment somebody
// stands behind a bare listing.
function watchBusiness(businessId) {
  return apiFetch("/watches", { method: "POST", body: { businessId } }).then(
    (d) => d.watch,
  );
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

// Who opened your profile.
//
// RESOLVES ON EVERY PLAN — do not add a 402 path here. The counts are not the
// paid half: a Free member is told that seven businesses looked at them, which
// is the signal worth opening the app for, and the names are what Pro buys.
// The body carries `identitiesLocked`, and `viewers` is ABSENT rather than
// empty when it is true. A caller that reads `viewers.length` without checking
// the flag will render "nobody viewed you" to a member who is being viewed —
// the one sentence this screen must never show.
function fetchProfileViewers() {
  return apiFetch("/watches/viewers");
}

// Browse without being named.
//
// COSTS THE CALLER THEIR OWN VIEWER LIST while it is on — the server enforces
// that, and fetchProfileViewers starts answering `lockedReason:
// "private_browsing"` instead of names. Surface the trade BEFORE the toggle
// flips, not after: a member who discovers it by finding their own list gone
// has been surprised by a setting they chose, which reads as a bug.
//
// Takes a boolean and returns the stored value, so a caller can set state from
// the response rather than assuming its own optimistic value stuck.
function setPrivateBrowsing(privateBrowsing) {
  return apiFetch("/watches/private-browsing", {
    method: "PUT",
    body: { privateBrowsing },
  }).then((d) => d.privateBrowsing);
}

export {
  fetchWatches,
  watchBusiness,
  unwatchBusiness,
  fetchChecks,
  fetchProfileViewers,
  setPrivateBrowsing,
};
