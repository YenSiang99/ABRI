import { apiFetch } from "./client";

// Mirrors backend/src/routes/vouches.js.

function submitVouch({ toBusinessId, testimonial }) {
  return apiFetch("/vouches", { method: "POST", body: { toBusinessId, testimonial } }).then((data) => data.vouch);
}

function fetchVouchesGiven() {
  return apiFetch("/vouches/given").then((data) => data.vouches);
}

// Settled vouches the caller RECEIVED, with full timelines. The account
// payload also carries received vouches, but only as flat published text
// for the public profile — this is what lets the receiving side look back
// at how a finished vouch got there, same as /given does for the giver.
function fetchVouchesReceived() {
  return apiFetch("/vouches/received").then((data) => data.vouches);
}

// Every in-flight vouch in both directions, each carrying `role`,
// `waitingOn` and `timeline` (see backend/src/lib/vouchTurn.js). Replaced
// fetchPendingReview, which was receiver-only — the giver's side of the
// same negotiation had no queue at all.
function fetchVouchRequests() {
  return apiFetch("/vouches/requests").then((data) => data.vouches);
}

function acceptVouch(id) {
  return apiFetch(`/vouches/${id}/accept`, { method: "POST" }).then((data) => data.vouch);
}

// Sends the vouch back to the giver to edit. `note` is required — it's the
// whole point of the action, and the server rejects an empty one.
function revertVouch(id, note) {
  return apiFetch(`/vouches/${id}/revert`, { method: "POST", body: { note } }).then((data) => data.vouch);
}

// Terminal. `reason` is optional and is shown to the giver on the
// timeline. It no longer takes a flag payload — flagging is its own call
// below, so ending a vouch and reporting one can't be conflated.
function cancelVouch(id, reason) {
  return apiFetch(`/vouches/${id}/cancel`, { method: "POST", body: { reason } }).then((data) => data.vouch);
}

// Suspends the vouch and hands it to an admin. `reason` is one of
// "abusive_content" | "other"; `note` is admin-only and never shown to the
// giver.
function flagVouch(id, { reason, note } = {}) {
  return apiFetch(`/vouches/${id}/flag`, { method: "POST", body: { reason, note } }).then((data) => data.vouch);
}

function reviseVouch(id, testimonial) {
  return apiFetch(`/vouches/${id}/revise`, { method: "POST", body: { testimonial } }).then((data) => data.vouch);
}

// The giver's side, and unlike flagVouch above this one changes nothing
// about the vouch — it's already cancelled and stays that way.
function flagUnfairCancel(id, note) {
  return apiFetch(`/vouches/${id}/flag-unfair-cancel`, { method: "POST", body: { note } }).then((data) => data.flag);
}

export {
  submitVouch,
  fetchVouchesGiven,
  fetchVouchesReceived,
  fetchVouchRequests,
  acceptVouch,
  revertVouch,
  cancelVouch,
  flagVouch,
  reviseVouch,
  flagUnfairCancel,
};
