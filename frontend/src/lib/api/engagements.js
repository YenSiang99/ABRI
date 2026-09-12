import { apiFetch } from "./client";

// "We worked together" records, confirmed by both sides.
//
// THE ONE RULE A CALLER MUST NOT GET WRONG: the business that proposed an
// engagement can never confirm it. The server enforces that on every route
// here, and `proposedByYou` on each row is what the UI branches on — show
// Confirm/Decline when it is false, Withdraw when it is true. Rendering
// Confirm to a proposer produces a button that always 403s.

// Propose one. `service` must be a catalogue value (see api/serviceCatalogue),
// `occurredOn` any date in the month the work happened — the server floors it
// to the first of that month.
function proposeEngagement({ businessId, service, note, occurredOn, askId }) {
  return apiFetch("/engagements", {
    method: "POST",
    body: { businessId, service, note, occurredOn, askId },
  }).then((d) => d.engagement);
}

function confirmEngagement(id) {
  return apiFetch(`/engagements/${id}/confirm`, { method: "POST" }).then((d) => d.engagement);
}

// Terminal and PRIVATE — the row becomes visible to nobody but the two
// parties, and only the proposer is notified. Never surface a decline as
// news about the business that made it.
function declineEngagement(id) {
  return apiFetch(`/engagements/${id}/decline`, { method: "POST" }).then((d) => d.engagement);
}

// Proposer only, and only while pending. Deletes rather than archives.
function withdrawEngagement(id) {
  return apiFetch(`/engagements/${id}`, { method: "DELETE" });
}

// The caller's own, both directions. Without `status` every status they are
// party to comes back — including their own declined and lapsed rows, which
// are theirs to see even though nobody else's are.
function fetchEngagements(status) {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch(`/engagements${query}`).then((d) => d.engagements);
}

export {
  proposeEngagement,
  confirmEngagement,
  declineEngagement,
  withdrawEngagement,
  fetchEngagements,
};
