import { Router } from "express";

import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { listWatches } from "../lib/businessWatch.js";
import { listChecks } from "../lib/businessCheck.js";
import { can } from "../lib/entitlements.js";

const router = Router();

// The two Pro tools that keep working after the member closes the tab.
//
// Both are keyed off the SESSION and nothing else. There is no route here
// that takes a business id and tells you about that business's watchers or
// who has been checking it — see the models in schema.prisma. A route that
// answered "who is watching me?" would put a private signal about the watcher
// onto the watched business's screen, and one that answered "who checked me?"
// would expose a counterparty's diligence. Both are the mistake
// lib/follows.js already refuses to make with follower lists.
//
// PLAN-GATED ON THE VIEWER, which is unusual in this codebase and deliberate.
// Everywhere else a gate asks about the business being looked AT. These ask
// about the member doing the looking, and they are allowed to because they
// withhold nothing a seller published — see the "viewer-side gates" block in
// lib/entitlements.js. A 402 here is honest: there is a real thing to buy.

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

function failUpgrade(tier, message) {
  throw Object.assign(new Error(message), {
    status: 402,
    requiredMembershipTier: tier,
  });
}

// Loads the caller's own business AND checks the gate, because every route in
// this file needs both and doing them separately is how one gets forgotten.
async function requireFeature(req, feature, message) {
  if (!req.account.businessId) fail(400, "You need a claimed business to do this.");
  const business = await prisma.business.findUnique({ where: { id: req.account.businessId } });
  if (!business) fail(400, "You need a claimed business to do this.");
  if (!can(business, feature)) failUpgrade("pro", message);
  return business;
}

// ─── Watches ────────────────────────────────────────────────────────────────

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const business = await requireFeature(
      req,
      "watchBusinesses",
      "Watching a business is part of Pro. Upgrade to be told when their verification changes.",
    );
    res.json({ watches: await listWatches(business.id) });
  }),
);

// Idempotent: watching something you already watch is a success, not a
// conflict. Same reasoning as POST /follows — this fires from a button that
// may be double-pressed, and the caller asked for a state that is now true
// either way.
router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const business = await requireFeature(
      req,
      "watchBusinesses",
      "Watching a business is part of Pro. Upgrade to be told when their verification changes.",
    );
    const { businessId } = req.body ?? {};
    if (!businessId) fail(400, "A business to watch is required.");
    if (businessId === business.id) fail(400, "You can't watch your own business.");

    const target = await prisma.business.findUnique({ where: { id: businessId } });
    if (!target) fail(404, "Business not found.");

    // UNLIKE POST /follows, an unclaimed listing is ALLOWED and is the best
    // reason to use this. follows.js refuses a T0 because a follow watches
    // what somebody DOES and an unclaimed listing does nothing — and its own
    // comment names this as the better feature: "'Tell me when this gets
    // claimed' is a better feature and the reason to revisit that line."
    // A watch watches a FACT, and "nobody has claimed this yet" is exactly
    // the fact a member wants told about.

    const watch = await prisma.businessWatch.upsert({
      where: { watcherId_watchedId: { watcherId: business.id, watchedId: target.id } },
      update: {},
      // Recorded at watch time so the first notification can say what
      // CHANGED rather than only what it is now.
      create: {
        watcherId: business.id,
        watchedId: target.id,
        lastSeenLevel: target.verificationLevel,
      },
    });

    res.status(201).json({ watch: { id: watch.id, createdAt: watch.createdAt } });
  }),
);

// Keyed by BUSINESS id rather than the watch row's, matching DELETE
// /follows/:businessId: the caller is a result card that knows the business
// and nothing else. deleteMany, so un-watching something you don't watch is a
// no-op rather than a 404 — the caller asked for a state that is already true.
router.delete(
  "/:businessId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const business = await requireFeature(
      req,
      "watchBusinesses",
      "Watching a business is part of Pro.",
    );
    await prisma.businessWatch.deleteMany({
      where: { watcherId: business.id, watchedId: req.params.businessId },
    });
    res.json({ ok: true });
  }),
);

// ─── Check history ──────────────────────────────────────────────────────────
//
// Mounted under /watches because both are the same Pro bundle on the same
// screen. It takes no target id and never will: see the BusinessCheck model.
router.get(
  "/checks",
  requireAuth,
  asyncHandler(async (req, res) => {
    const business = await requireFeature(
      req,
      "checkHistory",
      "Your check history is part of Pro. Upgrade to keep a record of who you checked and when.",
    );
    res.json({ checks: await listChecks(business.id) });
  }),
);

export { router as watchRouter };
