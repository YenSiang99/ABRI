import { apiFetch } from "./client";

// Mirrors backend/src/routes/follows.js.
//
// Deliberately thin, and the missing calls are the feature: there is no
// accept, no decline and no withdraw. Following is one-way and unannounced —
// the followed business is never told — see the Follow comment in
// backend/prisma/schema.prisma.
//
// Note what fetchFollowers below is NOT: it takes no argument. Both reads are
// keyed off the session, so there is no way to ask about anyone else's
// follows in either direction. That is what keeps a follower count off other
// people's profiles.

// Who the logged-in business follows.
function fetchFollowing() {
  return apiFetch("/follows").then((data) => data.following);
}

// Who follows the logged-in business. Your own followers only, always.
function fetchFollowers() {
  return apiFetch("/follows/followers").then((data) => data.followers);
}

// Idempotent — following someone you already follow succeeds.
function followBusiness(businessId) {
  return apiFetch("/follows", { method: "POST", body: { businessId } }).then((data) => data.follow);
}

// Keyed by BUSINESS id rather than the follow row's, unlike removeConnection.
// The caller is a profile page that knows the business and nothing else, and
// making it look up a follow id first would be a round trip to learn
// something the server can derive. Unfollowing something you don't follow is
// a no-op, not an error.
function unfollowBusiness(businessId) {
  return apiFetch(`/follows/${businessId}`, { method: "DELETE" });
}

export { fetchFollowing, fetchFollowers, followBusiness, unfollowBusiness };
