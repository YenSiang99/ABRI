import { apiFetch } from "./client";

// Mirrors backend/src/routes/businesses.js.

// The directory. Resolves to the ARRAY, not the envelope — most callers want
// the first page and nothing else (Register's SearchStep, the dashboard's
// suggestions), and making all of them unwrap a `{ businesses, page, hasMore }`
// to get at the list would be ceremony for two screens' benefit.
//
// The two that page use fetchBusinessPage below. Same request, both shapes,
// one place — rather than a flag that changes the return type, which is the
// version where a caller reads `.length` off an object and gets undefined.
function fetchBusinesses(options = {}) {
  return fetchBusinessPage(options).then((data) => data.businesses);
}

// The paged form: `{ businesses, page, hasMore }`.
//
// `vouchCount` and `vouchLevel` are ABSENT for a logged-out caller — the keys
// are missing, not zeroed. BusinessCard reads that absence as "log in to see
// vouches", which is a different sentence from "no vouches yet"; zeroing them
// here would silently turn every business into the latter.
function fetchBusinessPage({
  search,
  category,
  location,
  verificationLevel,
  service,
  confirmedOnly,
  page,
  limit,
} = {}) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  // Closed lists, validated server-side: an unknown value is a 400, not an
  // empty page.
  if (category) params.set("category", category);
  if (location) params.set("location", location);
  // Key must match GET /businesses exactly: an unrecognised param there is
  // NO FILTER, not a 400, so a mismatch fails silently and wide.
  if (verificationLevel) params.set("verificationLevel", verificationLevel);
  // `service` is the exception to that warning, and deliberately: the server
  // 400s an unknown value rather than ignoring it, because "no results" and
  // "your filter was nonsense" must not render identically.
  if (service) params.set("service", service);
  // Only meaningful alongside `service`. When it is set the list is also
  // RANKED by how many different businesses have confirmed that service —
  // see GET /businesses — so a caller that sets it is asking a different
  // question, not just applying a narrower filter.
  if (confirmedOnly) params.set("confirmedOnly", "true");
  if (page) params.set("page", String(page));
  if (limit) params.set("limit", String(limit));
  const qs = params.toString();
  return apiFetch(`/businesses${qs ? `?${qs}` : ""}`);
}

// Submit this business's SSM registration number for review.
//
// Resolves to the same shape as getMe(), so follow it with refreshAccount()
// — the same contract updateMyBusiness has, and for the same reason.
//
// Deliberately separate from updateMyBusiness: `ssm` is in PROTECTED_FIELDS,
// so PATCH /businesses/me rejects it by name. A registration number is a
// claim an admin ruled on, not a field the owner rewrites at will.
function submitSsm(ssm) {
  return apiFetch("/businesses/me/ssm", { method: "POST", body: { ssm } });
}

// The directory's filter options — only categories and areas that have
// businesses, each with its count, each counted within the other filter.
// `{ categories: [{ value, count }], locations: [{ value, count }] }`.
function fetchDirectoryFacets({ category, location } = {}) {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (location) params.set("location", location);
  const qs = params.toString();
  return apiFetch(`/businesses/facets${qs ? `?${qs}` : ""}`);
}

function fetchBusiness(id) {
  return apiFetch(`/businesses/${id}`).then((data) => data.business);
}

function submitBusinessClaim(payload) {
  return apiFetch("/businesses/claim", { method: "POST", body: payload });
}

// The instant claim (ABRI-launch-access-plan.md step 2): a 6-digit code sent
// to the email the listing already has on file. send → { sentTo, code? }
// (code only in local dev); verify → the getMe() shape, now owning the business.
function sendClaimCode() {
  return apiFetch("/businesses/me/claim/email-code", { method: "POST" });
}

function verifyClaimCode(code) {
  return apiFetch("/businesses/me/claim/email-code/verify", { method: "POST", body: { code } });
}

// The same two calls from the signup's "check your email" screen, before
// there is a session: claimHandle comes back from submitBusinessClaim.
function sendSignupClaimCode(claimHandle) {
  return apiFetch("/businesses/claim/email-code", { method: "POST", body: { claimHandle } });
}

function verifySignupClaimCode(claimHandle, code) {
  return apiFetch("/businesses/claim/email-code/verify", { method: "POST", body: { claimHandle, code } });
}

// A claim from someone already logged in with no approved business — a
// rejected claimant trying again, or moving a pending claim. Resolves to the
// same shape as getMe().
function submitClaimAsMember({ businessId, businessName, category, location, ssm }) {
  return apiFetch("/businesses/me/claim", {
    method: "POST",
    body: { businessId, businessName, category, location, ssm },
  });
}

// The owner saving their own business. Send only the fields being changed —
// the server treats an absent key as "leave it alone" and an empty string as
// "clear it", so passing the whole business object back would be a different
// request than intended.
//
// Resolves to the same shape as getMe(), so callers should follow this with
// refreshAccount() from AuthContext rather than trying to merge the response
// into local state by hand.
//
// Rejects with an Error carrying .status and a .message written for the
// member (see client.js) — 400 for a validation failure, 403 for an account
// with no approved claim. Show the message; don't swallow it.
function updateMyBusiness(payload) {
  return apiFetch("/businesses/me", { method: "PATCH", body: payload });
}

export {
  fetchBusinesses,
  fetchBusinessPage,
  fetchDirectoryFacets,
  submitSsm,
  fetchBusiness,
  submitBusinessClaim,
  submitClaimAsMember,
  sendClaimCode,
  verifyClaimCode,
  sendSignupClaimCode,
  verifySignupClaimCode,
  updateMyBusiness,
};
