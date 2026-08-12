import { apiFetch } from "./client";

// Mirrors backend/src/routes/businesses.js's GET /me/activity.

function fetchMyActivity() {
  return apiFetch("/businesses/me/activity").then((data) => data.activity);
}

export { fetchMyActivity };
