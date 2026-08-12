// Whose move is it? This is the one place that answers that, and both the
// `waitingOn` field the API serializes AND every route guard in
// routes/vouches.js read from here — so the buttons the UI renders and the
// transitions the server actually accepts can't drift apart. Before this
// existed there was no notion of turn at all: the frontend inferred a role
// from a `mode` prop, and the routes hardcoded their own status checks,
// which is how a receiver ended up able to accept a testimonial they'd
// just asked to have rewritten.
//
// The rule is strict turn-taking. In "reverted" the ball is entirely in
// the giver's court — the receiver has spent their turn and gets no
// actions back, not even cancel. The only way out of a stalled reverted
// vouch is the 14-day lazy expiry (see vouchExpiry.js).
//
// "under_review" is the third holder of a turn and the reason this map
// isn't just a two-party toggle: a flag suspends the negotiation and hands
// the move to an admin, so neither business can act and — because nobody's
// waiting on either of them — the expiry clock doesn't run either.
const TURN_BY_STATUS = {
  pending: "receiver",
  reverted: "giver",
  under_review: "admin",
};

// null for published/cancelled — those are terminal, nobody's turn.
function turnFor(vouch) {
  return TURN_BY_STATUS[vouch.status] ?? null;
}

function roleFor(vouch, businessId) {
  if (vouch.fromBusinessId === businessId) return "giver";
  if (vouch.toBusinessId === businessId) return "receiver";
  return null;
}

// "you" | "them" | "admin" | null, from the point of view of `businessId`.
// null means the vouch is settled, not that it's someone else's problem.
//
// "admin" is deliberately its own value rather than collapsing into
// "them": to a business, a flagged vouch is neither theirs to act on nor
// something the counterparty can move along, and telling the giver they're
// "waiting on the receiver" while an admin holds it would be a lie the UI
// would then repeat.
function waitingOnFor(vouch, businessId) {
  const turn = turnFor(vouch);
  if (!turn) return null;
  if (turn === "admin") return "admin";
  return turn === roleFor(vouch, businessId) ? "you" : "them";
}

// Guard helper for the action routes. Returns true only when `businessId`
// both holds the expected role and it's actually their move.
function hasTurn(vouch, businessId, expectedRole) {
  return roleFor(vouch, businessId) === expectedRole && turnFor(vouch) === expectedRole;
}

const BUSINESS_SELECT = { id: true, name: true, category: true, tier: true };

// One include for every vouch read — both sides of the relation, the live
// revision, and the full child history, which serializeVouch below then
// scopes to the current attempt. Deliberately not two shapes (the old
// giver/receiver include split): the same serializer serves both parties
// and the admin queue, so a single include keeps them symmetric and makes
// the "did the other side see this?" question un-askable.
//
// Lives next to the serializer that requires it — they were a file apart
// and a comment referring to each other, which is one edit away from a
// serializer quietly reading `undefined`.
const VOUCH_INCLUDE = {
  fromBusiness: { select: BUSINESS_SELECT },
  toBusiness: { select: BUSINESS_SELECT },
  currentRevision: true,
  revisions: { orderBy: { revisionNumber: "asc" } },
  actions: {
    orderBy: { createdAt: "asc" },
    include: {
      actor: { select: { id: true, name: true } },
      // Only ever set on admin_* rows, and only ever serialized for an
      // admin caller — see serializeAction's includeAdminIdentity.
      actorAccount: { select: { id: true, name: true } },
      revision: true,
    },
  },
};

// Flattens a VouchAction row into what the timeline UI needs, so the client
// never has to know the relational shape.
//
// Note there are TWO text fields and they are not interchangeable:
//   revisionComment — the giver's testimonial as it stood at this action
//   comment         — the receiver's own words on this action
// Keeping them separate is what lets the timeline show "revision 2" beside
// "and here's what they said about it" instead of collapsing both into one
// ambiguous blob.
//
// `includeAdminIdentity` is off by default and only the admin queue turns it
// on. Both businesses are told an admin acted — they have to be, it's their
// vouch that moved — but not which one. Naming the individual to the party
// they ruled against invites them to take it up with that person directly,
// and nothing in the product needs it; the accountability this exists for is
// internal, and internal readers are exactly who gets the flag on.
function serializeAction(action, viewerBusinessId, { includeAdminIdentity = false } = {}) {
  return {
    id: action.id,
    action: action.action,
    createdAt: action.createdAt,
    // null actor means no business did it — the system (an expiry) or an
    // admin (see byAdmin below).
    actor: action.actor
      ? {
          id: action.actor.id,
          name: action.actor.name,
          isYou: action.actor.id === viewerBusinessId,
        }
      : null,
    byAdmin: Boolean(action.actorAccountId),
    ...(includeAdminIdentity && action.actorAccount
      ? { admin: { id: action.actorAccount.id, name: action.actorAccount.name } }
      : {}),
    fromStatus: action.fromStatus,
    toStatus: action.toStatus,
    comment: action.comment,
    revisionId: action.revisionId,
    revisionNumber: action.revision?.revisionNumber ?? null,
    revisionComment: action.revision?.comment ?? null,
  };
}

// The single serializer every vouch-returning route goes through.
//
// Two things it guarantees. First, `role`/`waitingOn` are always present,
// so no caller has to re-derive turn from status. Second, child rows are
// scoped to `vouch.attempt` — a resubmit after a cancel starts a fresh
// attempt, and without this filter the previous attempt's change requests
// would render underneath the new testimonial. Prior attempts stay in the
// DB as history; they're just not part of the live negotiation.
//
// Expects the caller to have loaded the row with VOUCH_INCLUDE above.
// `viewerBusinessId` may be null (the admin queue): role comes back null,
// waitingOn still reports "admin" for a flagged vouch, and passing
// `includeAdminIdentity` through names the deciding admin on each timeline
// entry — the one field the two businesses don't get.
function serializeVouch(vouch, viewerBusinessId, { includeAdminIdentity = false } = {}) {
  const forThisAttempt = (row) => row.attempt === vouch.attempt;
  const actions = (vouch.actions ?? []).filter(forThisAttempt);
  const revisions = (vouch.revisions ?? []).filter(forThisAttempt);

  return {
    id: vouch.id,
    status: vouch.status,
    // Convenience mirror of currentRevision.comment. Derived on read from
    // the pointer, never stored — the column that used to hold this is
    // exactly what the restructure removed.
    testimonial: vouch.currentRevision?.comment ?? null,
    currentRevisionId: vouch.currentRevisionId,
    attempt: vouch.attempt,
    revisionCount: vouch.revisionCount,
    maxRevisions: vouch.maxRevisions,
    createdAt: vouch.createdAt,
    lastActionAt: vouch.lastActionAt,
    closedAt: vouch.closedAt,
    fromBusinessId: vouch.fromBusinessId,
    toBusinessId: vouch.toBusinessId,
    fromBusiness: vouch.fromBusiness ?? null,
    toBusiness: vouch.toBusiness ?? null,

    role: roleFor(vouch, viewerBusinessId),
    waitingOn: waitingOnFor(vouch, viewerBusinessId),
    // The other party, pre-resolved so the client doesn't branch on role to
    // decide which side of the relation to render.
    counterparty:
      roleFor(vouch, viewerBusinessId) === "giver"
        ? (vouch.toBusiness ?? null)
        : (vouch.fromBusiness ?? null),

    revisions: revisions.map((r) => ({
      id: r.id,
      revisionNumber: r.revisionNumber,
      comment: r.comment,
      createdAt: r.createdAt,
    })),
    timeline: actions.map((a) => serializeAction(a, viewerBusinessId, { includeAdminIdentity })),
  };
}

export { turnFor, roleFor, waitingOnFor, hasTurn, serializeVouch, VOUCH_INCLUDE, BUSINESS_SELECT };
