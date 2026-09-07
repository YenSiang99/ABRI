import { apiFetch } from "./client";

// Mirrors backend/src/routes/asks.js.
//
// Two absences are deliberate and worth stating, because both look like
// missing features:
//
//   There is no rejectAnswer. Accepting one answer leaves the others alone
//   and nobody is told they weren't picked — the same reason the connections
//   API has no "decline" that records anything. Answering has to stay free of
//   the risk of a public no, or nobody answers twice.
//
//   There is no editAsk or editAnswer. Posted text is not revisable: an ask
//   you'd want to rewrite is a new ask, and the answer cap is what makes
//   posting a second one cheap rather than abusive. (A vouch is revisable
//   because it's negotiated with its receiver; nothing here is.)

// The board. `matchStrength` is "exact" | "category" | undefined; `category` is one
// of the seven §7 ask categories.
function fetchAsks({ matchStrength, category } = {}) {
  const params = new URLSearchParams();
  if (matchStrength) params.set("matchStrength", matchStrength);
  if (category) params.set("category", category);
  const qs = params.toString();
  return apiFetch(`/asks${qs ? `?${qs}` : ""}`).then((data) => data.asks);
}

// Asks this business posted, every status. Keyed off the session.
function fetchMyAsks() {
  return apiFetch("/asks/mine").then((data) => data.asks);
}

// Asks this business answered, each carrying yourAnswerStatus.
function fetchAnsweredAsks() {
  return apiFetch("/asks/answered").then((data) => data.asks);
}

// Pro only — answers 402 with requiredMembershipTier below that. Callers should
// check membershipTierAllows(membershipTier, "askAlerts") first so a Free member never fires a
// request the server will refuse; this is the UX half, the server is the
// enforcement (see components/app/UpgradePrompt.jsx).
function fetchAskAlerts() {
  return apiFetch("/asks/alerts");
}

function fetchAsk(id) {
  return apiFetch(`/asks/${id}`).then((data) => data.ask);
}

// Needs T2 (SSM-verified). The server answers 403, not 402 — this is a
// verification gate, not a membership-tier gate, so there is no upgrade prompt to open.
function postAsk({ category, matchCategory, matchLocation, title, detail }) {
  return apiFetch("/asks", {
    method: "POST",
    body: { category, matchCategory, matchLocation, title, detail },
  }).then((data) => data.ask);
}

function closeAsk(id) {
  return apiFetch(`/asks/${id}/close`, { method: "POST" }).then((data) => data.ask);
}

// recommendedBusinessId may be an unclaimed (T0) listing — the recommendation
// waits, invisible, until that business claims. It may also be the answering
// business itself, which is a self-nomination: allowed, and labelled
// differently everywhere it appears.
function answerAsk(askId, { recommendedBusinessId, comment }) {
  return apiFetch(`/asks/${askId}/answers`, {
    method: "POST",
    body: { recommendedBusinessId, comment },
  }).then((data) => data.answer);
}

// Takes no answer id: the server finds your answer from the session, so
// there's no way to withdraw somebody else's.
function withdrawAnswer(askId) {
  return apiFetch(`/asks/${askId}/answer/withdraw`, { method: "POST" });
}

function acceptAnswer(askId, answerId) {
  return apiFetch(`/asks/${askId}/answers/${answerId}/accept`, { method: "POST" }).then(
    (data) => data.ask,
  );
}

// Reporting freezes live content and puts it in the admin queue. Reasons come
// from a closed list (ASK_FLAG_REASONS / ANSWER_FLAG_REASONS in
// backend/src/lib/asks.js) — a free-text reason would land unchecked in a
// queue a human has to read.
//
// Reporting a SETTLED ask is accepted but freezes nothing: it is recorded
// against the reporter and the reported for the repeat-offender signal, and
// there is nothing left to stop.
function flagAsk(id, { reason, note } = {}) {
  return apiFetch(`/asks/${id}/flag`, { method: "POST", body: { reason, note } }).then((d) => d.flag);
}

function flagAnswer(askId, answerId, { reason, note } = {}) {
  return apiFetch(`/asks/${askId}/answers/${answerId}/flag`, {
    method: "POST",
    body: { reason, note },
  }).then((d) => d.flag);
}

export {
  fetchAsks,
  fetchMyAsks,
  fetchAnsweredAsks,
  fetchAskAlerts,
  fetchAsk,
  postAsk,
  closeAsk,
  answerAsk,
  withdrawAnswer,
  acceptAnswer,
  flagAsk,
  flagAnswer,
};
