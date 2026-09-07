import { prisma } from "../prisma.js";
import { createActivityEvent } from "./activityEvents.js";

// An ask stops taking answers 30 days after it was posted. Longer than the
// vouch's 14 because a vouch is waiting on one named business who has already
// been asked, while an ask is waiting on whoever happens to read the board —
// a month is roughly how long a real requirement stays real.
const ASK_EXPIRY_DAYS = 30;

// Note "under_review" is absent, and "answered"/"closed" are terminal: a
// frozen ask is waiting on an admin, not on anyone who could have acted, so
// timing it out would punish the asker for a queue they can't clear. Same
// call lib/vouchExpiry.js makes, for the same reason.
//
// Reads the stored expiresAt rather than computing createdAt + 30, because an
// admin restoring a frozen ask RESTARTS the clock by writing that column —
// the days spent in a review queue aren't the asker's to lose.
function isExpired(ask) {
  if (ask.status !== "open") return false;
  return ask.expiresAt.getTime() < Date.now();
}

// Applies the lazy expiry check to an already-loaded Ask row — if it's open
// and past its deadline, closes it and returns the updated row; otherwise
// returns the row unchanged. No cron job: every route that reads or acts on
// an Ask calls this first, because there is no background-job infrastructure
// in this codebase.
//
// The one place this is deliberately NOT called is the alert count in
// routes/asks.js, which filters on expiresAt in its `where` instead. A count
// is a hot-path read and must not write.
async function applyExpiryIfNeeded(ask) {
  if (!isExpired(ask)) return ask;

  const closedAt = new Date();
  const [updated] = await prisma.$transaction([
    prisma.ask.update({
      where: { id: ask.id },
      data: { status: "closed", closedAt },
    }),
    // actorBusinessId null: nobody closed this, it lapsed. The message (see
    // ACTIVITY_MESSAGES) names a next step, which is what makes an event
    // about something nobody did worth sending at all.
    createActivityEvent(prisma, {
      businessId: ask.askedByBusinessId,
      actorBusinessId: null,
      type: "ask_expired",
    }),
  ]);
  // Merge rather than replace — `ask` may carry joined relations (answers,
  // askedByBusiness) that a bare update() doesn't return, and callers rely
  // on those surviving this check. Same trap vouchExpiry.js documents.
  return { ...ask, status: updated.status, closedAt: updated.closedAt };
}

export { applyExpiryIfNeeded, ASK_EXPIRY_DAYS };
