import { apiFetch } from "./client";

// Mirrors backend/src/routes/businesses.js's GET /me/activity,
// GET /me/activity/unread-count and POST /me/activity/read.

function fetchMyActivity() {
  return apiFetch("/businesses/me/activity").then((data) => data.activity);
}

function fetchUnreadActivityCount() {
  return apiFetch("/businesses/me/activity/unread-count").then((data) => data.unread);
}

function markActivityRead() {
  return apiFetch("/businesses/me/activity/read", { method: "POST" }).then((data) => data.marked);
}

// Marks a single event read — what opening a notification does. Answers
// `{ marked: 0 }` for an id that isn't in the caller's own feed.
function markOneActivityRead(id) {
  return apiFetch(`/businesses/me/activity/${id}/read`, { method: "POST" }).then(
    (data) => data.marked,
  );
}

export { fetchMyActivity, fetchUnreadActivityCount, markActivityRead, markOneActivityRead };
