import { apiFetch } from "./client";

// "We worked together" records, confirmed by both sides.
//
// THE ONE RULE A CALLER MUST NOT GET WRONG: the business that proposed an
// portfolio entry can never confirm it. The server enforces that on every route
// here, and `proposedByYou` on each row is what the UI branches on — show
// Confirm/Decline when it is false, Withdraw when it is true. Rendering
// Confirm to a proposer produces a button that always 403s.

// Propose one. `service` must be a catalogue value (see api/serviceCatalogue),
// `occurredOn` any date in the month the work happened — the server floors it
// to the first of that month.
function proposePortfolioEntry({ businessId, service, note, occurredOn }) {
  return apiFetch("/portfolio", {
    method: "POST",
    body: { businessId, service, note, occurredOn },
  }).then((d) => d.entry);
}

function confirmPortfolioEntry(id) {
  return apiFetch(`/portfolio/${id}/confirm`, { method: "POST" }).then((d) => d.entry);
}

// Terminal and PRIVATE — the row becomes visible to nobody but the two
// parties, and only the proposer is notified. Never surface a decline as
// news about the business that made it.
function declinePortfolioEntry(id) {
  return apiFetch(`/portfolio/${id}/decline`, { method: "POST" }).then((d) => d.entry);
}

// Proposer only, and only while pending. Deletes rather than archives.
function withdrawPortfolioEntry(id) {
  return apiFetch(`/portfolio/${id}`, { method: "DELETE" });
}

// The caller's own, both directions. Without `status` every status they are
// party to comes back — including their own declined and lapsed rows, which
// are theirs to see even though nobody else's are.
function fetchPortfolio(status) {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch(`/portfolio${query}`).then((d) => d.entries);
}

export {
  proposePortfolioEntry,
  confirmPortfolioEntry,
  declinePortfolioEntry,
  withdrawPortfolioEntry,
  fetchPortfolio,
};
