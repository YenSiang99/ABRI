import { apiFetch } from "./client";

// Mirrors backend/src/routes/admin.js.

function fetchAdminClaims() {
  return apiFetch("/admin/claims").then((data) => data.claims);
}

function approveAdminClaim(accountId) {
  return apiFetch(`/admin/claims/${accountId}/approve`, { method: "POST" });
}

function rejectAdminClaim(accountId) {
  return apiFetch(`/admin/claims/${accountId}/reject`, { method: "POST" });
}

function revokeAdminClaim(accountId) {
  return apiFetch(`/admin/claims/${accountId}/revoke`, { method: "POST" });
}

function verifySsm(businessId) {
  return apiFetch(`/admin/businesses/${businessId}/verify-ssm`, { method: "POST" });
}

function revokeSsm(businessId) {
  return apiFetch(`/admin/businesses/${businessId}/revoke-ssm`, { method: "POST" });
}

// Sets the membership tier by hand — the only way to fulfil a sale until
// there's a payment page. `expiresAt` is an ISO date string or null; the
// backend stores it but nothing acts on it yet, so an expired date does
// not downgrade anyone.
function setBusinessMembershipTier(businessId, { membershipTier, expiresAt } = {}) {
  return apiFetch(`/admin/businesses/${businessId}/membership-tier`, {
    method: "POST",
    body: { membershipTier, expiresAt: expiresAt || null },
  }).then((data) => data.business);
}

// Every vouch an admin has been asked to look at, each with its full
// timeline and the reports raised against it. `status: "all"` also returns
// ones whose reports have already been marked reviewed.
// The SSM review queue: businesses that submitted a registration number and
// are still L1. That pair IS the pending state — there is no status column —
// so this list and the member's own screen can never disagree about who is
// waiting. See POST /businesses/me/ssm.
function fetchSsmReviews() {
  return apiFetch("/admin/ssm-reviews").then((data) => data.businesses);
}

// Turn down a submitted number. CLEARS it rather than flagging it, so the
// business returns to "nothing submitted" and can send a corrected one
// through the same door. Takes no note: ActivityEvent has no detail column,
// so a reason typed here would be discarded before it reached the member —
// see the route's comment.
function rejectSsm(businessId) {
  return apiFetch(`/admin/businesses/${businessId}/reject-ssm`, { method: "POST" });
}

function fetchVouchReviews({ status } = {}) {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch(`/admin/vouch-reviews${query}`).then((data) => data.reviews);
}

// Moves a frozen vouch out of under_review. `decision` is one of
// "return_to_receiver" | "send_back_to_sender" | "cancel"; `note` is
// required for send_back_to_sender and shown to both businesses. Resolves
// the vouch's open reports as a side effect and returns the refreshed
// review card.
function decideVouchReview(id, { decision, note } = {}) {
  return apiFetch(`/admin/vouch-reviews/${id}/decide`, {
    method: "POST",
    body: { decision, note },
  }).then((data) => data.review);
}

// The settled-vouch path: records a verdict on a report without moving
// anything, since there's nothing left to move.
function resolveVouchFlag(id, { outcome, note } = {}) {
  return apiFetch(`/admin/vouch-flags/${id}/resolve`, {
    method: "POST",
    body: { outcome, note },
  }).then((data) => data.flag);
}

// The Asks queue. Two decide routes rather than one, because an ask and an
// answer are different things with different exits — restore/close for an
// ask, restore/remove for an answer. `outcome` is never sent: the server
// derives it from the decision, so an admin cannot record "closed it, but the
// report was fine".
function fetchAskReviews({ status } = {}) {
  const qs = status ? `?status=${status}` : "";
  return apiFetch(`/admin/ask-reviews${qs}`).then((data) => data.reviews);
}

function decideAskReview(askId, { decision, note } = {}) {
  return apiFetch(`/admin/ask-reviews/asks/${askId}/decide`, {
    method: "POST",
    body: { decision, note },
  });
}

function decideAnswerReview(answerId, { decision, note } = {}) {
  return apiFetch(`/admin/ask-reviews/answers/${answerId}/decide`, {
    method: "POST",
    body: { decision, note },
  });
}

// Only for reports that froze nothing. One whose target is still frozen is
// refused — it has to go through the decision above, so the ruling and the
// content move together.
function resolveAskFlag(id, { outcome } = {}) {
  return apiFetch(`/admin/ask-flags/${id}/resolve`, { method: "POST", body: { outcome } });
}

export {
  fetchSsmReviews,
  rejectSsm,
  fetchAdminClaims,
  approveAdminClaim,
  rejectAdminClaim,
  revokeAdminClaim,
  verifySsm,
  revokeSsm,
  setBusinessMembershipTier,
  fetchVouchReviews,
  decideVouchReview,
  resolveVouchFlag,
  fetchAskReviews,
  decideAskReview,
  decideAnswerReview,
  resolveAskFlag,
};
