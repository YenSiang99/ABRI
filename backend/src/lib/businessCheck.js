import { prisma } from "../prisma.js";

// The member's own log of which businesses they checked, and when.
//
// THE DIRECTION IS THE WHOLE FEATURE. This answers "what have I checked?" and
// must never be able to answer "who has been checking me?". The second
// question is what turns a trust directory into surveillance: a business that
// could see it was being looked into would learn something about a
// counterparty's private diligence, and members would quietly stop checking
// anyone they might have to face.
//
// Enforced the way lib/follows.js enforces the same rule — every read is
// keyed off the SESSION, never off a business id in a path. There is no
// function here that takes a target id, and adding one would undo the model.
//
// WRITTEN ONLY FOR MEMBERS WHO CAN READ IT BACK (Pro). Logging a Free
// member's searches to sell them the history later would be collecting data
// in order to manufacture a need for it. The honest version is that the log
// starts when you start paying for it and is empty before that — which also
// means a downgrade stops the collection rather than only hiding it.

// How long a repeat check counts as the same check.
//
// Without this, one member typing a name into a debounced search box writes a
// row per keystroke-pause, and their "history" becomes a transcript of their
// typing rather than a record of their decisions.
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

// Record that this member looked at these businesses.
//
// Fire-and-forget from the caller's point of view: a lookup must not fail, or
// slow down, because a log write did. The route awaits it only so a test can
// assert on the row.
//
// levelAtCheck is stored, not joined. The point of a check history is that it
// records what you were TOLD when you made a decision — a log that read the
// level live would rewrite its own past every time a business changed, which
// is precisely what makes it worthless as evidence.
async function recordChecks(checkedById, businesses) {
  if (!checkedById || businesses.length === 0) return 0;

  const since = new Date(Date.now() - DEDUPE_WINDOW_MS);
  const recent = await prisma.businessCheck.findMany({
    where: {
      checkedById,
      checkedId: { in: businesses.map((b) => b.id) },
      createdAt: { gt: since },
    },
    select: { id: true, checkedId: true },
  });
  const recentByTarget = new Map(recent.map((r) => [r.checkedId, r.id]));

  const writes = businesses.map((business) => {
    const existingId = recentByTarget.get(business.id);
    return existingId
      ? // Refreshed rather than duplicated — and the level is rewritten too,
        // because the second look is the one they acted on.
        prisma.businessCheck.update({
          where: { id: existingId },
          data: { createdAt: new Date(), levelAtCheck: business.verificationLevel },
        })
      : prisma.businessCheck.create({
          data: {
            checkedById,
            checkedId: business.id,
            levelAtCheck: business.verificationLevel,
          },
        });
  });

  await prisma.$transaction(writes);
  return writes.length;
}

// The member's own history, newest first. Takes the session's business id and
// nothing else — see the header.
async function listChecks(checkedById, { limit = 50 } = {}) {
  const rows = await prisma.businessCheck.findMany({
    where: { checkedById },
    include: {
      checked: {
        select: { id: true, name: true, category: true, location: true, verificationLevel: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    checkedAt: row.createdAt,
    business: row.checked,
    levelAtCheck: row.levelAtCheck,
    // The half that makes this a record rather than a list: what you were
    // told then, against what is true now. A business that has since lost its
    // verification is the case this feature exists to surface.
    levelChanged: row.levelAtCheck !== row.checked.verificationLevel,
  }));
}

export { recordChecks, listChecks, DEDUPE_WINDOW_MS };
