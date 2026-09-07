import { Router } from "express";

import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { listFollowing } from "../lib/follows.js";
import {
  NETWORK_EVENT_INCLUDE,
  visibleNetworkEventsWhere,
  serializeNetworkEvent,
} from "../lib/networkEvents.js";

const router = Router();

// One route. The feed is a read and nothing else — there is no compose box,
// no reaction, no comment, and no report button, because every row is already
// somebody's third-party statement about somebody else and is already
// moderated where it was written (see lib/networkEvents.js).
//
// THREE THINGS THIS FILE MUST NOT GROW, each for a reason written down
// elsewhere in the codebase:
//
//   1. A can() call. The feed is never plan-gated. entitlements.js puts it
//      plainly for the asks board and it is the same argument here: the
//      moment a Free member cannot SEE the network, it stops being one. What
//      Free cannot do is GIVE a vouch — watching them go past is the pitch,
//      and it only works if they can watch.
//
//   2. Connections or follows as content. Both are private to each side by
//      explicit design. "X connected with Y" forges exactly the signal
//      AUTO_ACCEPT_SOURCES exists to keep honest, and "X followed Y" breaks
//      the unannounced-follow rule that routes/follows.js is built around.
//      Note the asymmetry that is fine: follows are used here to FILTER
//      (scope=following, off your own list), never to fill.
//
//   3. A public counterpart. Members only, same as the asks board. The
//      testimonials on it are already public on profiles one at a time; a
//      logged-out firehose of who-vouched-for-whom is a scrape of the trust
//      graph, which is the one asset the product actually sells.
//
// No lazy-expiry sweep either, unlike routes/asks.js. Nothing here goes stale
// on a clock — a feed row stops being visible when its SOURCE changes state,
// which the where clause reads live on every request.

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const SCOPES = new Set(["network", "following"]);

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

// GET /feed?scope=network|following&cursor=<eventId>&limit=20
//
// An account with no business gets the network scope and an empty following
// scope rather than a 400 — this is a read, and an admin account legitimately
// has no business. Matches GET /follows and GET /connections.
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const scope = req.query.scope ?? "network";
    if (!SCOPES.has(scope)) fail(400, "Unknown feed scope.");

    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);

    let followedIds = null;
    if (scope === "following") {
      if (!req.account.businessId) return res.json({ events: [], nextCursor: null });
      const following = await listFollowing(req.account.businessId);
      followedIds = following.map((f) => f.business.id);
    }

    const cursor = req.query.cursor;
    const events = await prisma.networkEvent.findMany({
      where: visibleNetworkEventsWhere({ followedIds }),
      include: NETWORK_EVENT_INCLUDE,
      // id is in the sort, not decoration: two events written inside the same
      // millisecond — approving a claim writes one while the recommendations
      // it unblocks write more — would otherwise be free to swap places
      // between two pages and hand the reader a duplicate. Matches the
      // @@index([createdAt, id]) declared for exactly this query.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      // Over-fetch by one to learn whether there IS a next page, rather than
      // running a second count query against the same predicate.
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = events.length > limit;
    const page = hasMore ? events.slice(0, limit) : events;

    res.json({
      events: page.map(serializeNetworkEvent),
      // The id to pass back as ?cursor=. Null means the end — the client
      // renders no "Load more" rather than having to compare lengths.
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  }),
);

export { router as feedRouter };
