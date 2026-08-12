import { prisma } from "../prisma.js";
import { createActivityEvent } from "./activityEvents.js";

const EXPIRY_DAYS = 14;

// Note "under_review" is absent: a flagged vouch is waiting on an admin,
// not on either business, so timing it out would punish the parties for a
// queue they can't clear. It stays put until the admin acts.
function isExpired(vouch) {
  if (vouch.status !== "pending" && vouch.status !== "reverted") return false;
  const cutoff = Date.now() - EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  return vouch.lastActionAt.getTime() < cutoff;
}

// Applies the lazy 14-day expiry check to an already-loaded Vouch row — if
// it's pending/reverted and untouched too long, flips it to cancelled
// (same end state as an explicit cancel, including notifying the giver)
// and returns the updated row; otherwise returns the row unchanged. No
// cron job: every route that reads/acts on a Vouch calls this first,
// rather than running on a schedule — there's no background-job infra in
// this codebase yet.
async function applyExpiryIfNeeded(vouch) {
  if (!isExpired(vouch)) return vouch;

  const [updated] = await prisma.$transaction([
    prisma.vouch.update({
      where: { id: vouch.id },
      data: { status: "cancelled", lastActionAt: new Date(), closedAt: new Date() },
    }),
    // actorId null: nobody cancelled this, it lapsed. The receiver gets
    // named as the actor on the ActivityEvent below because that feed is
    // about who to chase up, but the audit log has to stay literal — an
    // admin reading the timeline must be able to tell a real cancel from
    // a timeout.
    prisma.vouchAction.create({
      data: {
        vouchId: vouch.id,
        attempt: vouch.attempt,
        action: "expire",
        revisionId: vouch.currentRevisionId,
        actorId: null,
        fromStatus: vouch.status,
        toStatus: "cancelled",
      },
    }),
    createActivityEvent(prisma, {
      businessId: vouch.fromBusinessId,
      actorBusinessId: vouch.toBusinessId,
      type: "vouch_cancelled",
    }),
  ]);
  // Merge rather than replace — `vouch` may carry joined relations (e.g. a
  // `toBusiness`/`fromBusiness` include) that a bare `update()` call
  // doesn't return, and callers rely on those surviving this check.
  return { ...vouch, status: updated.status, lastActionAt: updated.lastActionAt, closedAt: updated.closedAt };
}

export { applyExpiryIfNeeded };
