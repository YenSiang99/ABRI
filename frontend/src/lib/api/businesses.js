import { apiFetch } from "./client";

// Mirrors backend/src/routes/businesses.js.

function fetchBusinesses({ search, tier } = {}) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (tier) params.set("tier", tier);
  const qs = params.toString();
  return apiFetch(`/businesses${qs ? `?${qs}` : ""}`).then((data) => data.businesses);
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

export { fetchBusinesses, fetchBusiness, submitBusinessClaim, updateMyBusiness };
