// The network feed — what the whole membership sees happening — as opposed to
// lib/activityEvents.js, which is one business's private notification inbox.
//
// Same split the two tables make (see the NetworkEvent comment in
// schema.prisma): an ActivityEvent has a recipient and is fanned out per
// business; a NetworkEvent is written once and read by everyone.
//
// THE ONE INVARIANT IN THIS FILE, and the thing to preserve above all else:
// a NetworkEvent is a POINTER, never a copy. It carries the ids of the two
// businesses and a foreign key to the content — the testimonial text lives on
// VouchRevision and the answer text on AskAnswer, and the feed joins through
// for both. Nothing here is a second copy of anything that can be edited,
// withdrawn, frozen or revoked.
//
// That is what buys moderation for free. visibleNetworkEventsWhere below
// requires each event's source to STILL be in a publishable state, so a
// flagged vouch, an admin-removed answer or a revoked SSM verification drops
// its own announcement out of the feed with no compensating write anywhere.
// Nothing in routes/admin.js, routes/vouches.js or routes/asks.js has to know
// this table exists in order to un-say something.
import {
  VERIFICATION_LEVELS,
  UNCLAIMED,
  CLAIMED,
  SSM_VERIFIED,
  verificationLevelsAtOrAbove,
} from "./verificationLevels.js";

// NetworkEvent.type. String column, so this Set is what actually constrains
// it — the role ASK_CATEGORIES plays in lib/asks.js.
//
// "vouch_published" deliberately shares its name with the ActivityEvent type
// of the same name. It is one real-world event written for two audiences —
// the giver's inbox and the network — and a second name would hide that they
// are the same thing.
const NETWORK_EVENT_TYPES = new Set([
  "vouch_published",
  "recommendation_published",
  "business_claimed",
  "business_verified",
]);

// The two types that announce a move up the verification ladder rather than a
// piece of content. Grouped because they share one visibility rule (below)
// and one shape: no content pointer, and toVerificationLevel set.
const LEVEL_EVENT_TYPES = ["business_claimed", "business_verified"];

// The level each of those announces. Here rather than at the two call sites
// so the write and the visibility rule cannot disagree about what a
// business_claimed row means.
const LEVEL_EVENT_LEVEL = {
  business_claimed: CLAIMED,
  business_verified: SSM_VERIFIED,
};

// The business fields every feed payload carries. Identical today to
// ASK_BUSINESS_SELECT in lib/asks.js and COPIED rather than imported, for the
// reason that constant's own comment gives: importing it would make the next
// widening of an ask card change what the feed sends.
//
// Note what it does not select: no contact columns, no membershipTier. That
// is why publicBusinessView is not needed on this path — there is nothing
// here for it to strip — and why the tier cannot leak into a feed where it
// would read as a third kind of trust signal.
const NETWORK_BUSINESS_SELECT = {
  id: true,
  name: true,
  category: true,
  location: true,
  verificationLevel: true,
};

// One include for every feed read.
//
// The two content relations are selected down to the single field the card
// renders plus the status the `where` already filtered on. Explicit selects
// rather than `include: true`, so widening Vouch or AskAnswer later cannot
// push a new column into a public feed by default.
const NETWORK_EVENT_INCLUDE = {
  subjectBusiness: { select: NETWORK_BUSINESS_SELECT },
  actorBusiness: { select: NETWORK_BUSINESS_SELECT },
  vouch: {
    select: { status: true, currentRevision: { select: { comment: true } } },
  },
  askAnswer: { select: { status: true, comment: true } },
};

// Returns an unawaited Prisma promise — pass `prisma` directly, or a `tx`
// client inside an interactive transaction — so a caller can bundle this into
// the same prisma.$transaction([...]) as the write it announces and the two
// can never drift apart. Exactly the contract createActivityEvent offers, and
// for the same reason.
//
// The three optional ids are passed by name rather than positionally because
// every type sets a different subset, and a positional signature would make
// the two level types read as `(id, null, null, "L2")` at the call site.
function createNetworkEvent(
  client,
  { type, subjectBusinessId, actorBusinessId = null, vouchId = null, askAnswerId = null },
) {
  return client.networkEvent.create({
    data: {
      type,
      subjectBusinessId,
      actorBusinessId,
      vouchId,
      askAnswerId,
      // Derived from the type, never passed in — the same call routes/admin.js
      // makes with a flag's `outcome`. A caller that could set this
      // independently could write a business_verified row announcing L1.
      toVerificationLevel: LEVEL_EVENT_LEVEL[type] ?? null,
    },
  });
}

// Which events are visible right now, and the whole moderation story.
//
// Each branch pairs a type with the state its SOURCE must still be in. An
// event whose source has moved on is not deleted, hidden by a flag, or swept
// by a job — it simply stops matching, which is why nothing has to remember
// to un-announce anything.
//
// The level branches are generated from VERIFICATION_LEVELS rather than
// written out, because the rule is "still at or above what was announced" and
// that has to hold per row: revoking SSM (L2 -> L1) must retract the
// business_verified row while leaving business_claimed alone, and an ordinary
// promotion (L2 -> L3) must retract neither. Prisma cannot compare a column
// against a column on a relation, so the comparison is unrolled here, one
// branch per level, which is five rows of OR and no cleverness.
//
// followedIds narrows to the "Following" scope. Null means the whole network;
// an EMPTY array correctly matches nothing, which is what a member who
// follows nobody should see.
function visibleNetworkEventsWhere({ followedIds = null } = {}) {
  const live = {
    OR: [
      { type: "vouch_published", vouch: { is: { status: "published" } } },
      {
        type: "recommendation_published",
        askAnswer: { is: { status: "accepted" } },
        // The T0 rule, enforced HERE rather than at the write, and this is
        // the second thing the pointer design buys.
        //
        // An accepted answer may name an unclaimed listing — the one place
        // the asks board departs from "a T0 is refused every relational
        // action" — and that recommendation is meant to WAIT, invisible,
        // until they claim. Skipping the write would honour that once and
        // then lose it: the recommendation would go live on their profile at
        // claim time with nothing ever announcing it.
        //
        // Filtering instead means the row sits there dark and lights up by
        // itself the moment the claim flips them off L0, with no second write
        // and nothing in businessClaim.js needing to know this table exists.
        // Same reason isRecommendationPublished in lib/asks.js is derived
        // from verificationLevel rather than stored as a `published` column.
        subjectBusiness: { is: { verificationLevel: { not: UNCLAIMED } } },
      },
      ...VERIFICATION_LEVELS.map((level) => ({
        type: { in: LEVEL_EVENT_TYPES },
        toVerificationLevel: level,
        subjectBusiness: {
          is: { verificationLevel: { in: verificationLevelsAtOrAbove(level) } },
        },
      })),
    ],
  };

  if (!followedIds) return live;

  // Either end counts: a vouch written BY someone you follow is as much news
  // as one written ABOUT them.
  return {
    AND: [
      live,
      {
        OR: [
          { actorBusinessId: { in: followedIds } },
          { subjectBusinessId: { in: followedIds } },
        ],
      },
    ],
  };
}

// Fields, not a composed sentence — the one place this file deliberately
// diverges from activityEvents.js's ACTIVITY_MESSAGES.
//
// An activity row is a single clickable line, so baking the actor's name into
// the string server-side is right there. A feed card carries TWO business
// names that each link to their own profile, plus a quotation, so a
// pre-composed sentence would arrive with its links already flattened into
// text. The wording lives in pages/app/feed/FeedCard.jsx instead.
//
// Identity comes from the EVENT's own two relations, never from the content
// pointer, even where both could answer: the pointer is here for text only.
// One source for who, one for what.
function serializeNetworkEvent(event) {
  return {
    id: event.id,
    type: event.type,
    createdAt: event.createdAt,
    actor: event.actorBusiness ?? null,
    subject: event.subjectBusiness,
    // Null on the two level types, which announce a fact rather than quote
    // anyone. `currentRevision` is optional on Vouch, so a published vouch
    // with no revision row (impossible today, cheap to survive) renders as a
    // quoteless card instead of throwing.
    quote: event.vouch?.currentRevision?.comment ?? event.askAnswer?.comment ?? null,
    // Only the level types carry this; the card reads it for its label so it
    // does not need a second copy of which type means which level.
    toVerificationLevel: event.toVerificationLevel ?? null,
  };
}

export {
  NETWORK_EVENT_TYPES,
  LEVEL_EVENT_TYPES,
  LEVEL_EVENT_LEVEL,
  NETWORK_BUSINESS_SELECT,
  NETWORK_EVENT_INCLUDE,
  createNetworkEvent,
  visibleNetworkEventsWhere,
  serializeNetworkEvent,
};
