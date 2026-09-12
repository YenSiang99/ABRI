import { apiFetch } from "./client";

// The canonical service list, fetched rather than mirrored.
//
// lib/businessVocab.js keeps a hand-maintained copy of the category and
// location lists, and that is right for two flat arrays of four and six. This
// one is ten times the size and grows on its own schedule — a stale copy would
// not fail loudly, it would quietly offer fewer canonical services than the
// server accepts, which is the exact silent miss the catalogue exists to
// remove. See backend/src/lib/serviceVocab.js.
//
// `category` is optional: without one the response carries an empty `services`
// and every category under `others`.
function fetchServiceCatalogue(category) {
  const query = category ? `?category=${encodeURIComponent(category)}` : "";
  return apiFetch(`/businesses/service-catalogue${query}`);
}

export { fetchServiceCatalogue };
