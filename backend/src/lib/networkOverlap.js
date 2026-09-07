import { prisma } from "../prisma.js";

// "2 of the businesses vouching for them are in your network."
//
// The single most useful sentence the check-a-business screen can say, and
// the reason it is worth opening a second time. A verification badge says a
// document was checked; this says somebody you already trust has staked their
// own reputation on them. Those are different kinds of evidence and the
// second one is the one people act on.
//
// WHY THIS IS THE PLUS FEATURE, when withholding the badge or the phone
// number would not be. ABRI-feature-checklist.md line 55 rules out charging
// the viewer for facts about the seller: the seller paid to be reachable, so
// paywalling their details punishes them rather than the browser. This
// withholds nothing of theirs. It is a comparison between the VIEWER's
// connection list and the business's voucher list — it does not exist for a
// stranger, because a stranger has no connections to compare. Nothing is
// taken away; something is added.
//
// It is also cheap. Both graphs are already stored and already indexed, so
// this is a query rather than a subsystem.

// The businesses this viewer is connected to, as a Set of ids.
//
// ACCEPTED ONLY. A pending request is one business claiming a relationship
// the other has not confirmed, and the whole reason connections grew an
// approval step in Aug 2026 is that a unilateral edge is a forgeable signal.
// Counting one here would let a member manufacture "2 people you know vouch
// for them" by sending two requests nobody answered — which is exactly the
// trust claim this feature exists to make honestly.
async function connectedIdsFor(businessId) {
  const rows = await prisma.connection.findMany({
    where: {
      status: "accepted",
      OR: [{ businessAId: businessId }, { businessBId: businessId }],
    },
    select: { businessAId: true, businessBId: true },
  });
  const ids = new Set();
  for (const row of rows) {
    ids.add(row.businessAId === businessId ? row.businessBId : row.businessAId);
  }
  // A business is never its own overlap. Cheaper to drop it here than to
  // special-case every caller.
  ids.delete(businessId);
  return ids;
}

// Which of a business's vouchers the viewer already knows.
//
// Returns the businesses themselves rather than a count, because the count
// alone is the weaker half: "2 of them are in your network" is interesting,
// and "Tan & Co and Meridian Accounting vouch for them" is what makes
// somebody pick up the phone. The client renders names.
//
// PUBLISHED VOUCHES ONLY, matching every other read of this graph. An
// in-flight vouch is not yet a statement anyone has made publicly.
async function vouchersInNetwork(targetBusinessId, viewerBusinessId) {
  const connected = await connectedIdsFor(viewerBusinessId);
  if (connected.size === 0) return [];

  const vouches = await prisma.vouch.findMany({
    where: {
      toBusinessId: targetBusinessId,
      status: "published",
      // Intersected in the query rather than in JS: the connection set is
      // usually far smaller than the voucher list, and this way the database
      // does the filtering it is already indexed for
      // (@@index([toBusinessId, status]) on Vouch).
      fromBusinessId: { in: [...connected] },
    },
    select: {
      fromBusiness: {
        select: { id: true, name: true, category: true, location: true, verificationLevel: true },
      },
    },
    orderBy: { closedAt: "desc" },
  });

  return vouches.map((v) => v.fromBusiness);
}

// The same question for a page of businesses, in one round trip.
//
// The directory renders up to fifty cards, and asking per-card would be fifty
// sequential queries on a screen that has to feel instant. Two queries total:
// the viewer's connections once, then every relevant vouch at once, grouped
// in memory.
//
// Returns a Map of businessId -> voucher[]. Businesses with no overlap are
// absent rather than mapped to an empty array, so a caller can spread the
// result without producing a key on every row.
async function vouchersInNetworkFor(targetIds, viewerBusinessId) {
  const overlap = new Map();
  if (targetIds.length === 0) return overlap;

  const connected = await connectedIdsFor(viewerBusinessId);
  if (connected.size === 0) return overlap;

  const vouches = await prisma.vouch.findMany({
    where: {
      toBusinessId: { in: targetIds },
      status: "published",
      fromBusinessId: { in: [...connected] },
    },
    select: {
      toBusinessId: true,
      fromBusiness: {
        select: { id: true, name: true, category: true, location: true, verificationLevel: true },
      },
    },
    orderBy: { closedAt: "desc" },
  });

  for (const vouch of vouches) {
    const list = overlap.get(vouch.toBusinessId) ?? [];
    list.push(vouch.fromBusiness);
    overlap.set(vouch.toBusinessId, list);
  }
  return overlap;
}

export { connectedIdsFor, vouchersInNetwork, vouchersInNetworkFor };
