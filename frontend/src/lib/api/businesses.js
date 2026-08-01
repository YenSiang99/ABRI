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

export { fetchBusinesses, fetchBusiness, submitBusinessClaim };
