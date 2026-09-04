import { Router } from "express";

import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import {
  approveClaimAndRejectRivals,
  revokeApprovedClaim,
} from "../lib/businessClaim.js";
import { serializeAccount } from "../lib/serialize.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sendVerificationEmail } from "../lib/mailer.js";
import { serializeVouch, VOUCH_INCLUDE, BUSINESS_SELECT } from "../lib/vouchTurn.js";
import { createActivityEvent } from "../lib/activityEvents.js";
import { MEMBERSHIP_TIER_RANK } from "../lib/entitlements.js";
import { CLAIMED, SSM_VERIFIED } from "../lib/verificationLevels.js";

const router = Router();

// A manually-reviewed claim can sit for days before an admin gets to it, so
// the confirmation link minted at approval time needs a much longer window
// than the domain-match link (15 min — see routes/businesses.js), which is
// expected to be clicked in one sitting.
const MANUAL_APPROVAL_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

router.use(requireAuth, requireAdmin);

// Lists every account that's ever made a claim — pending AND approved, not
// just pending — grouped by businessId order so competing/related claims on
// the same listing sit next to each other for the reviewer to compare. The
// approved ones aren't "to review" exactly, but the frontend needs them to
// know who the claimant is once a business moves into the SSM-verification
// or verified stage (there's no other endpoint that maps an approved
// business back to its claimant).
router.get(
  "/claims",
  asyncHandler(async (req, res) => {
    const claims = await prisma.account.findMany({
      where: { claimStatus: { not: null } },
      include: { business: true },
      orderBy: [{ businessId: "asc" }, { createdAt: "asc" }],
    });
    res.json({ claims: claims.map(({ passwordHash, ...c }) => c) });
  }),
);

// Approves this account's claim and rejects (deletes) every other pending
// claim on the same business — see approveClaimAndRejectRivals. Mints a
// confirmation token, emails the claimant a link to verify their email and
// log in, and also returns the token directly (handy for local dev when
// RESEND_API_KEY isn't set — see lib/mailer.js).
router.post(
  "/claims/:accountId/approve",
  asyncHandler(async (req, res) => {
    const pending = await prisma.account.findUnique({
      where: { id: req.params.accountId },
    });
    if (!pending || pending.claimStatus !== "pending") {
      return res
        .status(404)
        .json({ error: "No pending claim found for this account." });
    }

    const { account, business } = await approveClaimAndRejectRivals({
      accountId: pending.id,
      businessId: pending.businessId,
      verificationMethod: "manual",
    });

    const tokenRecord = await prisma.emailVerificationToken.create({
      data: {
        email: account.email,
        accountId: account.id,
        expiresAt: new Date(Date.now() + MANUAL_APPROVAL_TOKEN_TTL_MS),
      },
    });

    await sendVerificationEmail({
      to: account.email,
      subject: `Your claim on ${business.name} has been approved`,
      heading: "Your claim was approved",
      message: `An ABRI admin has approved your claim on ${business.name}. Click below to verify your email and log in.`,
      link: `${process.env.FRONTEND_URL}/verify-claim/${tokenRecord.token}`,
    });

    res.json({
      account: serializeAccount(account),
      business,
      token: tokenRecord.token,
    });
  }),
);

// Rejects a single pending claim — deletes that account only. Any other
// pending claims on the same business (or the business itself) are
// untouched.
router.post(
  "/claims/:accountId/reject",
  asyncHandler(async (req, res) => {
    const pending = await prisma.account.findUnique({
      where: { id: req.params.accountId },
    });
    if (!pending || pending.claimStatus !== "pending") {
      return res
        .status(404)
        .json({ error: "No pending claim found for this account." });
    }

    await prisma.account.delete({ where: { id: pending.id } });
    res.json({ ok: true });
  }),
);

// Undoes an already-approved claim — deletes the account entirely and
// drops the business back to T0. For an admin fixing a fat-fingered
// approval, not a "downgrade one level" operation (contrast with
// /businesses/:id/revoke-ssm below) — the whole claim is being unwound,
// so T0 is the only place left to land.
router.post(
  "/claims/:accountId/revoke",
  asyncHandler(async (req, res) => {
    const account = await prisma.account.findUnique({
      where: { id: req.params.accountId },
    });
    if (!account || account.claimStatus !== "approved") {
      return res
        .status(404)
        .json({ error: "No approved claim found for this account." });
    }

    const { business } = await revokeApprovedClaim({
      accountId: account.id,
      businessId: account.businessId,
    });

    res.json({ ok: true, business });
  }),
);

// SSM
router.post(
  "/businesses/:id/verify-ssm",
  asyncHandler(async (req, res) => {
    const business = await prisma.business.findUnique({
      where: { id: req.params.id },
    });
    if (!business || business.verificationLevel !== CLAIMED) {
      return res
        .status(400)
        .json({
          error: "Business must be claimed (T1) before SSM verification.",
        });
    }
    const updated = await prisma.business.update({
      where: { id: business.id },
      data: { verificationLevel: SSM_VERIFIED },
    });
    res.json({ business: updated });
  }),
);

router.post(
  "/businesses/:id/revoke-ssm",
  asyncHandler(async (req, res) => {
    const business = await prisma.business.findUnique({
      where: { id: req.params.id },
    });
    if (!business || business.verificationLevel !== SSM_VERIFIED) {
      return res
        .status(400)
        .json({ error: "Business isn't currently SSM-verified." });
    }
    const updated = await prisma.business.update({
      where: { id: business.id },
      data: { verificationLevel: CLAIMED },
    });
    res.json({ business: updated });
  }),
);

// Moves a business onto a membership tier by hand. There is no payment page
// yet, so this IS how a sale gets fulfilled — and it replaces having to SSH
// in and run scripts/set-membership-tier.js to do it.
//
// membershipTierExpiresAt is RECORDED, NOT ENFORCED. Nothing reads the column (see
// schema.prisma), so a date in the past downgrades nobody; expiry belongs
// to the payment-and-renewal work. It's writable now so an admin selling a
// year of Plus has somewhere to put the date, and so renewal has real data
// to act on when it lands.
//
// isFoundingMember is deliberately NOT writable here. The other two writers
// (lib/businessClaim.js, scripts/set-membership-tier.js) only ever set it true — that
// is the entire reason it was split out of membershipTier — so this route
// doesn't touch the column at all, rather than offering a way to strip
// founding status as a side effect of an unrelated downgrade.
router.post(
  "/businesses/:id/membership-tier",
  asyncHandler(async (req, res) => {
    const { membershipTier, expiresAt } = req.body ?? {};

    // Checked against the entitlements rank rather than a list kept here:
    // a value this route accepted but can() didn't recognise would be sold,
    // stored, and then quietly denied every gated feature (and capped at
    // the strictest vouch limit — see lib/vouchCap.js).
    if (!Object.hasOwn(MEMBERSHIP_TIER_RANK, membershipTier)) {
      return res
        .status(400)
        .json({ error: `Unknown membership tier. Pick one of: ${Object.keys(MEMBERSHIP_TIER_RANK).join(", ")}.` });
    }

    // Empty clears it — a tier that doesn't lapse, which is what every
    // business has today.
    let membershipTierExpiresAt = null;
    if (expiresAt) {
      membershipTierExpiresAt = new Date(expiresAt);
      if (Number.isNaN(membershipTierExpiresAt.getTime())) {
        return res.status(400).json({ error: "That expiry date isn't a real date." });
      }
    }

    const business = await prisma.business.findUnique({ where: { id: req.params.id } });
    if (!business) return res.status(404).json({ error: "Business not found." });

    const updated = await prisma.business.update({
      where: { id: business.id },
      data: {
        membershipTier,
        // Only restarted when the tier actually moves. Correcting an expiry
        // date shouldn't rewrite when the membership began.
        ...(business.membershipTier === membershipTier ? {} : { membershipTierStartedAt: new Date() }),
        membershipTierExpiresAt,
      },
    });

    res.json({ business: updated });
  }),
);

// A vouch as an admin needs to see it: everything both businesses see, plus
// the reports and who ruled on them. Shared by the queue and by the decide
// route's response, so a card refreshed after a decision is the same shape
// as one that arrived in the list.
const REVIEW_INCLUDE = {
  ...VOUCH_INCLUDE,
  flags: {
    orderBy: { createdAt: "asc" },
    include: {
      raisedByBusiness: { select: BUSINESS_SELECT },
      againstBusiness: { select: BUSINESS_SELECT },
      resolvedByAccount: { select: { id: true, name: true } },
      revision: true,
    },
  },
};

function serializeReview(vouch) {
  return {
    // viewerBusinessId null: an admin is party to neither side, so `role`
    // comes back null and `isYou` is false throughout the timeline, which is
    // exactly right for a third party reading it. includeAdminIdentity is
    // the one thing this payload has that the businesses' doesn't.
    ...serializeVouch(vouch, null, { includeAdminIdentity: true }),
    frozen: vouch.status === "under_review",
    flags: vouch.flags.map((f) => ({
      id: f.id,
      reason: f.reason,
      note: f.note,
      status: f.status,
      outcome: f.outcome,
      createdAt: f.createdAt,
      resolvedAt: f.resolvedAt,
      resolvedBy: f.resolvedByAccount,
      raisedBy: f.raisedByBusiness,
      against: f.againstBusiness,
      // The exact text the report was filed about — not the vouch's current
      // text, which may since have been revised.
      revisionNumber: f.revision?.revisionNumber ?? null,
      revisionComment: f.revision?.comment ?? null,
    })),
  };
}

// The vouch review queue: every vouch an admin has been asked to look at,
// each with the whole audit trail attached rather than just the report
// that raised it. Replaced GET /vouch-flags, which returned bare VouchFlag
// rows — enough to see that somebody complained, not enough to judge it,
// since the flag says nothing about what was written or what the two sides
// had already said to each other.
//
// Two kinds of row land here and they are not the same job:
//   status "under_review" — a live vouch the receiver flagged. It is
//     FROZEN: neither business can act on it (see TURN_BY_STATUS in
//     lib/vouchTurn.js) and the 14-day expiry is paused, so it sits here
//     until an admin moves it.
//   anything else with an open flag — a settled vouch (in practice a
//     cancelled one the giver called unfair). Tracking only; nothing is
//     waiting on the outcome.
//
// The frozen ones are acted on through POST /vouch-reviews/:id/decide
// below; the tracking-only ones through POST /vouch-flags/:id/resolve.
router.get(
  "/vouch-reviews",
  asyncHandler(async (req, res) => {
    // Default view is the work: open reports, plus anything frozen in
    // under_review even if its flags have all been marked reviewed. That
    // second clause exists so a frozen vouch can never quietly drop off
    // the queue while still being frozen for the two businesses.
    const openOnly = req.query.status !== "all";
    const where = {
      OR: [
        { status: "under_review" },
        { flags: { some: openOnly ? { status: "open" } : {} } },
      ],
    };

    const vouches = await prisma.vouch.findMany({ where, include: REVIEW_INCLUDE });

    // Frozen first — those are the ones with two businesses waiting on the
    // admin — then most recently touched. Can't be expressed as a Prisma
    // orderBy, since it's a priority on one specific status value.
    const reviews = vouches.map(serializeReview).sort((a, b) => {
      if (a.frozen !== b.frozen) return a.frozen ? -1 : 1;
      return new Date(b.lastActionAt) - new Date(a.lastActionAt);
    });

    res.json({ reviews });
  }),
);

// The three exits from under_review. One route with a decision rather than
// three routes because everything except the target status is identical —
// the same flags have to be resolved, the same action logged and the same
// two businesses notified, all in one transaction — and splitting that three
// ways is three chances for the copies to drift.
//
// `outcome` is derived, not passed in: returning a vouch to its receiver
// says the report didn't stand up, and the other two say it did. Letting an
// admin set the status and the verdict independently would allow
// combinations that mean nothing ("sent back for edits, report dismissed")
// and make the upheld-flag count unreadable later.
const DECISIONS = {
  return_to_receiver: {
    status: "pending",
    action: "admin_return",
    outcome: "dismissed",
    noteRequired: false,
    events: {
      giver: "vouch_review_returned_giver",
      receiver: "vouch_review_returned_receiver",
    },
  },
  send_back_to_sender: {
    status: "reverted",
    action: "admin_revert",
    outcome: "upheld",
    // The giver has to be told what to fix. Every other decision is
    // self-explanatory from the status it lands on; this one isn't.
    noteRequired: true,
    events: {
      giver: "vouch_review_sent_back_giver",
      receiver: "vouch_review_sent_back_receiver",
    },
  },
  cancel: {
    status: "cancelled",
    action: "admin_cancel",
    outcome: "upheld",
    noteRequired: false,
    events: {
      giver: "vouch_review_cancelled",
      receiver: "vouch_review_cancelled",
    },
  },
};

router.post(
  "/vouch-reviews/:id/decide",
  asyncHandler(async (req, res) => {
    const decision = DECISIONS[req.body?.decision];
    if (!decision) {
      return res.status(400).json({
        error: `Unknown decision. Expected one of: ${Object.keys(DECISIONS).join(", ")}.`,
      });
    }

    const vouch = await prisma.vouch.findUnique({ where: { id: req.params.id } });
    if (!vouch) return res.status(404).json({ error: "Vouch not found." });
    // Only a frozen vouch is an admin's to move. Anything else is a live
    // negotiation between two businesses or a settled record, and neither is
    // something this endpoint should be able to reach into.
    if (vouch.status !== "under_review") {
      return res.status(400).json({ error: "This vouch isn't under review." });
    }

    const note = req.body?.note?.trim() || null;
    if (decision.noteRequired && !note) {
      return res.status(400).json({ error: "Add a note telling them what needs to change." });
    }

    await prisma.$transaction(async (tx) => {
      await tx.vouch.update({
        where: { id: vouch.id },
        data: {
          status: decision.status,
          // Restarts the 14-day expiry clock from the decision rather than
          // from whenever the vouch was flagged — the parties shouldn't lose
          // days they spent waiting in the queue.
          lastActionAt: new Date(),
          closedAt: decision.status === "cancelled" ? new Date() : null,
        },
      });

      // Deliberately leaves revisionCount and maxRevisions alone. A giver
      // already at the cap can still make the fix (POST /vouches/:id/revise
      // has no cap check — only the receiver's revert does), and the
      // receiver then gets accept/cancel and no further rounds. Granting an
      // extra round here would let a flag be worth a free revision.
      await tx.vouchAction.create({
        data: {
          vouchId: vouch.id,
          attempt: vouch.attempt,
          action: decision.action,
          revisionId: vouch.currentRevisionId,
          actorId: null,
          actorAccountId: req.account.id,
          // Visible to both businesses. The flag's own note is not — that
          // one is the report, this one is the ruling.
          comment: note,
          fromStatus: vouch.status,
          toStatus: decision.status,
        },
      });

      // Every open report on the vouch, not just the one that froze it: a
      // second business can't have filed one (only the receiver can flag a
      // live vouch), but a giver's earlier unfair_cancel on a previous
      // attempt could still be sitting open, and leaving it would keep the
      // vouch in the queue after it had been dealt with.
      await tx.vouchFlag.updateMany({
        where: { vouchId: vouch.id, status: "open" },
        data: {
          status: "reviewed",
          outcome: decision.outcome,
          resolvedAt: new Date(),
          resolvedByAccountId: req.account.id,
        },
      });

      // actorBusinessId null — an admin isn't a business. Both sides get
      // told, since the vouch just changed hands for both of them.
      await createActivityEvent(tx, {
        businessId: vouch.fromBusinessId,
        actorBusinessId: null,
        type: decision.events.giver,
      });
      await createActivityEvent(tx, {
        businessId: vouch.toBusinessId,
        actorBusinessId: null,
        type: decision.events.receiver,
      });
    });

    const fresh = await prisma.vouch.findUnique({
      where: { id: vouch.id },
      include: REVIEW_INCLUDE,
    });
    res.json({ review: serializeReview(fresh) });
  }),
);

// Rules on a report against a vouch that's already settled — in practice a
// giver's "unfair_cancel" on a cancelled one. There's no state to move, so
// this only records the judgement, and it records the SAME judgement fields
// as a decide above: whoever later counts upheld flags per business must not
// have to care which of the two paths produced the row.
//
// Refuses to touch a frozen vouch's flags. Marking those reviewed here would
// resolve the report while leaving the vouch stuck in under_review, which is
// exactly the dead end this whole change removes — /decide is the way out.
router.post(
  "/vouch-flags/:id/resolve",
  asyncHandler(async (req, res) => {
    const outcome = req.body?.outcome;
    if (outcome !== "upheld" && outcome !== "dismissed") {
      return res.status(400).json({ error: "Outcome must be 'upheld' or 'dismissed'." });
    }

    const flag = await prisma.vouchFlag.findUnique({
      where: { id: req.params.id },
      include: { vouch: { select: { status: true } } },
    });
    if (!flag) return res.status(404).json({ error: "Flag not found." });
    if (flag.vouch.status === "under_review") {
      return res.status(400).json({
        error: "This vouch is on hold — resolve it through the review decision instead.",
      });
    }

    const updated = await prisma.vouchFlag.update({
      where: { id: flag.id },
      data: {
        status: "reviewed",
        outcome,
        resolvedAt: new Date(),
        resolvedByAccountId: req.account.id,
        note: req.body?.note?.trim() || flag.note,
      },
    });
    res.json({ flag: updated });
  }),
);

export { router as adminRouter };
