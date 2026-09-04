import { Router } from "express";

import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { listFollowing, listFollowers } from "../lib/follows.js";
import { UNCLAIMED } from "../lib/verificationLevels.js";

const router = Router();

// Four routes, and none of them TELLS the followed business anything. That is
// the feature — read the Follow comment in schema.prisma before adding a
// fifth. No accept, no decline, no withdraw, and no notification in either
// direction.
//
// GET /followers lets a business look up its own followers, which is the one
// thing this file learned to do in Aug 2026. Note what it is not: it is keyed
// off the session, never off a business id in the path, so there is no way to
// ask who follows SOMEONE ELSE. That is deliberate — a route taking an
// arbitrary id is a follower count waiting to be rendered on a profile, and
// a count is the thing that turns a private watchlist into a public score.
//
// The contrast with routes/connections.js is the point of the split: a
// connection is a claim about a relationship and needs the other side's
// agreement; a follow is a statement about the follower and needs nobody's.
//
// Uncapped on every plan, Free included. Nothing here asks lib/entitlements
// anything, deliberately: the cap that matters is on connection REQUESTS,
// which land on someone's desk. A private list costs nobody anything, and
// Free needs something genuinely useful it can do.

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

async function loadOwnBusiness(req) {
  if (!req.account.businessId) fail(400, "You need a claimed business to do this.");
  const business = await prisma.business.findUnique({ where: { id: req.account.businessId } });
  if (!business) fail(400, "You need a claimed business to do this.");
  return business;
}

// Who the caller follows. An account with no business gets an empty list
// rather than a 400, matching GET /connections: this is a read, and an admin
// account legitimately has no business.
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.account.businessId) return res.json({ following: [] });
    res.json({ following: await listFollowing(req.account.businessId) });
  }),
);

// Who follows the caller. The id comes from the session and from nowhere
// else — see the note at the top of this file for why there is no
// /follows/:businessId/followers and should never be one.
//
// Sits above DELETE /:businessId in the file but cannot collide with it
// regardless: that one is a DELETE and this is a GET.
router.get(
  "/followers",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.account.businessId) return res.json({ followers: [] });
    res.json({ followers: await listFollowers(req.account.businessId) });
  }),
);

// Idempotent: following someone you already follow is a success, not a
// conflict. Same reasoning as POST /connections — this fires from a button
// that may be double-pressed, and the caller asked for a state that is now
// true either way.
router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const own = await loadOwnBusiness(req);
    const { businessId } = req.body ?? {};

    if (!businessId) fail(400, "A business to follow is required.");
    if (businessId === own.id) fail(400, "You can't follow your own business.");

    const target = await prisma.business.findUnique({ where: { id: businessId } });
    if (!target) fail(404, "Business not found.");
    // Matches POST /connections. An unclaimed listing has no owner, so there
    // is nobody whose activity you'd be watching — following one would be a
    // subscription to a feed that structurally cannot produce anything.
    //
    // "Tell me when this gets claimed" is a real and better feature, and the
    // reason to revisit this line. It needs an event that doesn't exist yet.
    if (target.verificationLevel === UNCLAIMED) fail(400, "This business hasn't been claimed yet.");

    // upsert rather than find-then-create: the unique constraint is the
    // authority, so this can't lose a race the way a pre-check can. Nothing
    // to update on a repeat — a follow has no fields worth rewriting.
    const follow = await prisma.follow.upsert({
      where: { followerId_followedId: { followerId: own.id, followedId: target.id } },
      update: {},
      create: { followerId: own.id, followedId: target.id },
    });

    res.status(201).json({ follow: { id: follow.id, createdAt: follow.createdAt } });
  }),
);

// Keyed by BUSINESS id, not follow id — unlike DELETE /connections/:id.
// The asymmetry is deliberate and follows what each caller actually holds: a
// connection is removed from a card that was rendered from the connection
// row, so its id is right there, whereas unfollow is pressed on a business
// profile that knows only the business. Making that caller look up a follow
// id first would be a round trip to learn something the server can derive.
//
// deleteMany rather than delete: unfollowing something you don't follow is a
// no-op, not a 404. The caller asked for a state that is already true.
router.delete(
  "/:businessId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const own = await loadOwnBusiness(req);
    await prisma.follow.deleteMany({
      where: { followerId: own.id, followedId: req.params.businessId },
    });
    res.json({ ok: true });
  }),
);

export { router as followRouter };
