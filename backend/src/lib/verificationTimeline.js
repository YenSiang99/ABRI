import { verificationLevelsAtOrAbove, UNCLAIMED } from "./verificationLevels.js";

// A business's verification history, in order, including what it LOST.
//
// THE SAME ROWS AS THE FEED, READ FOR THE OPPOSITE PURPOSE. lib/networkEvents.js
// is explicit that an event whose source has moved on "is not deleted, hidden
// by a flag, or swept by a job — it simply stops matching". That is exactly
// right for a feed, whose job is to stop announcing something that is no longer
// true. It is exactly wrong for an audit record, whose job is to show that it
// WAS true and then stopped. So this module reads NetworkEvent without
// visibleNetworkEventsWhere and re-derives the same "still in force" test
// itself, keeping the retracted rows instead of dropping them.
//
// WHY THIS IS THE PRODUCT AND NOT A NICETY. Every other directory a business
// appears in shows only what is currently true and only what flatters. The one
// sentence a counterparty actually needs — "SSM-verified in April, lapsed in
// August" — is the one nobody else will print. CheckHistory already carries
// that instinct ("verified when I paid them, not verified now"); this puts the
// same fact on the profile, where the person deciding is looking.
//
// FACTS AND DATES, NEVER A SCORE. Each entry is an event that happened on a
// day. There is deliberately no aggregate, no rating and no "trust level"
// derived here: the moment a number is published, every dispute about a
// business becomes a dispute about our arithmetic, and a dated fact is
// defensible in a way a judgement is not.

// The types that describe a move on the verification ladder, in the order they
// would be read. Content events (vouches) are deliberately absent — they
// belong to their own tab, and mixing them in would turn a verification
// record into a general activity log.
const TIMELINE_TYPES = ["business_claimed", "business_verified", "business_verification_revoked"];

// Whether an announcement still holds, using the rule visibleNetworkEventsWhere
// applies in SQL: the business must still be at or above the level the row
// announced. Revocations are never "in force" in that sense — they record a
// loss rather than a standing, so they are always shown as they were written.
function stillInForce(event, currentLevel) {
  if (event.type === "business_verification_revoked") return true;
  if (!event.toVerificationLevel) return true;
  return verificationLevelsAtOrAbove(event.toVerificationLevel).includes(currentLevel);
}

// Oldest first. A history reads forward — the opposite of the feed, which is
// newest-first because it answers "what is new?" rather than "what happened?".
async function verificationTimelineFor(prisma, business) {
  if (!business || business.verificationLevel === UNCLAIMED) return [];

  const events = await prisma.networkEvent.findMany({
    where: { subjectBusinessId: business.id, type: { in: TIMELINE_TYPES } },
    select: { id: true, type: true, toVerificationLevel: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  return events.map((event) => ({
    id: event.id,
    type: event.type,
    level: event.toVerificationLevel,
    at: event.createdAt,
    // The half the feed throws away. False means "this was announced and no
    // longer holds" — a claim that was later reversed, which is precisely the
    // row a counterparty came here to find.
    inForce: stillInForce(event, business.verificationLevel),
  }));
}

export { verificationTimelineFor, TIMELINE_TYPES };
