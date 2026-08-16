// Where a line in the dashboard's activity feed takes you when clicked.
//
// Keyed off the same `type` strings the server sends (see
// ACTIVITY_MESSAGES in backend/src/lib/activityEvents.js). Returning null
// for anything unrecognised is deliberate: a new event type added on the
// server renders as plain text here rather than as a link to nowhere.

// Events that land on the giver's own record rather than their queue —
// they name something that has already settled, and the Requests tab (which
// only lists in-flight vouches) won't contain it.
const GIVEN_TAB_TYPES = new Set(["vouch_published", "vouch_cancelled", "vouch_expired"]);

function activityLink(event) {
  if (event.type === "connection_added") {
    // The profile of whoever connected, since the message names them. Falls
    // back to the network list if the actor has since been removed — the
    // event survives its actor, because actorBusinessId is nullable.
    return event.actorId ? `/app/business/${event.actorId}` : "/app/network";
  }

  if (GIVEN_TAB_TYPES.has(event.type)) return "/app/vouches?tab=given";

  // Everything else in the vouch lifecycle is an in-flight negotiation, which
  // is exactly what the Requests tab holds — including the flagged ones, which
  // sit in its "Under review" section.
  if (event.type.startsWith("vouch_")) return "/app/vouches";

  return null;
}

export { activityLink };
