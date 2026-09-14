// Message text per ActivityEvent.type, generated server-side so new event
// types just add a map entry rather than needing frontend changes. Keyed
// by type; each fn takes the actor business's name.
const ACTIVITY_MESSAGES = {
  // Engagements. "says you worked together" rather than "logged an
  // engagement": the reader has to be able to tell at a glance that a CLAIM
  // has been made about them which they are being asked to agree with, not
  // that a record already exists.
  engagement_proposed: (actorName) => `${actorName} says you worked together.`,
  engagement_confirmed: (actorName) => `${actorName} confirmed you worked together.`,
  // Proposer only, and it names the decision because there was one — somebody
  // actively said this did not happen, which the proposer is entitled to know.
  engagement_declined: (actorName) => `${actorName} says you didn't work together.`,
  // Proposer only, and worded so it names no culprit. Nobody declined this; it
  // sat for 14 days and lapsed. Same distinction vouch_expired exists for:
  // without a separate type the proposer is told they were refused by a
  // business that never did anything. "14 days" mirrors EXPIRY_DAYS in
  // lib/engagements.js and cannot be imported (that module imports this one).
  engagement_expired: (actorName) =>
    `Your engagement with ${actorName} lapsed after 14 days without a reply.`,
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

  // The three connection events, and the distinction that matters most:
  // connection_added is a fact, connection_requested is a to-do. Only a card
  // tap produces the first now (AUTO_ACCEPT_SOURCES in lib/connections.js) —
  // a directory connect asks, and wording an ask like a done deal is how it
  // sits unanswered because the reader was told it had already happened.
  //
  // All three go only to the side that didn't press the button. There is no
  // removal, decline or unfollow counterpart on purpose: "X removed you",
  // "X declined you" and "X stopped following you" are hostile notifications
  // the reader can do nothing about.
  connection_added: (actorName) => `${actorName} connected with you.`,
  connection_requested: (actorName) => `${actorName} wants to connect with you.`,
  connection_accepted: (actorName) => `${actorName} accepted your connection request.`,

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

  // ─── SSM verification ────────────────────────────────────────────────────
  // Both carry no actor: an admin ruled on these, and staff never appear as
  // an actor in a member-facing feed. Same call ask_expired makes.
  //
  // The rejection names the NEXT ACTION rather than the fault, because it
  // cannot name the fault: this table has no detail column, so every message
  // here is generated from the type alone and the admin's reasoning has
  // nowhere to travel. See the comment on POST /admin/businesses/:id/
  // reject-ssm. "Check it against your documents and submit again" is true
  // whatever the reason was, which is what makes it safe to say blind.
  ssm_verified: () =>
    "Your SSM registration number was verified — you're now SSM-Verified.",
  ssm_rejected: () =>
    "Your SSM registration number wasn't accepted. Check it against your SSM documents and submit it again.",

  // ─── Watched businesses ──────────────────────────────────────────────────
  //
  // Pro. The point of a watch is that the member does NOT have to come back
  // and look, so these fire the moment the level moves rather than lazily on
  // read — see notifyWatchers in lib/businessWatch.js.
  //
  // Four messages rather than one, because the direction of travel changes
  // what the reader should do. "They're verified now" invites you to proceed;
  // "they're no longer verified" is the one that should stop you, and a single
  // "their verification changed" would bury it. actorBusinessId is null on all
  // four: an admin moved these, and staff never appear as an actor.
  //
  // The actor name is unused, so the business is named in the LINK rather than
  // the sentence — this table has no subject id (see lib/activityLinks.js), so
  // naming it here would mean a copy that can go stale.
  watched_business_claimed: () =>
    "A business you're watching has been claimed by its owner.",
  watched_business_verified: () =>
    "A business you're watching is now verified.",
  watched_business_downgraded: () =>
    "A business you're watching has lost a verification level. Worth a look before you deal with them.",
  watched_business_unclaimed: () =>
    "A business you're watching is unclaimed again — its owner's claim was revoked.",

  // ─── Asks ────────────────────────────────────────────────────────────────
  // Two answer events rather than one with a branch, and the reason is that
  // this map takes only an actor name: "named someone else" and "offered
  // their own services" are different claims to an asker weighing them, and a
  // distinction that is visible on the ask page but flattened in the
  // notification is one the asker meets twice and reads two different ways.
  //
  // Both are now only ever read BY THE ASKER. Nothing here reaches the
  // business that was named — accepting an answer stopped publishing anything
  // to a third party's profile in Sept 2026, so there is no longer a profile
  // change anyone needs to be told about.
  ask_answered: (actorName) => `${actorName} suggested a business for your ask.`,
  ask_self_offered: (actorName) => `${actorName} offered their own services on your ask.`,

  ask_answer_accepted: (actorName) => `${actorName} accepted your answer on their ask.`,

  // No actor: nobody closed this, it lapsed. Names a next step, which is what
  // makes an event about something nobody did worth sending at all. "30 days"
  // mirrors ASK_EXPIRY_DAYS in lib/askExpiry.js; it can't be imported (that
  // module imports this one), so change both together.
  ask_expired: () =>
    "Your ask closed after 30 days. Post a new one if you still need it.",

  // Frozen-content events. Both carry actorBusinessId null, a deliberate
  // divergence from vouch_flagged, which does name the flagger: on a vouch
  // the flagger is the counterparty, already party to it and already known;
  // on a board the reporter can be any member, and naming them is an
  // invitation to take it up with them directly. Like vouch_flagged these
  // name no next step, because there isn't one — but the reader still needs
  // to know why their post stopped working.
  ask_flagged: () => "Your ask was reported and is on hold while an admin reviews it.",
  ask_answer_flagged: () =>
    "Your answer was reported and is on hold while an admin reviews it.",

  // Admin decisions on a reported ask or answer. No actor, for the same
  // reason the vouch_review_* events have none.
  ask_review_restored: () =>
    "An admin reviewed the report on your ask — it's open again.",
  ask_review_closed: () => "An admin closed your ask after reviewing a report.",
  ask_answer_review_restored: () =>
    "An admin reviewed the report on your answer — it's back in front of the asker.",
  ask_answer_review_removed: () =>
    "An admin removed your answer after reviewing a report.",
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
