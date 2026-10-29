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
// there's a payment page. `expiresAt` is an ISO date string or null, and is
// enforced: an expired tier drops to Free. `paid: true` records a SALE
// instead: a year that starts the day the business is SSM-Verified (now, if
// it already is), and `expiresAt` is ignored.
function setBusinessMembershipTier(businessId, { membershipTier, expiresAt, paid = false } = {}) {
  return apiFetch(`/admin/businesses/${businessId}/membership-tier`, {
    method: "POST",
    body: { membershipTier, expiresAt: expiresAt || null, paid },
  }).then((data) => data.business);
}

// Every endorsement an admin has been asked to look at, each with its full
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

function fetchEndorsementReviews({ status } = {}) {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch(`/admin/endorsement-reviews${query}`).then((data) => data.reviews);
}

// Moves a frozen endorsement out of under_review. `decision` is one of
// "return_to_receiver" | "send_back_to_sender" | "cancel"; `note` is
// required for send_back_to_sender and shown to both businesses. Resolves
// the endorsement's open reports as a side effect and returns the refreshed
// review card.
function decideEndorsementReview(id, { decision, note } = {}) {
  return apiFetch(`/admin/endorsement-reviews/${id}/decide`, {
    method: "POST",
    body: { decision, note },
  }).then((data) => data.review);
}

// The settled-endorsement path: records a verdict on a report without moving
// anything, since there's nothing left to move.
function resolveEndorsementFlag(id, { outcome, note } = {}) {
  return apiFetch(`/admin/endorsement-flags/${id}/resolve`, {
    method: "POST",
    body: { outcome, note },
  }).then((data) => data.flag);
}

// The Founding programme's two dates (backend lib/founding.js). Both ISO
// strings or null. Saving moves every business still on Founding Pro to the
// new end date; the response counts them.
function fetchFoundingSettings() {
  return apiFetch("/admin/settings/founding");
}

function saveFoundingSettings({ closesAt, proEndsAt }) {
  return apiFetch("/admin/settings/founding", { method: "PUT", body: { closesAt, proEndsAt } });
}

// The Businesses page. `params` is { page, pageSize, name, id, domain, email,
// location, category, verificationLevel, claimed }; blank values are dropped.
function fetchAdminBusinesses(params = {}) {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== "" && v != null) query.set(k, v);
  }
  return apiFetch(`/admin/businesses?${query}`);
}

function createAdminBusiness(body) {
  return apiFetch("/admin/businesses", { method: "POST", body }).then((d) => d.business);
}

function updateAdminBusiness(id, body) {
  return apiFetch(`/admin/businesses/${id}`, { method: "PATCH", body }).then((d) => d.business);
}

function deleteAdminBusiness(id) {
  return apiFetch(`/admin/businesses/${id}`, { method: "DELETE" });
}

// params: { page, pageSize, email, name, verified, claimStatus }; blank
// values are dropped.
function fetchAdminAccounts(params = {}) {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== "" && v != null) query.set(k, v);
  }
  return apiFetch(`/admin/accounts?${query}`);
}

// body: any of { name, phone, role, email, emailVerified }.
function updateAdminAccount(id, body) {
  return apiFetch(`/admin/accounts/${id}`, { method: "PATCH", body }).then((d) => d.account);
}

// releaseBusiness must be true to delete an approved claimant: their
// business goes back to unclaimed.
function deleteAdminAccount(id, { releaseBusiness = false } = {}) {
  return apiFetch(`/admin/accounts/${id}`, {
    method: "DELETE",
    body: releaseBusiness ? { releaseBusiness: true } : undefined,
  });
}

export {
  fetchAdminAccounts,
  updateAdminAccount,
  deleteAdminAccount,
  fetchAdminBusinesses,
  createAdminBusiness,
  updateAdminBusiness,
  deleteAdminBusiness,
  fetchFoundingSettings,
  saveFoundingSettings,
  fetchSsmReviews,
  rejectSsm,
  fetchAdminClaims,
  approveAdminClaim,
  rejectAdminClaim,
  revokeAdminClaim,
  verifySsm,
  revokeSsm,
  setBusinessMembershipTier,
  fetchEndorsementReviews,
  decideEndorsementReview,
  resolveEndorsementFlag,
};
