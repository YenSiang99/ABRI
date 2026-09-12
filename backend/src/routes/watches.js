import { Router } from "express";

import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { listWatches } from "../lib/businessWatch.js";
import { listChecks } from "../lib/businessCheck.js";
import { viewerSummary, listViewers } from "../lib/profileView.js";
import { can } from "../lib/entitlements.js";

const router = Router();

// The member's own tools — what they watch, what they checked, and who has
// been looking at them.
//
// EVERY ROUTE IS KEYED OFF THE SESSION and nothing else. None takes a business
// id in the path, so none can be pointed at a business the caller is not. That
// much is unchanged and must stay that way.
//
// WHAT CHANGED (Sep 2026): /viewers answers "who looked at me?", which this
// header previously ruled out in the same breath as "who is watching me?".
// Those two have come apart deliberately. Watches are still private to the
// watcher — a route exposing them would tell a business that a specific peer
// is monitoring its verification, which is a signal about the WATCHER.
// /viewers reports profile opens, from a separate table (ProfileView) written
// for that purpose. The reasoning that still rules out a watcher list is in
// lib/businessCheck.js; read it before adding a fourth route here.
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

// ─── Profile viewers ────────────────────────────────────────────────────────
//
// The MIRROR of /checks, and the reason the two share this file and a screen:
// /checks answers "who did I look at", this answers "who looked at me". Same
// relation, opposite direction, and a member who can see one immediately asks
// for the other — which is exactly what happened.
//
// THE ONLY ROUTE IN THIS FILE THAT IS NOT ALL-OR-NOTHING. The three above
// return a 402 and no data to anyone below Pro. This one always answers,
// because the count is not the paid half:
//
//   every plan  → { viewerCount, viewCount, windowDays, identitiesLocked }
//   pro         → the same, plus `viewers` with names
//
// `viewers` is ABSENT rather than empty for a Free or Plus member, the same
// idiom GET /businesses/:id uses for withheld testimonials and contact
// fields. An empty array would render as "nobody has viewed you" — the
// opposite of what a locked list means, and the one message this screen must
// never show a member who is in fact being looked at.
router.get(
  "/viewers",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.account.businessId) fail(400, "You need a claimed business to do this.");
    const business = await prisma.business.findUnique({ where: { id: req.account.businessId } });
    if (!business) fail(400, "You need a claimed business to do this.");

    // THE RECIPROCITY RULE, and the reason private browsing is defensible at
    // all. A member who has opted out of being named does not get to read the
    // names of the people who looked at them — otherwise the setting is a free
    // switch for one-way surveillance, which is strictly worse than the
    // feature it was added to soften. See Business.privateBrowsing.
    //
    // It OUTRANKS the plan. A Pro member browsing privately is locked out of
    // their own list exactly like a Free one, and that is deliberate: the trade
    // has to be something money cannot settle, or it is not a trade.
    const browsingPrivately = business.privateBrowsing === true;
    const showIdentities = can(business, "profileViewers") && !browsingPrivately;
    const summary = await viewerSummary(business.id);

    res.json({
      ...summary,
      // Always sent, so the client can render the toggle's current state on
      // this screen rather than sending the member to settings to find out
      // why their list is hidden.
      privateBrowsing: browsingPrivately,
      identitiesLocked: !showIdentities,
      ...(showIdentities
        ? { viewers: await listViewers(business.id) }
        : {
            // WHY it is locked, because the two reasons need different copy
            // and only the server knows which applies. "upgrade" is a price;
            // "private_browsing" is a choice the member already made and can
            // undo for free, and showing them a Pro upsell for it would be
            // selling something they already have.
            lockedReason: browsingPrivately ? "private_browsing" : "upgrade",
            // Absent when the reason is their own setting: there is nothing
            // to buy, and a tier here would render a price on a free action.
            ...(browsingPrivately ? {} : { requiredMembershipTier: "pro" }),
          }),
    });
  }),
);

// The toggle itself.
//
// UNGATED BY PLAN, on purpose and permanently. Selling privacy would leave the
// cheapest members the most exposed in a product whose pitch is trust — see
// Business.privateBrowsing. It needs only a claimed business, like every other
// route in this file.
//
// PUT rather than PATCH: the body is the whole state of a single boolean, so
// there is no partial update to express, and a client that sends it twice gets
// the same answer both times.
router.put(
  "/private-browsing",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.account.businessId) fail(400, "You need a claimed business to do this.");

    const { privateBrowsing } = req.body ?? {};
    // Rejected rather than coerced. "false" the string and 0 are both truthy
    // or falsy in ways a caller did not mean, and a privacy setting is the
    // last place to guess what someone intended.
    if (typeof privateBrowsing !== "boolean") {
      fail(400, "privateBrowsing must be true or false.");
    }

    const business = await prisma.business.update({
      where: { id: req.account.businessId },
      data: { privateBrowsing },
      select: { privateBrowsing: true },
    });

    // NOTHING IS REWRITTEN RETROACTIVELY. Existing ProfileView rows keep the
    // mode they were written with until the member visits again — see the
    // `anonymous` column. Turning the setting on does not erase a name the
    // other business may already have read, and pretending otherwise would be
    // promising a privacy this cannot deliver.
    res.json({ privateBrowsing: business.privateBrowsing });
  }),
);

export { router as watchRouter };
