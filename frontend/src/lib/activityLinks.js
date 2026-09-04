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

// Connection events that name something already SETTLED. Both land on the
// actor's profile, because the message names them and there is nothing left
// to do about it. `connection_requested` is deliberately not in here — a
// request is work, and work goes to the page that can clear it.
const SETTLED_CONNECTION_TYPES = new Set(["connection_added", "connection_accepted"]);

function activityLink(event) {
  if (SETTLED_CONNECTION_TYPES.has(event.type)) {
    // The profile of whoever connected, since the message names them. Falls
    // back to the connections list if the actor has since been removed — the
    // event survives its actor, because actorBusinessId is nullable.
    return event.actorId ? `/app/business/${event.actorId}` : "/app/network/connections";
  }

  // "X wants to connect with you" is the one connection event with something
  // owed, so it goes to the Requests page rather than to X's profile. Sending
  // the reader to a profile would make them find their way to the accept
  // button themselves, which is the trip this link exists to save.
  if (event.type === "connection_requested") return "/app/network/requests";

  if (GIVEN_TAB_TYPES.has(event.type)) return "/app/vouches?tab=given";

  // Everything else in the vouch lifecycle is an in-flight negotiation, which
  // is exactly what the Requests tab holds — including the flagged ones, which
  // sit in its "Under review" section.
  if (event.type.startsWith("vouch_")) return "/app/vouches";

  return null;
}

export { activityLink };
