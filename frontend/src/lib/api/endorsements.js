import { apiFetch } from "./client";

// Mirrors backend/src/routes/endorsements.js.

function submitEndorsement({ toBusinessId, testimonial }) {
  return apiFetch("/endorsements", { method: "POST", body: { toBusinessId, testimonial } }).then((data) => data.endorsement);
}

function fetchEndorsementsGiven() {
  return apiFetch("/endorsements/given").then((data) => data.endorsements);
}

// Settled endorsements the caller RECEIVED, with full timelines. The account
// payload also carries received endorsements, but only as flat published text
// for the public profile — this is what lets the receiving side look back
// at how a finished endorsement got there, same as /given does for the giver.
function fetchEndorsementsReceived() {
  return apiFetch("/endorsements/received").then((data) => data.endorsements);
}

// Every in-flight endorsement in both directions, each carrying `role`,
// `waitingOn` and `timeline` (see backend/src/lib/endorsementTurn.js). Replaced
// fetchPendingReview, which was receiver-only — the giver's side of the
// same negotiation had no queue at all.
function fetchEndorsementRequests() {
  return apiFetch("/endorsements/requests").then((data) => data.endorsements);
}

function acceptEndorsement(id) {
  return apiFetch(`/endorsements/${id}/accept`, { method: "POST" }).then((data) => data.endorsement);
}

// Sends the endorsement back to the giver to edit. `note` is required — it's the
// whole point of the action, and the server rejects an empty one.
function revertEndorsement(id, note) {
  return apiFetch(`/endorsements/${id}/revert`, { method: "POST", body: { note } }).then((data) => data.endorsement);
}

// Terminal. `reason` is optional and is shown to the giver on the
// timeline. It no longer takes a flag payload — flagging is its own call
// below, so ending an endorsement and reporting one can't be conflated.
function cancelEndorsement(id, reason) {
  return apiFetch(`/endorsements/${id}/cancel`, { method: "POST", body: { reason } }).then((data) => data.endorsement);
}

// Suspends the endorsement and hands it to an admin. `reason` is one of
// "abusive_content" | "other"; `note` is admin-only and never shown to the
// giver.
function flagEndorsement(id, { reason, note } = {}) {
  return apiFetch(`/endorsements/${id}/flag`, { method: "POST", body: { reason, note } }).then((data) => data.endorsement);
}

function reviseEndorsement(id, testimonial) {
  return apiFetch(`/endorsements/${id}/revise`, { method: "POST", body: { testimonial } }).then((data) => data.endorsement);
}

// The giver's side, and unlike flagEndorsement above this one changes nothing
// about the endorsement — it's already cancelled and stays that way.
function flagUnfairCancel(id, note) {
  return apiFetch(`/endorsements/${id}/flag-unfair-cancel`, { method: "POST", body: { note } }).then((data) => data.flag);
}

export {
  submitEndorsement,
  fetchEndorsementsGiven,
  fetchEndorsementsReceived,
  fetchEndorsementRequests,
  acceptEndorsement,
  revertEndorsement,
  cancelEndorsement,
  flagEndorsement,
  reviseEndorsement,
  flagUnfairCancel,
};
