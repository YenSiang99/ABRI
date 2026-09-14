// Where a line in the dashboard's activity feed takes you when clicked.
//
// Keyed off the same `type` strings the server sends (see
// ACTIVITY_MESSAGES in backend/src/lib/activityEvents.js). Returning null
// for anything unrecognised is deliberate: a new event type added on the
// server renders as plain text here rather than as a link to nowhere.

// Events that land on the giver's own record rather than their queue —
// they name something that has already settled, and the Requests tab (which
// only lists in-flight vouches) won't contain it.
const GIVEN_TAB_TYPES = new Set([
  "vouch_published",
  "vouch_cancelled",
  "vouch_expired",
]);

// Engagements. All four land on the Inbox tab rather than a specific row, for
// the structural reason this file already states about vouches and asks:
// ActivityEvent carries a type and an actor and no subject id, so there is
// nothing to deep-link to.
//
// `engagement_proposed` goes to the tab that can CLEAR it. The other three name
// something already settled — confirmed, declined or lapsed — and there is no
// work left, but the same tab is still where the record is, so they share it.
const ENGAGEMENT_TYPES = new Set([
  "engagement_proposed",
  "engagement_confirmed",
  "engagement_declined",
  "engagement_expired",
]);

// Connection events that name something already SETTLED. Both land on the
// actor's profile, because the message names them and there is nothing left
// to do about it. `connection_requested` is deliberately not in here — a
// request is work, and work goes to the page that can clear it.
const SETTLED_CONNECTION_TYPES = new Set([
  "connection_added",
  "connection_accepted",
]);

// Ask events, split by who owns the work: asker-side events go to the list of
// asks this business posted, answerer-side ones to the list it answered.
//
// None of these deep-link to the ask itself, and that is structural rather
// than an oversight: ActivityEvent carries a type and an actor and nothing
// else — there is no subject id on the row — which is the same reason the
// vouch events land on a tab. Adding a nullable subjectId would fix all seven
// event families at once and belongs in its own change, not smuggled into a
// feature.
const ASK_ASKER_TYPES = new Set([
  "ask_answered",
  "ask_self_offered",
  "ask_expired",
  "ask_flagged",
  "ask_review_restored",
  "ask_review_closed",
]);
const ASK_ANSWERER_TYPES = new Set([
  "ask_answer_accepted",
  "ask_answer_flagged",
  "ask_answer_review_restored",
  "ask_answer_review_removed",
]);

function activityLink(event) {
  if (SETTLED_CONNECTION_TYPES.has(event.type)) {
    // The profile of whoever connected, since the message names them. Falls
    // back to the connections list if the actor has since been removed — the
    // event survives its actor, because actorBusinessId is nullable.
    return event.actorId
      ? `/app/business/${event.actorId}`
      : "/app/network/connections";
  }

  // "X wants to connect with you" is the one connection event with something
  // owed, so it goes to the Requests page rather than to X's profile. Sending
  // the reader to a profile would make them find their way to the accept
  // button themselves, which is the trip this link exists to save.
  if (event.type === "connection_requested") return "/app/network/requests";

  if (ASK_ASKER_TYPES.has(event.type)) return "/app/asks?tab=mine";
  if (ASK_ANSWERER_TYPES.has(event.type)) return "/app/asks?tab=answered";

  if (ENGAGEMENT_TYPES.has(event.type)) return "/app/inbox?tab=engagements";

  if (GIVEN_TAB_TYPES.has(event.type)) return "/app/vouches?tab=given";

  // Everything else in the vouch lifecycle is an in-flight negotiation, which
  // is exactly what the Requests tab holds — including the flagged ones, which
  // sit in its "Under review" section.
  if (event.type.startsWith("vouch_")) return "/app/vouches";

  return null;
}

export { activityLink };
