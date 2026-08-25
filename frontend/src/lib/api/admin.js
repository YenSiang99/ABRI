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

// Sets the membership plan by hand — the only way to fulfil a sale until
// there's a payment page. `expiresAt` is an ISO date string or null; the
// backend stores it but nothing acts on it yet, so an expired date does
// not downgrade anyone.
function setBusinessPlan(businessId, { plan, expiresAt } = {}) {
  return apiFetch(`/admin/businesses/${businessId}/plan`, {
    method: "POST",
    body: { plan, expiresAt: expiresAt || null },
  }).then((data) => data.business);
}

// Every vouch an admin has been asked to look at, each with its full
// timeline and the reports raised against it. `status: "all"` also returns
// ones whose reports have already been marked reviewed.
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

export {
  fetchAdminClaims,
  approveAdminClaim,
  rejectAdminClaim,
  revokeAdminClaim,
  verifySsm,
  revokeSsm,
  setBusinessPlan,
  fetchVouchReviews,
  decideVouchReview,
  resolveVouchFlag,
};
