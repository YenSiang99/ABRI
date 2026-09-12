import { prisma } from "../prisma.js";

// Who opened your profile — the one relation in this codebase read from the
// TARGET's side.
//
// READ THE MODEL COMMENT IN schema.prisma BEFORE CHANGING ANYTHING HERE. The
// short version: lib/businessCheck.js argues at length that a business able to
// see it was being looked into learns a counterparty's private diligence, and
// that members would stop checking anyone they might have to face. That
// argument still stands on its merits; it was overruled deliberately (Sep
// 2026), not forgotten. The mitigations below are what is left of it, and each
// one is load-bearing rather than decorative.
//
// PRIVATE BROWSING IS THAT MITIGATION (Sep 2026). A member may opt out of
// being named, and the row is still written and still counted — only the name
// is withheld. Two rules make it hold together, and neither is optional:
//
//   1. It costs the member their own viewer list. Enforced in
//      routes/watches.js, not here. Without it, "see everyone, be seen by
//      nobody" is a free switch, which is worse than the feature this was
//      added to soften.
//   2. It is free. Selling privacy would leave the cheapest members the most
//      exposed, in a product that sells trust.
//
// There is deliberately no semi-private mode. LinkedIn offers one ("an
// accounting firm in Petaling Jaya viewed you") and it is anonymous at their
// scale; in a directory keyed on category and location it frequently names a
// single business, which is a privacy setting that leaks.

// How much history a viewer list covers. LinkedIn uses 90 days; 30 keeps the
// screen about who is looking at you NOW, which is the only version of this
// that drives an action rather than a grudge.
const VIEWER_WINDOW_DAYS = 30;

function viewerWindowStart() {
  return new Date(Date.now() - VIEWER_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

// Record that `viewerId` opened `viewedId`'s profile.
//
// WRITTEN FOR EVERY SIGNED-IN VIEWER, deliberately unlike recordChecks, which
// only writes for members who can read their own log back. The asymmetry is
// the point: this row is not the viewer's data, it is the viewed business's,
// and a write gated on the VIEWER's tier would make "12 businesses viewed you"
// mean "12 Pro businesses viewed you" — a number that is wrong rather than
// merely partial, and wrong in a direction that flatters the expensive plans.
//
// Upserted, one row per pair. A viewer who opens the same profile every
// morning is one entry with a moving count, not thirty events: the screen
// lists businesses, and an event row per open would make this table the
// largest in the database within a month, on the busiest route in the app.
async function recordProfileView(viewedId, viewerId, { anonymous = false } = {}) {
  if (!viewedId || !viewerId) return false;
  // Self-views are not views. Excluded here as well as at the call site,
  // because this is the half that stays true if a second caller appears.
  if (viewedId === viewerId) return false;

  await prisma.profileView.upsert({
    where: { viewedId_viewerId: { viewedId, viewerId } },
    // `anonymous` is rewritten on every view, not just set on create — the
    // row carries the mode of the LATEST visit. See the column comment: a
    // member who turns the setting on disappears from the lists they keep
    // visiting, rather than only from ones they visit next.
    update: { viewCount: { increment: 1 }, lastViewedAt: new Date(), anonymous },
    create: { viewedId, viewerId, anonymous },
  });
  return true;
}

// The counts every member sees, on every plan.
//
// THIS HALF IS NEVER GATED, and that is what makes the gated half sellable.
// "Someone viewed your profile" with no name is a real signal a Free member
// can act on — it is the reason to open the app — and withholding it too would
// leave nothing to upgrade FOR. Same shape as the vouch gate on a public
// profile: the count is the free half, the identities are the paid half.
async function viewerSummary(viewedId) {
  const since = viewerWindowStart();
  const rows = await prisma.profileView.findMany({
    where: { viewedId, lastViewedAt: { gte: since } },
    // `anonymous` is selected because anonymousCount below counts on it. It
    // was omitted once and the field silently reported 0 for every business:
    // an unselected Prisma column is undefined, not false, and
    // `filter(r => r.anonymous)` on undefined is an empty array rather than
    // an error.
    select: { viewCount: true, anonymous: true },
  });
  return {
    // Distinct businesses — what "7 people viewed you" means to a reader.
    // COUNTS ANONYMOUS VIEWERS. They looked; the member is entitled to know
    // it happened. Only the name is withheld.
    viewerCount: rows.length,
    // Total opens. Shown as "viewed 12 times" and always >= viewerCount.
    viewCount: rows.reduce((sum, row) => sum + row.viewCount, 0),
    // How many of the above will never appear in listViewers. Sent so the
    // screen can say "2 of them chose not to be named" instead of leaving a
    // Pro member to notice their list is shorter than their count and assume
    // the product is broken.
    anonymousCount: rows.filter((row) => row.anonymous).length,
    windowDays: VIEWER_WINDOW_DAYS,
  };
}

// The identities. Pro only — the caller checks, not this function.
//
// Returns the viewer's PUBLIC card and nothing else. No contact fields, no
// membershipTier: being looked at does not entitle you to more about the
// looker than any visitor to their profile would get, and routing this through
// the same fields the directory shows keeps that true by construction.
async function listViewers(viewedId, { limit = 50 } = {}) {
  const rows = await prisma.profileView.findMany({
    // `anonymous: false` is the whole of private browsing on the read side.
    // These rows are still counted by viewerSummary — they are excluded from
    // the NAMES, not from the numbers.
    where: { viewedId, anonymous: false, lastViewedAt: { gte: viewerWindowStart() } },
    include: {
      viewer: {
        select: { id: true, name: true, category: true, location: true, verificationLevel: true },
      },
    },
    orderBy: { lastViewedAt: "desc" },
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    business: row.viewer,
    lastViewedAt: row.lastViewedAt,
    firstViewedAt: row.firstViewedAt,
    // "Viewed you 4 times" — the half that separates a passing click from
    // sustained interest, which is the only actionable thing on this screen.
    viewCount: row.viewCount,
  }));
}

export { recordProfileView, viewerSummary, listViewers, VIEWER_WINDOW_DAYS };
