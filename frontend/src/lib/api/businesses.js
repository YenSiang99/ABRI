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
function fetchBusinessPage({ search, verificationLevel, page, limit } = {}) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  // Key must match GET /businesses exactly: an unrecognised param there is
  // NO FILTER, not a 400, so a mismatch fails silently and wide.
  if (verificationLevel) params.set("verificationLevel", verificationLevel);
  if (page) params.set("page", String(page));
  if (limit) params.set("limit", String(limit));
  const qs = params.toString();
  return apiFetch(`/businesses${qs ? `?${qs}` : ""}`);
}

// Check a business — GET /businesses/lookup.
//
// Returns the WHOLE envelope, unlike fetchBusinesses above, because the
// echoed `query` is part of the answer: the miss state has to say WHICH name
// ABRI has no record of, and reading that off local input state would show
// the half-typed value the member has moved on from rather than the one the
// server actually searched.
//
// A miss is `{ matches: [] }` and a 200 — never a 404, never a throw. The
// caller must render that as "no record on ABRI" and NOT as an error, and not
// as anything stronger: ABRI has no registry access, so an empty list says
// nothing whatsoever about whether the business is real.
function lookupBusinesses(query) {
  return apiFetch(`/businesses/lookup?q=${encodeURIComponent(query)}`);
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

function fetchBusiness(id) {
  return apiFetch(`/businesses/${id}`).then((data) => data.business);
}

function submitBusinessClaim(payload) {
  return apiFetch("/businesses/claim", { method: "POST", body: payload });
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
  lookupBusinesses,
  submitSsm,
  fetchBusiness,
  submitBusinessClaim,
  updateMyBusiness,
};
