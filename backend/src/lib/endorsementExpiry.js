import { prisma } from "../prisma.js";
import { createActivityEvent } from "./activityEvents.js";

const EXPIRY_DAYS = 14;

// Note "under_review" is absent: a flagged endorsement is waiting on an admin,
// not on either business, so timing it out would punish the parties for a
// queue they can't clear. It stays put until the admin acts.
function isExpired(endorsement) {
  if (endorsement.status !== "pending" && endorsement.status !== "reverted") return false;
  const cutoff = Date.now() - EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  return endorsement.lastActionAt.getTime() < cutoff;
}

// Applies the lazy 14-day expiry check to an already-loaded Endorsement row — if
// it's pending/reverted and untouched too long, flips it to cancelled
// (same end state as an explicit cancel, including notifying the giver)
// and returns the updated row; otherwise returns the row unchanged. No
// cron job: every route that reads/acts on a Endorsement calls this first,
// rather than running on a schedule — there's no background-job infra in
// this codebase yet.
async function applyExpiryIfNeeded(endorsement) {
  if (!isExpired(endorsement)) return endorsement;

  const [updated] = await prisma.$transaction([
    prisma.endorsement.update({
      where: { id: endorsement.id },
      data: { status: "cancelled", lastActionAt: new Date(), closedAt: new Date() },
    }),
    // actorId null: nobody cancelled this, it lapsed.
    prisma.endorsementAction.create({
      data: {
        endorsementId: endorsement.id,
        attempt: endorsement.attempt,
        action: "expire",
        revisionId: endorsement.currentRevisionId,
        actorId: null,
        fromStatus: endorsement.status,
        toStatus: "cancelled",
      },
    }),
    // endorsement_expired, not endorsement_cancelled: the status lands on "cancelled"
    // either way, but telling the giver their counterparty cancelled — when
    // that business simply never replied — puts a rejection that never
    // happened into a permanent, member-visible feed.
    //
    // The receiver is still carried as actorBusinessId so the feed can name
    // which endorsement lapsed and show their avatar; the message (see
    // ACTIVITY_MESSAGES in lib/activityEvents.js) is worded to make them its
    // subject rather than its culprit.
    createActivityEvent(prisma, {
      businessId: endorsement.fromBusinessId,
      actorBusinessId: endorsement.toBusinessId,
      type: "endorsement_expired",
    }),
  ]);
  // Merge rather than replace — `endorsement` may carry joined relations (e.g. a
  // `toBusiness`/`fromBusiness` include) that a bare `update()` call
  // doesn't return, and callers rely on those surviving this check.
  return { ...endorsement, status: updated.status, lastActionAt: updated.lastActionAt, closedAt: updated.closedAt };
}

export { applyExpiryIfNeeded };
