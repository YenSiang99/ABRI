import { effectiveMembershipTier } from "../lib/membershipExpiry.js";
import { Router } from "express";

import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { endorsementCapFor, endorsementCapWindowStart } from "../lib/endorsementCap.js";
import { createActivityEvent } from "../lib/activityEvents.js";
import { createNetworkEvent } from "../lib/networkEvents.js";
import { applyExpiryIfNeeded } from "../lib/endorsementExpiry.js";
import { hasTurn, roleFor, serializeEndorsement, ENDORSEMENT_INCLUDE } from "../lib/endorsementTurn.js";
import { can } from "../lib/entitlements.js";
import { ENDORSABLE_VERIFICATION_LEVELS } from "../lib/verificationLevels.js";

const router = Router();

// The state machine, in one place (lib/endorsementTurn.js owns whose move it is):
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
// ending the endorsement were the same button press and neither could be done
// alone.
//
// Matches the mock store's ENDORSABLE_VERIFICATION_LEVELS — a business must be
// SSM-verified (T2+) to give or receive an endorsement.

// "under_review" belongs here: a flagged endorsement is unsettled — it has no
// closedAt and can still become published — so it stays in the in-flight
// queue rather than dropping into the settled given/received records.
const IN_FLIGHT = ["pending", "reverted", "under_review"];
// EndorsementFlag.reason's documented set — previously the client's value went
// into the column unchecked, so a typo'd or invented reason would silently
// land in the admin queue. The receiver's flag can only carry the two
// content reasons; "unfair_cancel" is the giver's, and is set by its own
// route rather than taken from the body.
const RECEIVER_FLAG_REASONS = new Set(["abusive_content", "other"]);

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

// The paywall's throw, and deliberately not just a fail(403). 403 is "you
// may never" — what an unverified LEVEL gets — and this is a door with a
// price on it. The 402 plus `requiredMembershipTier` is what lets the client open
// an upgrade prompt naming the plan rather than toasting the message; see
// middleware/errorHandler.js, which is the only thing that reads the field.
//
// Every gate below runs AFTER the level check on the same route. Verification
// beats plan everywhere in this product: an unverified Free member should
// hear "get SSM-verified", which is free and is the actual next step, not
// "pay us" for a door that would still be shut afterwards.
function failUpgrade(plan, message) {
  throw Object.assign(new Error(message), { status: 402, requiredMembershipTier: plan });
}

async function loadOwnBusiness(req) {
  if (!req.account.businessId) fail(400, "You need a claimed business to do this.");
  const business = await prisma.business.findUnique({ where: { id: req.account.businessId } });
  if (!business) fail(400, "You need a claimed business to do this.");
  return business;
}

// Loads a Endorsement by id and applies the lazy 14-day expiry check — the
// single entry point every :id route below uses, so none of them can act
// on a stale pending/reverted row that should already have
// lapsed to cancelled.
async function loadEndorsement(id, include) {
  const endorsement = await prisma.endorsement.findUnique({ where: { id }, include });
  if (!endorsement) fail(404, "Endorsement not found.");
  return applyExpiryIfNeeded(endorsement);
}

// Re-reads with the full include so the response carries the timeline the
// action just appended to. Every mutating route ends with this, which is
// what lets the client render the updated card without a second round trip.
async function respondWithEndorsement(res, endorsementId, viewerBusinessId, status = 200) {
  const fresh = await prisma.endorsement.findUnique({ where: { id: endorsementId }, include: ENDORSEMENT_INCLUDE });
  res.status(status).json({ endorsement: serializeEndorsement(fresh, viewerBusinessId) });
}

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { toBusinessId, testimonial } = req.body ?? {};
    const fromBusiness = await loadOwnBusiness(req);

    if (!ENDORSABLE_VERIFICATION_LEVELS.has(fromBusiness.verificationLevel)) {
      fail(403, "Your business must be SSM-verified before you can endorse.");
    }

    // Before the cap, not folded into it. Free's cap is 0, so the count
    // below would stop them anyway — but with the wrong words: "you've
    // reached your plan's endorsement limit (0 per 30 days)" describes using up an
    // allowance that never existed. This is the only place a Free member is
    // told what giving an endorsement actually costs.
    if (!can(fromBusiness, "giveEndorsement")) {
      failUpgrade(
        "plus",
        "Giving endorsements is part of Plus. Upgrade to endorse the businesses you work with.",
      );
    }

    // Counts submissions, not Endorsement rows. Endorsement.createdAt never moves when
    // a cancelled row is reused, so counting rows both let a resubmit slip
    // through the cap for free and charged a resurrected old row against
    // its original date. One "submit" action exists per attempt, which is
    // exactly "times this business submitted something".
    const cap = endorsementCapFor(effectiveMembershipTier(fromBusiness));
    const submittedCount = await prisma.endorsementAction.count({
      where: {
        action: "submit",
        createdAt: { gte: endorsementCapWindowStart() },
        endorsement: { fromBusinessId: fromBusiness.id },
      },
    });
    if (submittedCount >= cap) {
      fail(429, `You've reached your plan's endorsement limit (${cap} per 30 days).`);
    }

    if (!toBusinessId || toBusinessId === fromBusiness.id) {
      fail(400, "You can't endorse your own business.");
    }

    const toBusiness = await prisma.business.findUnique({ where: { id: toBusinessId } });
    if (!toBusiness) fail(404, "Business not found.");
    if (!ENDORSABLE_VERIFICATION_LEVELS.has(toBusiness.verificationLevel)) {
      fail(400, "This business isn't SSM-verified yet.");
    }

    // Required: it's the body of the endorsement's first EndorsementRevision, which is
    // NOT NULL. The two client call sites already rejected empty text.
    const comment = testimonial?.trim();
    if (!comment) fail(400, "Add a short testimonial.");

    // A cancelled row is never deleted — it's reset in place by a fresh
    // attempt (see schema.prisma's Endorsement comment) rather than requiring a
    // delete-then-recreate dance, which is what keeps the @@unique
    // constraint meaningful ("exactly one row per pair, ever, reused
    // across attempts") instead of permanently blocking a pair that's
    // already been cancelled once.
    //
    // Only "cancelled" reopens: an endorsement sitting in under_review is an
    // admin's to resolve, and letting the giver resubmit over it would
    // wipe the very state the admin was asked to look at.
    const existing = await prisma.endorsement.findUnique({
      where: { fromBusinessId_toBusinessId: { fromBusinessId: fromBusiness.id, toBusinessId } },
    });
    if (existing && existing.status !== "cancelled") {
      fail(409, "You already have an endorsement in progress or published for this business.");
    }

    // Bumping `attempt` is what stops the previous attempt's edit
    // notes from following the new testimonial around — serializeEndorsement
    // filters every child list on it. The old rows stay in the DB.
    const attempt = existing ? existing.attempt + 1 : 1;

    const endorsementId = await prisma.$transaction(async (tx) => {
      const endorsement = existing
        ? await tx.endorsement.update({
            where: { id: existing.id },
            data: {
              status: "pending",
              attempt,
              revisionCount: 0,
              lastActionAt: new Date(),
              closedAt: null,
            },
          })
        : await tx.endorsement.create({
            data: { fromBusinessId: fromBusiness.id, toBusinessId, attempt },
          });

      const revision = await tx.endorsementRevision.create({
        data: {
          endorsementId: endorsement.id,
          attempt,
          revisionNumber: 1,
          comment,
          createdById: fromBusiness.id,
        },
      });
      // The pointer moves; no text is copied.
      await tx.endorsement.update({
        where: { id: endorsement.id },
        data: { currentRevisionId: revision.id },
      });
      await tx.endorsementAction.create({
        data: {
          endorsementId: endorsement.id,
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
        type: "endorsement_submitted",
      });

      return endorsement.id;
    });

    await respondWithEndorsement(res, endorsementId, fromBusiness.id, existing ? 200 : 201);
  }),
);

// Every in-flight endorsement the caller is party to, in EITHER direction. The
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
    const endorsements = await prisma.endorsement.findMany({
      where: {
        status: { in: IN_FLIGHT },
        OR: [{ fromBusinessId: business.id }, { toBusinessId: business.id }],
      },
      include: ENDORSEMENT_INCLUDE,
      orderBy: { lastActionAt: "desc" },
    });

    const resolved = await Promise.all(endorsements.map((v) => applyExpiryIfNeeded(v)));
    // Expiry may have just flipped some of these to cancelled — don't
    // surface a stale pending/reverted label for them.
    const serialized = resolved
      .filter((v) => IN_FLIGHT.includes(v.status))
      .map((v) => serializeEndorsement(v, business.id));

    serialized.sort((a, b) => (a.waitingOn === b.waitingOn ? 0 : a.waitingOn === "you" ? -1 : 1));
    res.json({ endorsements: serialized });
  }),
);

// The settled record of what the caller has given. In-flight endorsements are
// deliberately excluded — they live in GET /requests, and returning them
// here too would render the same endorsement in two tabs.
router.get(
  "/given",
  requireAuth,
  asyncHandler(async (req, res) => {
    const business = await loadOwnBusiness(req);
    const endorsements = await prisma.endorsement.findMany({
      where: { fromBusinessId: business.id, status: { notIn: IN_FLIGHT } },
      include: ENDORSEMENT_INCLUDE,
      orderBy: { lastActionAt: "desc" },
    });
    res.json({ endorsements: endorsements.map((v) => serializeEndorsement(v, business.id)) });
  }),
);

// The settled record of what the caller has RECEIVED, with full history.
// accountView.js also exposes received endorsements, but only as a flat
// published-text shape for the public profile — it carries no timeline, so
// without this the receiving side could never look back at how a finished
// endorsement got there. The giver had /given for exactly that; this is its
// mirror.
router.get(
  "/received",
  requireAuth,
  asyncHandler(async (req, res) => {
    const business = await loadOwnBusiness(req);
    const endorsements = await prisma.endorsement.findMany({
      where: { toBusinessId: business.id, status: { notIn: IN_FLIGHT } },
      include: ENDORSEMENT_INCLUDE,
      orderBy: { lastActionAt: "desc" },
    });
    res.json({ endorsements: endorsements.map((v) => serializeEndorsement(v, business.id)) });
  }),
);

router.post(
  "/:id/accept",
  requireAuth,
  asyncHandler(async (req, res) => {
    const business = await loadOwnBusiness(req);
    const endorsement = await loadEndorsement(req.params.id);
    if (roleFor(endorsement, business.id) !== "receiver") fail(403, "This isn't an endorsement you can review.");
    // Was `pending || reverted`, which let a receiver accept the very
    // testimonial they'd just sent back to be rewritten — silently
    // discarding the revision the giver still owed. Turn-gated now.
    if (!hasTurn(endorsement, business.id, "receiver")) {
      fail(400, "This endorsement isn't awaiting your review.");
    }
    // Last of the three checks, and the order is the point: role, then turn,
    // then price. A member who isn't the receiver, or whose turn it isn't,
    // has nothing to buy here — pitching them an upgrade for an action that
    // would still be unavailable afterwards is how a paywall becomes a lie.
    if (!can(business, "acceptEndorsement")) {
      failUpgrade(
        "plus",
        "Publishing an endorsement is part of Plus. Upgrade to accept this one onto your profile.",
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.endorsement.update({
        where: { id: endorsement.id },
        data: { status: "published", lastActionAt: new Date(), closedAt: new Date() },
      });
      await tx.endorsementAction.create({
        data: {
          endorsementId: endorsement.id,
          attempt: endorsement.attempt,
          action: "accept",
          revisionId: endorsement.currentRevisionId,
          actorId: business.id,
          fromStatus: endorsement.status,
          toStatus: "published",
        },
      });
      await createActivityEvent(tx, {
        businessId: endorsement.fromBusinessId,
        actorBusinessId: business.id,
        type: "endorsement_published",
      });
      // The same event, told to the network rather than to the giver. Inside
      // the same transaction as the status change on purpose: a testimonial
      // that is live on a profile but absent from the feed, or the reverse,
      // is the one inconsistency anyone would notice.
      //
      // The feed carries no copy of the text — it points at this endorsement and
      // reads currentRevision through it, so a later revision needs no second
      // write here and a flag retracts it with none either.
      await createNetworkEvent(tx, {
        type: "endorsement_published",
        subjectBusinessId: endorsement.toBusinessId,
        actorBusinessId: endorsement.fromBusinessId,
        endorsementId: endorsement.id,
      });
    });

    await respondWithEndorsement(res, endorsement.id, business.id);
  }),
);

// Send it back to the giver to edit. Not terminal, and not a judgement on
// the giver — this is the ordinary "nearly right, fix this line" move, and
// it's the only receiver action that keeps the endorsement alive without
// publishing it.
router.post(
  "/:id/revert",
  requireAuth,
  asyncHandler(async (req, res) => {
    const business = await loadOwnBusiness(req);
    const endorsement = await loadEndorsement(req.params.id);
    if (roleFor(endorsement, business.id) !== "receiver") fail(403, "This isn't an endorsement you can review.");
    if (!hasTurn(endorsement, business.id, "receiver")) {
      fail(400, "This endorsement isn't awaiting your review.");
    }
    // Same gate as accept, and on purpose the same FEATURE: reverting is a
    // step towards publishing and nothing else, so a member who can't
    // publish has no use for it. Letting Free negotiate wording on an endorsement
    // they can never accept would spend the giver's revisions on a dead end.
    if (!can(business, "acceptEndorsement")) {
      failUpgrade(
        "plus",
        "Reviewing an endorsement is part of Plus. Upgrade to send this one back for edits.",
      );
    }
    if (endorsement.revisionCount >= endorsement.maxRevisions) {
      fail(400, "This endorsement has already been revised the maximum number of times — accept or cancel it instead.");
    }

    const comment = req.body?.note?.trim();
    if (!comment) fail(400, "Add a short note explaining what you'd like changed.");
    if (!endorsement.currentRevisionId) fail(500, "This endorsement has no revision to comment on.");

    await prisma.$transaction(async (tx) => {
      await tx.endorsement.update({
        where: { id: endorsement.id },
        data: { status: "reverted", lastActionAt: new Date() },
      });
      // revisionId is the point of the whole exercise: this note is
      // pinned to the exact text it was written about, so it stays
      // interpretable after the giver writes a new revision.
      await tx.endorsementAction.create({
        data: {
          endorsementId: endorsement.id,
          attempt: endorsement.attempt,
          action: "revert",
          revisionId: endorsement.currentRevisionId,
          actorId: business.id,
          comment,
          fromStatus: endorsement.status,
          toStatus: "reverted",
        },
      });
      await createActivityEvent(tx, {
        businessId: endorsement.fromBusinessId,
        actorBusinessId: business.id,
        type: "endorsement_reverted",
      });
    });

    await respondWithEndorsement(res, endorsement.id, business.id);
  }),
);

// Terminal: close the endorsement without publishing it. The giver may start a
// fresh attempt for the same pair later (see POST / above) — cancelling
// ends this negotiation, not the relationship.
//
// Carries no flag payload any more. It used to: a `flag` object on the
// body would open an admin report as a side effect of cancelling, which
// meant one button did two unrelated things — end the endorsement, and accuse
// the giver — and the receiver couldn't do the second without the first.
// Flagging is POST /:id/flag now.
router.post(
  "/:id/cancel",
  requireAuth,
  asyncHandler(async (req, res) => {
    const business = await loadOwnBusiness(req);
    const endorsement = await loadEndorsement(req.params.id);
    if (roleFor(endorsement, business.id) !== "receiver") fail(403, "This isn't an endorsement you can review.");
    // Also turn-gated: once the receiver has sent it back it's wholly the
    // giver's move, and a stalled reverted endorsement resolves itself through
    // the 14-day expiry rather than through a cancel here.
    if (!hasTurn(endorsement, business.id, "receiver")) {
      fail(400, "This endorsement isn't awaiting your review.");
    }

    const reason = req.body?.reason?.trim() || null;

    await prisma.$transaction(async (tx) => {
      await tx.endorsement.update({
        where: { id: endorsement.id },
        data: { status: "cancelled", lastActionAt: new Date(), closedAt: new Date() },
      });
      await tx.endorsementAction.create({
        data: {
          endorsementId: endorsement.id,
          attempt: endorsement.attempt,
          action: "cancel",
          revisionId: endorsement.currentRevisionId,
          actorId: business.id,
          // The receiver's own words on this decision, stored with the
          // decision rather than anywhere it could be edited later.
          comment: reason,
          fromStatus: endorsement.status,
          toStatus: "cancelled",
        },
      });
      await createActivityEvent(tx, {
        businessId: endorsement.fromBusinessId,
        actorBusinessId: business.id,
        type: "endorsement_cancelled",
      });
    });

    await respondWithEndorsement(res, endorsement.id, business.id);
  }),
);

// Hand the endorsement to an admin. Unlike the other three this decides nothing
// — it SUSPENDS the negotiation: the endorsement moves to under_review, which
// belongs to neither business (see TURN_BY_STATUS in lib/endorsementTurn.js), so
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
    const endorsement = await loadEndorsement(req.params.id);
    if (roleFor(endorsement, business.id) !== "receiver") fail(403, "This isn't an endorsement you can review.");
    if (endorsement.status !== "pending" && endorsement.status !== "reverted") {
      fail(400, "Only an endorsement that's still in progress can be flagged for review.");
    }

    const reason = req.body?.reason;
    if (!RECEIVER_FLAG_REASONS.has(reason)) fail(400, "Unknown flag reason.");
    const note = req.body?.note?.trim() || null;

    // One ruling per version. Without this a receiver could re-flag the
    // instant an admin handed the endorsement back and freeze it again, forever —
    // the admin's decision would be advisory and the receiver would hold a
    // veto the four actions deliberately don't give them. Scoped to the
    // revision, so if the giver writes new text it's flaggable again on its
    // own merits. Mirrors the dedupe in flag-unfair-cancel below.
    const alreadyRuledOn = await prisma.endorsementFlag.findFirst({
      where: {
        endorsementId: endorsement.id,
        raisedByBusinessId: business.id,
        revisionId: endorsement.currentRevisionId,
        status: "reviewed",
      },
    });
    if (alreadyRuledOn) {
      fail(409, "An admin has already reviewed a report on this version of the testimonial.");
    }

    await prisma.$transaction(async (tx) => {
      // No closedAt — under_review is unsettled, not finished.
      await tx.endorsement.update({
        where: { id: endorsement.id },
        data: { status: "under_review", lastActionAt: new Date() },
      });
      await tx.endorsementFlag.create({
        data: {
          endorsementId: endorsement.id,
          raisedByBusinessId: business.id,
          againstBusinessId: endorsement.fromBusinessId,
          reason,
          note,
          revisionId: endorsement.currentRevisionId,
        },
      });
      await tx.endorsementAction.create({
        data: {
          endorsementId: endorsement.id,
          attempt: endorsement.attempt,
          action: "flag",
          revisionId: endorsement.currentRevisionId,
          actorId: business.id,
          // The flag's own note stays on the EndorsementFlag, admin-side. What
          // lands on the timeline is only that a flag was raised — both
          // parties can see the endorsement went to review without the giver
          // reading the report filed against them.
          fromStatus: endorsement.status,
          toStatus: "under_review",
        },
      });
      await createActivityEvent(tx, {
        businessId: endorsement.fromBusinessId,
        actorBusinessId: business.id,
        type: "endorsement_flagged",
      });
    });

    await respondWithEndorsement(res, endorsement.id, business.id);
  }),
);

router.post(
  "/:id/revise",
  requireAuth,
  asyncHandler(async (req, res) => {
    const business = await loadOwnBusiness(req);
    const endorsement = await loadEndorsement(req.params.id);
    if (roleFor(endorsement, business.id) !== "giver") fail(403, "This isn't an endorsement you can revise.");
    if (!hasTurn(endorsement, business.id, "giver")) fail(400, "This endorsement isn't awaiting a revision.");

    const comment = req.body?.testimonial?.trim();
    if (!comment) fail(400, "Add an updated testimonial.");

    // revisionNumber is 1-based, so the Nth revise produces revision N+1.
    const nextNumber = endorsement.revisionCount + 2;

    await prisma.$transaction(async (tx) => {
      // A new row — the previous revision is left exactly as it was. This
      // is the difference between a trail and an overwrite.
      const revision = await tx.endorsementRevision.create({
        data: {
          endorsementId: endorsement.id,
          attempt: endorsement.attempt,
          revisionNumber: nextNumber,
          comment,
          createdById: business.id,
        },
      });
      await tx.endorsement.update({
        where: { id: endorsement.id },
        data: {
          currentRevisionId: revision.id,
          status: "pending",
          revisionCount: endorsement.revisionCount + 1,
          lastActionAt: new Date(),
        },
      });
      await tx.endorsementAction.create({
        data: {
          endorsementId: endorsement.id,
          attempt: endorsement.attempt,
          action: "revise",
          revisionId: revision.id,
          actorId: business.id,
          fromStatus: endorsement.status,
          toStatus: "pending",
        },
      });
      await createActivityEvent(tx, {
        businessId: endorsement.toBusinessId,
        actorBusinessId: business.id,
        type: "endorsement_revised",
      });
    });

    await respondWithEndorsement(res, endorsement.id, business.id);
  }),
);

// The giver's counterpart to the receiver's flag, and deliberately NOT
// symmetric with it: this one is tracking-only. The endorsement is already
// cancelled and terminal, so there's no live negotiation to suspend —
// raising it puts the pair in front of an admin without pretending the
// endorsement can come back.
router.post(
  "/:id/flag-unfair-cancel",
  requireAuth,
  asyncHandler(async (req, res) => {
    const business = await loadOwnBusiness(req);
    const endorsement = await loadEndorsement(req.params.id);
    if (roleFor(endorsement, business.id) !== "giver") fail(403, "This isn't an endorsement you can flag.");
    if (endorsement.status !== "cancelled") fail(400, "Only a cancelled endorsement can be flagged this way.");

    // No sequencing concern here — cancelled rows are never deleted (see
    // the reuse-on-resubmit logic in POST /), so this can be called any
    // time after a cancel, not just in a narrow window right after it.
    // It does mean the same giver could otherwise file unlimited flags on
    // one cancel and flood the admin queue, hence the dedupe. Scoped to
    // the current revision, so a later cancel of a resubmitted endorsement is
    // separately flaggable.
    const duplicate = await prisma.endorsementFlag.findFirst({
      where: {
        endorsementId: endorsement.id,
        raisedByBusinessId: business.id,
        reason: "unfair_cancel",
        status: "open",
        revisionId: endorsement.currentRevisionId,
      },
    });
    if (duplicate) fail(409, "You've already flagged this cancellation — an admin is reviewing it.");

    const flag = await prisma.$transaction(async (tx) => {
      const created = await tx.endorsementFlag.create({
        data: {
          endorsementId: endorsement.id,
          raisedByBusinessId: business.id,
          againstBusinessId: endorsement.toBusinessId,
          reason: "unfair_cancel",
          note: req.body?.note?.trim() || null,
          revisionId: endorsement.currentRevisionId,
        },
      });
      await tx.endorsementAction.create({
        data: {
          endorsementId: endorsement.id,
          attempt: endorsement.attempt,
          action: "flag",
          revisionId: endorsement.currentRevisionId,
          actorId: business.id,
          fromStatus: endorsement.status,
          toStatus: endorsement.status,
        },
      });
      return created;
    });

    res.status(201).json({ flag });
  }),
);

export { router as endorsementRouter };
