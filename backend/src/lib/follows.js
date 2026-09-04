import { prisma } from "../prisma.js";
import { CONNECTION_BUSINESS_SELECT } from "./connections.js";

// Following, and how little there is to it. Deliberately the thinnest module
// in lib/: no state machine, no approval, no notification, no counterpart in
// activityEvents.js. Every one of those absences is the feature.
//
// Read the Follow comment in schema.prisma before adding to this file.
//
// Since Aug 2026 a business CAN see who follows it — listFollowers below, and
// the Followers tab it powers. That is a narrower opening than it looks, and
// the line to hold is between the two halves of it:
//
//   The owner reading their own follower list — allowed. It is their own
//   data, it costs nobody anything, and a watchlist you can never see the
//   other side of is a strange thing to ask a member to trust.
//
//   A follower COUNT on a profile — still nowhere, deliberately. The moment
//   one is rendered, following becomes a public popularity number: it gets
//   solicited, farmed and compared, and it stops being a private signal about
//   the follower. Both halves are cheap to serve off this table; only one is
//   cheap to take back.
//
// Still no notification and still no activity event, in either direction.
// Following is unannounced — the followed business can go and look, but is
// never told, and never told who stopped.
//
// Reuses CONNECTION_BUSINESS_SELECT rather than defining its own: a followed
// business renders in the same card as a connected one, and two selects that
// have to stay identical is how one of them ends up missing `location` and a
// card renders half-empty.

// Same shape a serialized connection has, minus everything that only makes
// sense for a two-sided relationship (status, requestedByYou, respondedAt,
// source). A follow has no state to report — it exists or it doesn't.
//
// Takes the business explicitly rather than reading a fixed side off the row,
// because the two lists below read opposite ends of the same table: the
// counterparty is `followed` going one way and `follower` going the other.
function serializeFollow(follow, business) {
  return {
    id: follow.id,
    createdAt: follow.createdAt,
    business: business ?? null,
  };
}

const FOLLOWING_INCLUDE = { followed: { select: CONNECTION_BUSINESS_SELECT } };
const FOLLOWER_INCLUDE = { follower: { select: CONNECTION_BUSINESS_SELECT } };

// Who this business follows.
async function listFollowing(followerId) {
  const rows = await prisma.follow.findMany({
    where: { followerId },
    include: FOLLOWING_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => serializeFollow(row, row.followed));
}

// Who follows this business. Only ever called with the CALLER'S own id — see
// the route. There is no version of this that takes an arbitrary business id,
// because that is the query a follower count would be built on.
async function listFollowers(followedId) {
  const rows = await prisma.follow.findMany({
    where: { followedId },
    include: FOLLOWER_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => serializeFollow(row, row.follower));
}

export { FOLLOWING_INCLUDE, FOLLOWER_INCLUDE, serializeFollow, listFollowing, listFollowers };
