import { Router } from "express";

import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { vouchCapFor, vouchCapWindowStart } from "../lib/vouchCap.js";
import { createActivityEvent } from "../lib/activityEvents.js";
import { applyExpiryIfNeeded } from "../lib/vouchExpiry.js";
import { hasTurn, roleFor, serializeVouch, VOUCH_INCLUDE } from "../lib/vouchTurn.js";
import { can } from "../lib/entitlements.js";

const router = Router();

// The state machine, in one place (lib/vouchTurn.js owns whose move it is):
//
//                 submit/revise (giver)
//   [ pending ] <------------------------ [ reverted ]
//        |  |  ------ revert (receiver) ------^
//        |  |
//        |  +-- accept (receiver) --> [ published ]   terminal
//        |  +-- cancel (receiver) --> [ cancelled ]   terminal, resubmittable
//        |  +-- 14 days idle ------->  [ cancelled ]  (action "expire")
//        |
//        +----- flag (receiver) ----> [ under_review ] admin's move
//
// The receiver has exactly four actions and each does exactly one thing.
// That last part is the change: flag used to be an optional checkbox on
// the cancel (then "decline") request, so reporting bad-faith content and
// ending the vouch were the same button press and neither could be done
// alone.
//
// Matches the mock store's VOUCHABLE_TIERS — a business must be
// SSM-verified (T2+) to give or receive a vouch.
const VOUCHABLE_TIERS = new Set(["T2", "T3", "T4"]);
// "under_review" belongs here: a flagged vouch is unsettled — it has no
// closedAt and can still become published — so it stays in the in-flight
// queue rather than dropping into the settled given/received records.
const IN_FLIGHT = ["pending", "reverted", "under_review"];
// VouchFlag.reason's documented set — previously the client's value went
// into the column unchecked, so a typo'd or invented reason would silently
// land in the admin queue. The receiver's flag can only carry the two
// content reasons; "unfair_cancel" is the giver's, and is set by its own
// route rather than taken from the body.
const RECEIVER_FLAG_REASONS = new Set(["abusive_content", "other"]);

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

// The paywall's throw, and deliberately not just a fail(403). 403 is "you
// may never" — what an unverified tier gets — and this is a door with a
// price on it. The 402 plus `upgradeRequired` is what lets the client open
// an upgrade prompt naming the plan rather than toasting the message; see
// middleware/errorHandler.js, which is the only thing that reads the field.
//
// Every gate below runs AFTER the tier check on the same route. Verification
// beats plan everywhere in this product: an unverified Free member should
// hear "get SSM-verified", which is free and is the actual next step, not
// "pay us" for a door that would still be shut afterwards.
function failUpgrade(plan, message) {
  throw Object.assign(new Error(message), { status: 402, upgradeRequired: plan });
}

async function loadOwnBusiness(req) {
  if (!req.account.businessId) fail(400, "You need a claimed business to do this.");
  const business = await prisma.business.findUnique({ where: { id: req.account.businessId } });
  if (!business) fail(400, "You need a claimed business to do this.");
  return business;
}

// Loads a Vouch by id and applies the lazy 14-day expiry check — the
// single entry point every :id route below uses, so none of them can act
// on a stale pending/reverted row that should already have
// lapsed to cancelled.
async function loadVouch(id, include) {
  const vouch = await prisma.vouch.findUnique({ where: { id }, include });
  if (!vouch) fail(404, "Vouch not found.");
  return applyExpiryIfNeeded(vouch);
}

// Re-reads with the full include so the response carries the timeline the
// action just appended to. Every mutating route ends with this, which is
// what lets the client render the updated card without a second round trip.
async function respondWithVouch(res, vouchId, viewerBusinessId, status = 200) {
  const fresh = await prisma.vouch.findUnique({ where: { id: vouchId }, include: VOUCH_INCLUDE });
  res.status(status).json({ vouch: serializeVouch(fresh, viewerBusinessId) });
}

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { toBusinessId, testimonial } = req.body ?? {};
    const fromBusiness = await loadOwnBusiness(req);

    if (!VOUCHABLE_TIERS.has(fromBusiness.tier)) {
      fail(403, "Your business must be SSM-verified before you can vouch.");
    }

    // Before the cap, not folded into it. Free's cap is 0, so the count
    // below would stop them anyway — but with the wrong words: "you've
    // reached your plan's vouch limit (0 per 30 days)" describes using up an
    // allowance that never existed. This is the only place a Free member is
    // told what giving a vouch actually costs.
    if (!can(fromBusiness, "giveVouch")) {
      failUpgrade(
        "plus",
        "Giving vouches is part of Plus. Upgrade to vouch for the businesses you work with.",
      );
    }

    // Counts submissions, not Vouch rows. Vouch.createdAt never moves when
    // a cancelled row is reused, so counting rows both let a resubmit slip
    // through the cap for free and charged a resurrected old row against
    // its original date. One "submit" action exists per attempt, which is
    // exactly "times this business submitted something".
    const cap = vouchCapFor(fromBusiness.membershipPlan);
    const submittedCount = await prisma.vouchAction.count({
      where: {
        action: "submit",
        createdAt: { gte: vouchCapWindowStart() },
        vouch: { fromBusinessId: fromBusiness.id },
      },
    });
    if (submittedCount >= cap) {
      fail(429, `You've reached your plan's vouch limit (${cap} per 30 days).`);
    }

    if (!toBusinessId || toBusinessId === fromBusiness.id) {
      fail(400, "You can't vouch for your own business.");
    }

    const toBusiness = await prisma.business.findUnique({ where: { id: toBusinessId } });
    if (!toBusiness) fail(404, "Business not found.");
    if (!VOUCHABLE_TIERS.has(toBusiness.tier)) {
      fail(400, "This business isn't SSM-verified yet.");
    }

    // Required: it's the body of the vouch's first VouchRevision, which is
    // NOT NULL. The two client call sites already rejected empty text.
    const comment = testimonial?.trim();
    if (!comment) fail(400, "Add a short testimonial.");

    // A cancelled row is never deleted — it's reset in place by a fresh
    // attempt (see schema.prisma's Vouch comment) rather than requiring a
    // delete-then-recreate dance, which is what keeps the @@unique
    // constraint meaningful ("exactly one row per pair, ever, reused
    // across attempts") instead of permanently blocking a pair that's
    // already been cancelled once.
    //
    // Only "cancelled" reopens: a vouch sitting in under_review is an
    // admin's to resolve, and letting the giver resubmit over it would
    // wipe the very state the admin was asked to look at.
    const existing = await prisma.vouch.findUnique({
      where: { fromBusinessId_toBusinessId: { fromBusinessId: fromBusiness.id, toBusinessId } },
    });
    if (existing && existing.status !== "cancelled") {
      fail(409, "You already have a vouch in progress or published for this business.");
    }

    // Bumping `attempt` is what stops the previous attempt's edit
    // notes from following the new testimonial around — serializeVouch
    // filters every child list on it. The old rows stay in the DB.
    const attempt = existing ? existing.attempt + 1 : 1;

    const vouchId = await prisma.$transaction(async (tx) => {
      const vouch = existing
        ? await tx.vouch.update({
            where: { id: existing.id },
            data: {
              status: "pending",
              attempt,
              revisionCount: 0,
              lastActionAt: new Date(),
              closedAt: null,
            },
          })
        : await tx.vouch.create({
            data: { fromBusinessId: fromBusiness.id, toBusinessId, attempt },
          });

      const revision = await tx.vouchRevision.create({
        data: {
          vouchId: vouch.id,
          attempt,
          revisionNumber: 1,
          comment,
          createdById: fromBusiness.id,
        },
      });
      // The pointer moves; no text is copied.
      await tx.vouch.update({
        where: { id: vouch.id },
        data: { currentRevisionId: revision.id },
      });
      await tx.vouchAction.create({
        data: {
          vouchId: vouch.id,
          attempt,
          action: "submit",
          revisionId: revision.id,
          actorId: fromBusiness.id,
          fromStatus: existing ? existing.status : null,
          toStatus: "pending",
        },
      });
      await createActivityEvent(tx, {
        businessId: toBusinessId,
        actorBusinessId: fromBusiness.id,
        type: "vouch_submitted",
      });

      return vouch.id;
    });

    await respondWithVouch(res, vouchId, fromBusiness.id, existing ? 200 : 201);
  }),
);

// Every in-flight vouch the caller is party to, in EITHER direction. The
// unified workflow queue that replaced GET /pending-review — that endpoint
// was receiver-only, so a giver who owed a revision had no queue at all and
// found out only via the dashboard activity feed, on a different page from
// the button that would let them act. Sorting puts the caller's own turn
// first; `waitingOn` on each row is what the UI gates its buttons on.
router.get(
  "/requests",
  requireAuth,
  asyncHandler(async (req, res) => {
    const business = await loadOwnBusiness(req);
    const vouches = await prisma.vouch.findMany({
      where: {
        status: { in: IN_FLIGHT },
        OR: [{ fromBusinessId: business.id }, { toBusinessId: business.id }],
      },
      include: VOUCH_INCLUDE,
      orderBy: { lastActionAt: "desc" },
    });

    const resolved = await Promise.all(vouches.map((v) => applyExpiryIfNeeded(v)));
    // Expiry may have just flipped some of these to cancelled — don't
    // surface a stale pending/reverted label for them.
    const serialized = resolved
      .filter((v) => IN_FLIGHT.includes(v.status))
      .map((v) => serializeVouch(v, business.id));

    serialized.sort((a, b) => (a.waitingOn === b.waitingOn ? 0 : a.waitingOn === "you" ? -1 : 1));
    res.json({ vouches: serialized });
  }),
);

// The settled record of what the caller has given. In-flight vouches are
// deliberately excluded — they live in GET /requests, and returning them
// here too would render the same vouch in two tabs.
router.get(
  "/given",
  requireAuth,
  asyncHandler(async (req, res) => {
    const business = await loadOwnBusiness(req);
    const vouches = await prisma.vouch.findMany({
      where: { fromBusinessId: business.id, status: { notIn: IN_FLIGHT } },
      include: VOUCH_INCLUDE,
      orderBy: { lastActionAt: "desc" },
    });
    res.json({ vouches: vouches.map((v) => serializeVouch(v, business.id)) });
  }),
);

// The settled record of what the caller has RECEIVED, with full history.
// accountView.js also exposes received vouches, but only as a flat
// published-text shape for the public profile — it carries no timeline, so
// without this the receiving side could never look back at how a finished
// vouch got there. The giver had /given for exactly that; this is its
// mirror.
router.get(
  "/received",
  requireAuth,
  asyncHandler(async (req, res) => {
    const business = await loadOwnBusiness(req);
    const vouches = await prisma.vouch.findMany({
      where: { toBusinessId: business.id, status: { notIn: IN_FLIGHT } },
      include: VOUCH_INCLUDE,
      orderBy: { lastActionAt: "desc" },
    });
    res.json({ vouches: vouches.map((v) => serializeVouch(v, business.id)) });
  }),
);

router.post(
  "/:id/accept",
  requireAuth,
  asyncHandler(async (req, res) => {
    const business = await loadOwnBusiness(req);
    const vouch = await loadVouch(req.params.id);
    if (roleFor(vouch, business.id) !== "receiver") fail(403, "This isn't a vouch you can review.");
    // Was `pending || reverted`, which let a receiver accept the very
    // testimonial they'd just sent back to be rewritten — silently
    // discarding the revision the giver still owed. Turn-gated now.
    if (!hasTurn(vouch, business.id, "receiver")) {
      fail(400, "This vouch isn't awaiting your review.");
    }
    // Last of the three checks, and the order is the point: role, then turn,
    // then price. A member who isn't the receiver, or whose turn it isn't,
    // has nothing to buy here — pitching them an upgrade for an action that
    // would still be unavailable afterwards is how a paywall becomes a lie.
    if (!can(business, "acceptVouch")) {
      failUpgrade(
        "plus",
        "Publishing a vouch is part of Plus. Upgrade to accept this one onto your profile.",
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.vouch.update({
        where: { id: vouch.id },
        data: { status: "published", lastActionAt: new Date(), closedAt: new Date() },
      });
      await tx.vouchAction.create({
        data: {
          vouchId: vouch.id,
          attempt: vouch.attempt,
          action: "accept",
          revisionId: vouch.currentRevisionId,
          actorId: business.id,
          fromStatus: vouch.status,
          toStatus: "published",
        },
      });
      await createActivityEvent(tx, {
        businessId: vouch.fromBusinessId,
        actorBusinessId: business.id,
        type: "vouch_published",
      });
    });

    await respondWithVouch(res, vouch.id, business.id);
  }),
);

// Send it back to the giver to edit. Not terminal, and not a judgement on
// the giver — this is the ordinary "nearly right, fix this line" move, and
// it's the only receiver action that keeps the vouch alive without
// publishing it.
router.post(
  "/:id/revert",
  requireAuth,
  asyncHandler(async (req, res) => {
    const business = await loadOwnBusiness(req);
    const vouch = await loadVouch(req.params.id);
    if (roleFor(vouch, business.id) !== "receiver") fail(403, "This isn't a vouch you can review.");
    if (!hasTurn(vouch, business.id, "receiver")) {
      fail(400, "This vouch isn't awaiting your review.");
    }
    // Same gate as accept, and on purpose the same FEATURE: reverting is a
    // step towards publishing and nothing else, so a member who can't
    // publish has no use for it. Letting Free negotiate wording on a vouch
    // they can never accept would spend the giver's revisions on a dead end.
    if (!can(business, "acceptVouch")) {
      failUpgrade(
        "plus",
        "Reviewing a vouch is part of Plus. Upgrade to send this one back for edits.",
      );
    }
    if (vouch.revisionCount >= vouch.maxRevisions) {
      fail(400, "This vouch has already been revised the maximum number of times — accept or cancel it instead.");
    }

    const comment = req.body?.note?.trim();
    if (!comment) fail(400, "Add a short note explaining what you'd like changed.");
    if (!vouch.currentRevisionId) fail(500, "This vouch has no revision to comment on.");

    await prisma.$transaction(async (tx) => {
      await tx.vouch.update({
        where: { id: vouch.id },
        data: { status: "reverted", lastActionAt: new Date() },
      });
      // revisionId is the point of the whole exercise: this note is
      // pinned to the exact text it was written about, so it stays
      // interpretable after the giver writes a new revision.
      await tx.vouchAction.create({
        data: {
          vouchId: vouch.id,
          attempt: vouch.attempt,
          action: "revert",
          revisionId: vouch.currentRevisionId,
          actorId: business.id,
          comment,
          fromStatus: vouch.status,
          toStatus: "reverted",
        },
      });
      await createActivityEvent(tx, {
        businessId: vouch.fromBusinessId,
        actorBusinessId: business.id,
        type: "vouch_reverted",
      });
    });

    await respondWithVouch(res, vouch.id, business.id);
  }),
);

// Terminal: close the vouch without publishing it. The giver may start a
// fresh attempt for the same pair later (see POST / above) — cancelling
// ends this negotiation, not the relationship.
//
// Carries no flag payload any more. It used to: a `flag` object on the
// body would open an admin report as a side effect of cancelling, which
// meant one button did two unrelated things — end the vouch, and accuse
// the giver — and the receiver couldn't do the second without the first.
// Flagging is POST /:id/flag now.
router.post(
  "/:id/cancel",
  requireAuth,
  asyncHandler(async (req, res) => {
    const business = await loadOwnBusiness(req);
    const vouch = await loadVouch(req.params.id);
    if (roleFor(vouch, business.id) !== "receiver") fail(403, "This isn't a vouch you can review.");
    // Also turn-gated: once the receiver has sent it back it's wholly the
    // giver's move, and a stalled reverted vouch resolves itself through
    // the 14-day expiry rather than through a cancel here.
    if (!hasTurn(vouch, business.id, "receiver")) {
      fail(400, "This vouch isn't awaiting your review.");
    }

    const reason = req.body?.reason?.trim() || null;

    await prisma.$transaction(async (tx) => {
      await tx.vouch.update({
        where: { id: vouch.id },
        data: { status: "cancelled", lastActionAt: new Date(), closedAt: new Date() },
      });
      await tx.vouchAction.create({
        data: {
          vouchId: vouch.id,
          attempt: vouch.attempt,
          action: "cancel",
          revisionId: vouch.currentRevisionId,
          actorId: business.id,
          // The receiver's own words on this decision, stored with the
          // decision rather than anywhere it could be edited later.
          comment: reason,
          fromStatus: vouch.status,
          toStatus: "cancelled",
        },
      });
      await createActivityEvent(tx, {
        businessId: vouch.fromBusinessId,
        actorBusinessId: business.id,
        type: "vouch_cancelled",
      });
    });

    await respondWithVouch(res, vouch.id, business.id);
  }),
);

// Hand the vouch to an admin. Unlike the other three this decides nothing
// — it SUSPENDS the negotiation: the vouch moves to under_review, which
// belongs to neither business (see TURN_BY_STATUS in lib/vouchTurn.js), so
// no one can accept, revert, cancel, revise or resubmit it, and the 14-day
// expiry clock stops. What an admin can then do with it is not built yet;
// routes/admin.js serves the queue and the audit trail to read.
//
// Deliberately allowed from "reverted" as well as "pending", i.e. it's the
// one receiver action that isn't turn-gated. Abusive text doesn't stop
// being abusive because the receiver already asked for an edit, and the
// alternative is telling them to wait 14 days for the expiry before they
// can report it.
router.post(
  "/:id/flag",
  requireAuth,
  asyncHandler(async (req, res) => {
    const business = await loadOwnBusiness(req);
    const vouch = await loadVouch(req.params.id);
    if (roleFor(vouch, business.id) !== "receiver") fail(403, "This isn't a vouch you can review.");
    if (vouch.status !== "pending" && vouch.status !== "reverted") {
      fail(400, "Only a vouch that's still in progress can be flagged for review.");
    }

    const reason = req.body?.reason;
    if (!RECEIVER_FLAG_REASONS.has(reason)) fail(400, "Unknown flag reason.");
    const note = req.body?.note?.trim() || null;

    // One ruling per version. Without this a receiver could re-flag the
    // instant an admin handed the vouch back and freeze it again, forever —
    // the admin's decision would be advisory and the receiver would hold a
    // veto the four actions deliberately don't give them. Scoped to the
    // revision, so if the giver writes new text it's flaggable again on its
    // own merits. Mirrors the dedupe in flag-unfair-cancel below.
    const alreadyRuledOn = await prisma.vouchFlag.findFirst({
      where: {
        vouchId: vouch.id,
        raisedByBusinessId: business.id,
        revisionId: vouch.currentRevisionId,
        status: "reviewed",
      },
    });
    if (alreadyRuledOn) {
      fail(409, "An admin has already reviewed a report on this version of the testimonial.");
    }

    await prisma.$transaction(async (tx) => {
      // No closedAt — under_review is unsettled, not finished.
      await tx.vouch.update({
        where: { id: vouch.id },
        data: { status: "under_review", lastActionAt: new Date() },
      });
      await tx.vouchFlag.create({
        data: {
          vouchId: vouch.id,
          raisedByBusinessId: business.id,
          againstBusinessId: vouch.fromBusinessId,
          reason,
          note,
          revisionId: vouch.currentRevisionId,
        },
      });
      await tx.vouchAction.create({
        data: {
          vouchId: vouch.id,
          attempt: vouch.attempt,
          action: "flag",
          revisionId: vouch.currentRevisionId,
          actorId: business.id,
          // The flag's own note stays on the VouchFlag, admin-side. What
          // lands on the timeline is only that a flag was raised — both
          // parties can see the vouch went to review without the giver
          // reading the report filed against them.
          fromStatus: vouch.status,
          toStatus: "under_review",
        },
      });
      await createActivityEvent(tx, {
        businessId: vouch.fromBusinessId,
        actorBusinessId: business.id,
        type: "vouch_flagged",
      });
    });

    await respondWithVouch(res, vouch.id, business.id);
  }),
);

router.post(
  "/:id/revise",
  requireAuth,
  asyncHandler(async (req, res) => {
    const business = await loadOwnBusiness(req);
    const vouch = await loadVouch(req.params.id);
    if (roleFor(vouch, business.id) !== "giver") fail(403, "This isn't a vouch you can revise.");
    if (!hasTurn(vouch, business.id, "giver")) fail(400, "This vouch isn't awaiting a revision.");

    const comment = req.body?.testimonial?.trim();
    if (!comment) fail(400, "Add an updated testimonial.");

    // revisionNumber is 1-based, so the Nth revise produces revision N+1.
    const nextNumber = vouch.revisionCount + 2;

    await prisma.$transaction(async (tx) => {
      // A new row — the previous revision is left exactly as it was. This
      // is the difference between a trail and an overwrite.
      const revision = await tx.vouchRevision.create({
        data: {
          vouchId: vouch.id,
          attempt: vouch.attempt,
          revisionNumber: nextNumber,
          comment,
          createdById: business.id,
        },
      });
      await tx.vouch.update({
        where: { id: vouch.id },
        data: {
          currentRevisionId: revision.id,
          status: "pending",
          revisionCount: vouch.revisionCount + 1,
          lastActionAt: new Date(),
        },
      });
      await tx.vouchAction.create({
        data: {
          vouchId: vouch.id,
          attempt: vouch.attempt,
          action: "revise",
          revisionId: revision.id,
          actorId: business.id,
          fromStatus: vouch.status,
          toStatus: "pending",
        },
      });
      await createActivityEvent(tx, {
        businessId: vouch.toBusinessId,
        actorBusinessId: business.id,
        type: "vouch_revised",
      });
    });

    await respondWithVouch(res, vouch.id, business.id);
  }),
);

// The giver's counterpart to the receiver's flag, and deliberately NOT
// symmetric with it: this one is tracking-only. The vouch is already
// cancelled and terminal, so there's no live negotiation to suspend —
// raising it puts the pair in front of an admin without pretending the
// vouch can come back.
router.post(
  "/:id/flag-unfair-cancel",
  requireAuth,
  asyncHandler(async (req, res) => {
    const business = await loadOwnBusiness(req);
    const vouch = await loadVouch(req.params.id);
    if (roleFor(vouch, business.id) !== "giver") fail(403, "This isn't a vouch you can flag.");
    if (vouch.status !== "cancelled") fail(400, "Only a cancelled vouch can be flagged this way.");

    // No sequencing concern here — cancelled rows are never deleted (see
    // the reuse-on-resubmit logic in POST /), so this can be called any
    // time after a cancel, not just in a narrow window right after it.
    // It does mean the same giver could otherwise file unlimited flags on
    // one cancel and flood the admin queue, hence the dedupe. Scoped to
    // the current revision, so a later cancel of a resubmitted vouch is
    // separately flaggable.
    const duplicate = await prisma.vouchFlag.findFirst({
      where: {
        vouchId: vouch.id,
        raisedByBusinessId: business.id,
        reason: "unfair_cancel",
        status: "open",
        revisionId: vouch.currentRevisionId,
      },
    });
    if (duplicate) fail(409, "You've already flagged this cancellation — an admin is reviewing it.");

    const flag = await prisma.$transaction(async (tx) => {
      const created = await tx.vouchFlag.create({
        data: {
          vouchId: vouch.id,
          raisedByBusinessId: business.id,
          againstBusinessId: vouch.toBusinessId,
          reason: "unfair_cancel",
          note: req.body?.note?.trim() || null,
          revisionId: vouch.currentRevisionId,
        },
      });
      await tx.vouchAction.create({
        data: {
          vouchId: vouch.id,
          attempt: vouch.attempt,
          action: "flag",
          revisionId: vouch.currentRevisionId,
          actorId: business.id,
          fromStatus: vouch.status,
          toStatus: vouch.status,
        },
      });
      return created;
    });

    res.status(201).json({ flag });
  }),
);

export { router as vouchRouter };
