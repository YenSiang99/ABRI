import { prisma } from "../prisma.js";
import { createActivityEvent } from "./activityEvents.js";
import { UNCLAIMED, VERIFICATION_LEVELS } from "./verificationLevels.js";

// Watching a business, and telling the watcher when its standing changes.
//
// This is the feature routes/follows.js pointed at and declined to build:
// "Following an unclaimed (T0) listing is refused: there's no owner, so
// nothing could ever appear. 'Tell me when this gets claimed' is a better
// feature and the reason to revisit that line."
//
// A WATCH IS NOT A FOLLOW. A follow is about a relationship — you want to see
// what somebody does — and is meaningless on an unclaimed listing. A watch is
// about a FACT changing, and an unclaimed listing is the single most useful
// thing to point one at: you checked a counterparty, ABRI held only a bare
// listing, and the thing you actually want to know is the moment that stops
// being true.
//
// Unannounced in both directions, exactly like a follow. The watched business
// is never told, cannot list its watchers, and no count appears anywhere. The
// reasoning is the one in the Follow model: both reads come off the same
// index, and only one of them can be taken back once a number is on a page.

const WATCH_BUSINESS_SELECT = {
  id: true,
  name: true,
  category: true,
  location: true,
  verificationLevel: true,
};

function serializeWatch(watch) {
  return {
    id: watch.id,
    createdAt: watch.createdAt,
    business: watch.watched,
    // What it was when they started watching, so the client can show that a
    // change has happened since without a second request.
    lastSeenLevel: watch.lastSeenLevel,
  };
}

async function listWatches(watcherId) {
  const rows = await prisma.businessWatch.findMany({
    where: { watcherId },
    include: { watched: { select: WATCH_BUSINESS_SELECT } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(serializeWatch);
}

// Tell everyone watching this business that its level moved.
//
// Called from the three places a verificationLevel changes: the admin's
// verify-ssm and revoke-ssm, and a claim approval. Deliberately NOT a lazy
// check on read — a watch exists precisely so the member does not have to
// come back and look, so a notification that only fires when somebody
// happens to open a page would be the feature doing nothing.
//
// SKIPS THE WATCHER WHOSE OWN BUSINESS CHANGED. You do not need telling that
// you got verified; ssm_verified already said so.
//
// Returns the number notified, so callers can assert on it.
async function notifyWatchers(businessId, { fromLevel, toLevel }) {
  if (fromLevel === toLevel) return 0;

  const watches = await prisma.businessWatch.findMany({
    where: { watchedId: businessId, watcherId: { not: businessId } },
    select: { id: true, watcherId: true },
  });
  if (watches.length === 0) return 0;

  // The message is chosen from the DIRECTION of travel, which is the whole
  // reason lastSeenLevel is stored. A watcher told "is now Claimed" when a
  // business was just stripped back to unclaimed would have the fact right
  // and the meaning backwards.
  const type =
    fromLevel === UNCLAIMED
      ? "watched_business_claimed"
      : toLevel === UNCLAIMED
        ? "watched_business_unclaimed"
        : rankOf(toLevel) > rankOf(fromLevel)
          ? "watched_business_verified"
          : "watched_business_downgraded";

  await prisma.$transaction([
    ...watches.map((w) =>
      createActivityEvent(prisma, {
        businessId: w.watcherId,
        // No actor. An admin moved this, and staff never appear as an actor
        // in a member-facing feed — the same call ask_expired makes.
        actorBusinessId: null,
        type,
      }),
    ),
    // Caught up, so the next change is measured from here rather than from
    // whatever it was when the watch was set.
    prisma.businessWatch.updateMany({
      where: { id: { in: watches.map((w) => w.id) } },
      data: { lastSeenLevel: toLevel },
    }),
  ]);

  return watches.length;
}

// Position on the ladder, for direction only.
//
// The one place this codebase compares two levels rather than asking === or
// Set.has. It is doing something the equality checks cannot: deciding whether
// a move was up or down, which is the difference between congratulating a
// member and warning them. Reads the order out of the array in
// verificationLevels.js rather than hardcoding one, so the strings stay free
// to change.
function rankOf(level) {
  return VERIFICATION_LEVELS.indexOf(level);
}

export { WATCH_BUSINESS_SELECT, listWatches, notifyWatchers, serializeWatch };
