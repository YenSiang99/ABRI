// Message text per ActivityEvent.type, generated server-side so new event
// types just add a map entry rather than needing frontend changes. Keyed
// by type; each fn takes the actor business's name.
const ACTIVITY_MESSAGES = {
  vouch_submitted: (actorName) => `${actorName} sent you a vouch to review.`,
  vouch_published: (actorName) => `${actorName} accepted your vouch.`,
  vouch_cancelled: (actorName) => `${actorName} cancelled your vouch.`,
  // Distinct from vouch_cancelled because the two are different facts about
  // a relationship: one is a decision the counterparty made, the other is
  // nobody getting round to it. Both land the vouch on "cancelled", so
  // without a separate type the giver is told they were declined by a
  // business that never actually did anything.
  //
  // Worded so it names no culprit — the counterparty appears as the subject
  // of the vouch, not as someone who acted. "14 days" mirrors EXPIRY_DAYS in
  // lib/vouchExpiry.js; it can't be imported (that module imports this one),
  // so change both together.
  vouch_expired: (actorName) =>
    `Your vouch for ${actorName} expired after 14 days without a response.`,
  vouch_reverted: (actorName) => `${actorName} sent your vouch back for edits.`,
  // The one event that names no next step for the recipient — a flagged
  // vouch is an admin's to move, so telling the giver to do anything would
  // be wrong. See the flag route in routes/vouches.js.
  vouch_flagged: (actorName) => `${actorName} flagged your vouch for admin review.`,
  vouch_revised: (actorName) => `${actorName} updated their vouch for you — ready for review.`,

  // Goes only to the side that didn't press the button — see
  // createConnection in lib/connections.js. There's no removal counterpart
  // on purpose.
  connection_added: (actorName) => `${actorName} connected with you.`,

  // Admin decisions on a flagged vouch. These take no actorName — an admin
  // isn't a business, so the event carries actorBusinessId null and there is
  // no name to interpolate. Both parties get one each time, worded from
  // their own side, because a vouch coming out of review changes what each
  // of them can do next.
  vouch_review_returned_receiver: () =>
    "An admin reviewed the flagged vouch — it's back with you to accept, send back or cancel.",
  vouch_review_returned_giver: () =>
    "An admin reviewed the flagged vouch — it's back with the business you vouched for.",
  vouch_review_sent_back_giver: () =>
    "An admin reviewed the flagged vouch and sent it back for you to edit.",
  vouch_review_sent_back_receiver: () =>
    "An admin reviewed the flagged vouch and sent it back to be edited.",
  vouch_review_cancelled: () => "An admin cancelled the flagged vouch after reviewing it.",
};

function messageFor(type, actorName) {
  const build = ACTIVITY_MESSAGES[type];
  return build ? build(actorName ?? "Someone") : "Something happened.";
}

// Returns an unawaited Prisma promise — pass `prisma` directly, or a `tx`
// client inside an interactive transaction, so callers can bundle this
// into the same prisma.$transaction([...]) as the Vouch update it
// accompanies and the two can never drift apart.
function createActivityEvent(client, { businessId, actorBusinessId, type }) {
  return client.activityEvent.create({ data: { businessId, actorBusinessId, type } });
}

// How many events we retain per business. Deliberately larger than the 20
// the feed renders, so pruning can never eat a row that's still on screen.
//
// A per-business cap rather than a time-based TTL: this table is the notify
// step of the give-first loop, and a vouch stays actionable for 14 days
// (EXPIRY_DAYS in lib/vouchExpiry.js), so any TTL shorter than that would
// delete the notification while the thing it's about is still waiting on
// the reader. A cap has no such window — a dormant business keeps its last
// 50 events however old they are — while still bounding the worst case that
// actually matters for storage: one busy business flooding the table.
const ACTIVITY_KEEP_PER_BUSINESS = 50;

// The one raw query in this codebase. "Delete everything except the newest
// N for this business" has no deleteMany form — the Prisma equivalent is a
// findMany to locate the cutoff row followed by a compound-OR deleteMany to
// handle createdAt ties, i.e. two round trips on a read path that runs on
// every dashboard load. ORDER BY ... OFFSET over ids says it once, ties
// included, and rides the @@index([businessId, createdAt]) already declared
// for the feed. Interpolations are Prisma template parameters, not string
// concatenation.
function pruneActivityEvents(client, businessId) {
  return client.$executeRaw`
    DELETE FROM "ActivityEvent"
    WHERE id IN (
      SELECT id FROM "ActivityEvent"
      WHERE "businessId" = ${businessId}
      ORDER BY "createdAt" DESC, id DESC
      OFFSET ${ACTIVITY_KEEP_PER_BUSINESS}
    )
  `;
}

export { messageFor, createActivityEvent, pruneActivityEvents, ACTIVITY_KEEP_PER_BUSINESS };
