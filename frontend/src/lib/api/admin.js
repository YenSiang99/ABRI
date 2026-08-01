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

export { fetchAdminClaims, approveAdminClaim, rejectAdminClaim, revokeAdminClaim, verifySsm, revokeSsm };
