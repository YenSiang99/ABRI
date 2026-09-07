import { apiFetch } from "./client";

// Mirrors backend/src/routes/feed.js, which is one route: GET /feed.
//
// Deliberately thin, and the absences are the feature — there is no post, no
// react, no comment and no report. Every row in this feed is somebody's
// third-party statement about somebody else, already moderated where it was
// written, so there is nothing here to act on. Read the header of
// backend/src/lib/networkEvents.js before adding a second function.
//
// Returns the WHOLE envelope rather than unwrapping to one key, unlike every
// other file in this directory. Two values matter to the caller — the page
// and the cursor for the next one — and unwrapping to `events` would throw
// away the only thing that says whether there is more.
function fetchFeed({ scope = "network", cursor = null } = {}) {
  const params = new URLSearchParams({ scope });
  if (cursor) params.set("cursor", cursor);
  return apiFetch(`/feed?${params.toString()}`);
}

export { fetchFeed };
