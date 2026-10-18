import { Router } from "express";

import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import {
  approveClaimAndRejectRivals,
  revokeApprovedClaim,
  emailRejectedClaimant,
  verifyBusinessSsm,
} from "../lib/businessClaim.js";
import { normalizeSsm, normalizeDomain, looksLikeDomain } from "../lib/businessLookup.js";
import { normalizeBusinessEdit } from "../lib/contactFields.js";
import { isPublicEmailDomain } from "../lib/domainVerification.js";
import { uniqueBusinessId } from "../lib/slug.js";
import { CATEGORY_SERVICES } from "../lib/categoryServices.js";
import { getFoundingSettings, setFoundingSettings, parseDate } from "../lib/founding.js";
import { serializeAccount } from "../lib/serialize.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sendVerificationEmail, devOnlyToken } from "../lib/mailer.js";
import { serializeEndorsement, ENDORSEMENT_INCLUDE, BUSINESS_SELECT } from "../lib/endorsementTurn.js";
import { createActivityEvent } from "../lib/activityEvents.js";
import { createNetworkEvent } from "../lib/networkEvents.js";
import { notifyWatchers } from "../lib/businessWatch.js";
import { MEMBERSHIP_TIER_RANK } from "../lib/entitlements.js";
import { CLAIMED, SSM_VERIFIED, ENDORSABLE_VERIFICATION_LEVELS } from "../lib/verificationLevels.js";
import { startPaidYear } from "../lib/businessClaim.js";

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
      // Rejected claims have no business left to review.
      where: { claimStatus: { in: ["pending", "approved"] } },
      include: { business: true },
      orderBy: [{ businessId: "asc" }, { createdAt: "asc" }],
    });

    // The register check for each PENDING claim (ABRI-launch-access-plan.md
    // step 3), so one review can rule on the claim and the SSM number
    // together:
    //   listed    — the SSM numbers public registers give for THIS listing
    //   match     — whether the claimant's number is one of them (null when
    //               the registers give none, which is most listings)
    //   elsewhere — other listings the registers file under the claimant's
    //               number: a borrowed number shows up here
    const pending = claims.filter((c) => c.claimStatus === "pending");
    const keys = [...new Set(pending.map((c) => normalizeSsm(c.claimSsm)).filter(Boolean))];
    const [listedRows, elsewhereRows] = await Promise.all([
      prisma.sourceRecord.findMany({
        where: { businessId: { in: pending.map((c) => c.businessId) }, ssmNormalized: { not: null } },
        select: { businessId: true, source: true, ssm: true, ssmNormalized: true },
      }),
      keys.length
        ? prisma.sourceRecord.findMany({
            where: { ssmNormalized: { in: keys } },
            select: { businessId: true, source: true, ssmNormalized: true, business: { select: { name: true } } },
          })
        : [],
    ]);
    // One register number can be written with or without the old-format
    // suffix ("202301234567 (1234567-A)"), so a match is either key
    // containing the other — the same tolerance lib/businessLookup.js gives
    // a lookup.
    const sameNumber = (a, b) => Boolean(a && b) && (a === b || (a.length >= 6 && b.length >= 6 && (a.includes(b) || b.includes(a))));
    const registerCheck = (c) => {
      const mine = normalizeSsm(c.claimSsm);
      const listed = listedRows.filter((r) => r.businessId === c.businessId);
      return {
        listed: listed.map(({ source, ssm }) => ({ source, ssm })),
        match: !mine || !listed.length ? null : listed.some((r) => sameNumber(r.ssmNormalized, mine)),
        elsewhere: elsewhereRows
          .filter((r) => r.businessId !== c.businessId && r.ssmNormalized === mine)
          .map((r) => ({ businessId: r.businessId, name: r.business.name, source: r.source })),
      };
    };

    res.json({
      claims: claims.map(({ passwordHash, ...c }) => ({
        ...c,
        ...(c.claimStatus === "pending" ? { registerCheck: registerCheck(c) } : {}),
      })),
    });
  }),
);

// Approves this account's claim and rejects every other pending claim on the
// same business — see approveClaimAndRejectRivals. ONE REVIEW: when the claim
// carries an SSM number the admin has checked it too, so the business lands
// on L2 (SSM-Verified) directly. A wrong number is a reason to reject the
// claim, not to approve it at L1 — on this path the number is the only proof
// of ownership there is. Mints a
// confirmation token, emails the claimant a link to verify their email and
// log in, and also returns the token directly (handy for local dev when
// no mail is set up — see lib/mailer.js devOnlyToken).
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
      verifySsm: true,
    });

    // A claimant who already confirmed their email (every claim since they
    // could log in while pending) just needs to hear the news; a link would
    // only make them prove the same inbox twice. An older pending account
    // that never confirmed still gets the confirm-and-log-in link.
    if (account.emailVerified) {
      await sendVerificationEmail({
        to: account.email,
        subject: `Your claim on ${business.name} has been approved`,
        heading: "Your claim was approved",
        message: `An ABRI admin has approved your claim on ${business.name}. Log in to start using your business page.`,
        link: `${process.env.FRONTEND_URL}/login`,
      });
      return res.json({ account: serializeAccount(account), business });
    }

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
      token: devOnlyToken(tokenRecord.token),
    });
  }),
);

// Rejects a single pending claim. Any other pending claims on the same
// business (or the business itself) are untouched.
//
// The ACCOUNT stays. It used to be deleted, which was harmless while a
// pending claimant could not log in — nothing of theirs existed yet. Now
// they may have been using the app for days, so a rejection detaches the
// claim (claimStatus "rejected", businessId null) and they can claim again
// from inside the app (POST /businesses/me/claim).
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

    const business = await prisma.business.findUnique({ where: { id: pending.businessId } });
    await prisma.account.update({
      where: { id: pending.id },
      data: { claimStatus: "rejected", businessId: null, verificationMethod: null },
    });
    await emailRejectedClaimant(pending, business?.name);
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

// The review queue. Businesses that submitted a registration number and are
// still waiting on a decision.
//
// The filter IS the derived pending state from POST /businesses/me/ssm —
// `ssm != null && level L1` — rather than a status column, so this queue and
// the member's own screen can never disagree about who is waiting. Oldest
// first: a queue sorted newest-first starves the person who has waited
// longest, which is the one thing a review queue must not do.
router.get(
  "/ssm-reviews",
  asyncHandler(async (req, res) => {
    const businesses = await prisma.business.findMany({
      where: { verificationLevel: CLAIMED, ssm: { not: null } },
      select: {
        id: true,
        name: true,
        category: true,
        location: true,
        verificationLevel: true,
        ssm: true,
        domain: true,
        website: true,
        updatedAt: true,
        // Who to contact about it. The claim owner, not every account —
        // several can hold pending claims on one business, and only the
        // approved one is the person who submitted this.
        accounts: {
          where: { claimStatus: "approved" },
          select: { id: true, name: true, email: true, phone: true, role: true },
        },
      },
      orderBy: { updatedAt: "asc" },
    });
    res.json({ businesses });
  }),
);

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
    // The announcement, the member's notice and the watchers' alerts all live
    // in verifyBusinessSsm, shared with the combined claim approval above.
    const updated = await verifyBusinessSsm(business.id);
    res.json({ business: updated });
  }),
);

// Turn down a submitted number.
//
// CLEARS `ssm` rather than setting a "rejected" flag, and that is what makes
// the derived state hold: the business goes back to "nothing submitted", the
// member can submit a corrected number through the same door, and it leaves
// this queue. A rejected marker would need clearing on resubmit anyway, and
// the case where it wasn't is a business stuck looking refused forever.
//
// NO NOTE IS COLLECTED, and that is a deliberate difference from the endorsement
// and the endorsement decisions in this file, which require one.
//
// Those write their note onto a Flag row that exists to hold it. There is no
// equivalent row here — the submission is two columns on Business — and
// ActivityEvent has no detail field: its text is generated server-side from
// the `type` alone (see ACTIVITY_MESSAGES). So a reason typed here would be
// required of the admin, discarded on write, and never reach the member.
// Asking for input that goes nowhere is worse than not asking.
//
// The message therefore has to be self-sufficient, and it is: it names the
// next action rather than the fault. If a per-decision reason turns out to
// matter, the change is a nullable detail column on ActivityEvent, which
// would fix this for the seven other event families at once — the same
// cross-cutting note lib/activityLinks.js makes about the missing subjectId.
router.post(
  "/businesses/:id/reject-ssm",
  asyncHandler(async (req, res) => {
    const business = await prisma.business.findUnique({ where: { id: req.params.id } });
    if (!business || business.verificationLevel !== CLAIMED || !business.ssm) {
      return res.status(400).json({ error: "No submitted registration number to rule on." });
    }

    await prisma.business.update({
      where: { id: business.id },
      data: { ssm: null },
    });
    // No NetworkEvent. The network is never told that somebody FAILED a
    // check — the feed carries third-party positive acts only, and a
    // rejection is neither positive nor anybody else's business. The member
    // is told; nobody else is.
    await createActivityEvent(prisma, {
      businessId: business.id,
      actorBusinessId: null,
      type: "ssm_rejected",
    });

    res.json({ ok: true });
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
    // Dated, so the profile timeline can say WHEN it lapsed rather than only
    // that it did. Written here because this is the only route that revokes;
    // it is recorded, not broadcast — see the type's comment in
    // lib/networkEvents.js for why it never reaches the feed.
    await createNetworkEvent(prisma, {
      type: "business_verification_revoked",
      subjectBusinessId: business.id,
    });
    // The direction that matters most to a watcher: somebody they were about
    // to deal with just lost a level. notifyWatchers picks the wording from
    // the direction, so this is the one that reads as a warning.
    await notifyWatchers(business.id, { fromLevel: SSM_VERIFIED, toLevel: CLAIMED });
    res.json({ business: updated });
  }),
);

// Moves a business onto a membership tier by hand. There is no payment page
// yet, so this IS how a sale gets fulfilled — and it replaces having to SSH
// in and run scripts/set-membership-tier.js to do it.
//
// membershipTierExpiresAt is ENFORCED since the Founding programme (Oct
// 2026): the gates treat an expired tier as Free at once and an hourly sweep
// rewrites the column (lib/membershipExpiry.js). Leave it empty for a tier
// that doesn't lapse.
//
// isFoundingMember is deliberately NOT writable here. The other two writers
// (lib/businessClaim.js, scripts/set-membership-tier.js) only ever set it true — that
// is the entire reason it was split out of membershipTier — so this route
// doesn't touch the column at all, rather than offering a way to strip
// founding status as a side effect of an unrelated downgrade.
router.post(
  "/businesses/:id/membership-tier",
  asyncHandler(async (req, res) => {
    const { membershipTier, expiresAt, paid } = req.body ?? {};

    // Checked against the entitlements rank rather than a list kept here:
    // a value this route accepted but can() didn't recognise would be sold,
    // stored, and then quietly denied every gated feature (and capped at
    // the strictest endorsement limit — see lib/endorsementCap.js).
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

    // A SALE (ABRI-launch-access-plan.md step 6): a paid year, which starts
    // the day the business is SSM-Verified so it never ticks while the member
    // waits on our review. Already verified → it starts now. Not yet → it is
    // parked in pendingMembershipTier and verifyBusinessSsm starts it; the
    // business keeps whatever tier it has meanwhile (Founding Pro, say).
    if (paid) {
      if (membershipTier === "free") {
        return res.status(400).json({ error: "A paid tier can't be Free." });
      }
      const verified = ENDORSABLE_VERIFICATION_LEVELS.has(business.verificationLevel);
      const updated = await prisma.business.update({
        where: { id: business.id },
        data: verified ? startPaidYear(membershipTier) : { pendingMembershipTier: membershipTier },
      });
      return res.json({ business: updated, startsAtVerification: !verified });
    }

    const updated = await prisma.business.update({
      where: { id: business.id },
      data: {
        membershipTier,
        // Only restarted when the tier actually moves. Correcting an expiry
        // date shouldn't rewrite when the membership began.
        ...(business.membershipTier === membershipTier ? {} : { membershipTierStartedAt: new Date() }),
        membershipTierExpiresAt,
        // Hand-set now, so a later change to the Founding end date leaves it
        // alone (lib/founding.js moves only "founding" grants).
        membershipTierGrant: membershipTier === "free" ? null : "admin",
      },
    });

    res.json({ business: updated });
  }),
);

// The Founding programme's two dates (lib/founding.js). PUT takes both every
// time — ISO dates, or null to clear — so the form always says exactly what
// is stored. Changing the end date moves every business still on its
// Founding Pro, and the response says how many.
router.get(
  "/settings/founding",
  asyncHandler(async (req, res) => {
    const settings = await getFoundingSettings();
    const [foundingMembers, foundingProMembers] = await Promise.all([
      prisma.business.count({ where: { isFoundingMember: true } }),
      prisma.business.count({ where: { membershipTierGrant: "founding", membershipTier: "pro" } }),
    ]);
    res.json({ ...settings, foundingMembers, foundingProMembers });
  }),
);

router.put(
  "/settings/founding",
  asyncHandler(async (req, res) => {
    const { closesAt, proEndsAt } = req.body ?? {};
    const closes = parseDate(closesAt);
    const ends = parseDate(proEndsAt);
    if ((closesAt && !closes) || (proEndsAt && !ends)) {
      return res.status(400).json({ error: "That isn't a real date." });
    }
    res.json(await setFoundingSettings({ closesAt: closes, proEndsAt: ends }));
  }),
);

// An endorsement as an admin needs to see it: everything both businesses see, plus
// the reports and who ruled on them. Shared by the queue and by the decide
// route's response, so a card refreshed after a decision is the same shape
// as one that arrived in the list.
const REVIEW_INCLUDE = {
  ...ENDORSEMENT_INCLUDE,
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

function serializeReview(endorsement) {
  return {
    // viewerBusinessId null: an admin is party to neither side, so `role`
    // comes back null and `isYou` is false throughout the timeline, which is
    // exactly right for a third party reading it. includeAdminIdentity is
    // the one thing this payload has that the businesses' doesn't.
    ...serializeEndorsement(endorsement, null, { includeAdminIdentity: true }),
    frozen: endorsement.status === "under_review",
    flags: endorsement.flags.map((f) => ({
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
      // The exact text the report was filed about — not the endorsement's current
      // text, which may since have been revised.
      revisionNumber: f.revision?.revisionNumber ?? null,
      revisionComment: f.revision?.comment ?? null,
    })),
  };
}

// The endorsement review queue: every endorsement an admin has been asked to look at,
// each with the whole audit trail attached rather than just the report
// that raised it. Replaced GET /endorsement-flags, which returned bare EndorsementFlag
// rows — enough to see that somebody complained, not enough to judge it,
// since the flag says nothing about what was written or what the two sides
// had already said to each other.
//
// Two kinds of row land here and they are not the same job:
//   status "under_review" — a live endorsement the receiver flagged. It is
//     FROZEN: neither business can act on it (see TURN_BY_STATUS in
//     lib/endorsementTurn.js) and the 14-day expiry is paused, so it sits here
//     until an admin moves it.
//   anything else with an open flag — a settled endorsement (in practice a
//     cancelled one the giver called unfair). Tracking only; nothing is
//     waiting on the outcome.
//
// The frozen ones are acted on through POST /endorsement-reviews/:id/decide
// below; the tracking-only ones through POST /endorsement-flags/:id/resolve.
router.get(
  "/endorsement-reviews",
  asyncHandler(async (req, res) => {
    // Default view is the work: open reports, plus anything frozen in
    // under_review even if its flags have all been marked reviewed. That
    // second clause exists so a frozen endorsement can never quietly drop off
    // the queue while still being frozen for the two businesses.
    const openOnly = req.query.status !== "all";
    const where = {
      OR: [
        { status: "under_review" },
        { flags: { some: openOnly ? { status: "open" } : {} } },
      ],
    };

    const endorsements = await prisma.endorsement.findMany({ where, include: REVIEW_INCLUDE });

    // Frozen first — those are the ones with two businesses waiting on the
    // admin — then most recently touched. Can't be expressed as a Prisma
    // orderBy, since it's a priority on one specific status value.
    const reviews = endorsements.map(serializeReview).sort((a, b) => {
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
// `outcome` is derived, not passed in: returning an endorsement to its receiver
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
      giver: "endorsement_review_returned_giver",
      receiver: "endorsement_review_returned_receiver",
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
      giver: "endorsement_review_sent_back_giver",
      receiver: "endorsement_review_sent_back_receiver",
    },
  },
  cancel: {
    status: "cancelled",
    action: "admin_cancel",
    outcome: "upheld",
    noteRequired: false,
    events: {
      giver: "endorsement_review_cancelled",
      receiver: "endorsement_review_cancelled",
    },
  },
};

router.post(
  "/endorsement-reviews/:id/decide",
  asyncHandler(async (req, res) => {
    const decision = DECISIONS[req.body?.decision];
    if (!decision) {
      return res.status(400).json({
        error: `Unknown decision. Expected one of: ${Object.keys(DECISIONS).join(", ")}.`,
      });
    }

    const endorsement = await prisma.endorsement.findUnique({ where: { id: req.params.id } });
    if (!endorsement) return res.status(404).json({ error: "Endorsement not found." });
    // Only a frozen endorsement is an admin's to move. Anything else is a live
    // negotiation between two businesses or a settled record, and neither is
    // something this endpoint should be able to reach into.
    if (endorsement.status !== "under_review") {
      return res.status(400).json({ error: "This endorsement isn't under review." });
    }

    const note = req.body?.note?.trim() || null;
    if (decision.noteRequired && !note) {
      return res.status(400).json({ error: "Add a note telling them what needs to change." });
    }

    await prisma.$transaction(async (tx) => {
      await tx.endorsement.update({
        where: { id: endorsement.id },
        data: {
          status: decision.status,
          // Restarts the 14-day expiry clock from the decision rather than
          // from whenever the endorsement was flagged — the parties shouldn't lose
          // days they spent waiting in the queue.
          lastActionAt: new Date(),
          closedAt: decision.status === "cancelled" ? new Date() : null,
        },
      });

      // Deliberately leaves revisionCount and maxRevisions alone. A giver
      // already at the cap can still make the fix (POST /endorsements/:id/revise
      // has no cap check — only the receiver's revert does), and the
      // receiver then gets accept/cancel and no further rounds. Granting an
      // extra round here would let a flag be worth a free revision.
      await tx.endorsementAction.create({
        data: {
          endorsementId: endorsement.id,
          attempt: endorsement.attempt,
          action: decision.action,
          revisionId: endorsement.currentRevisionId,
          actorId: null,
          actorAccountId: req.account.id,
          // Visible to both businesses. The flag's own note is not — that
          // one is the report, this one is the ruling.
          comment: note,
          fromStatus: endorsement.status,
          toStatus: decision.status,
        },
      });

      // Every open report on the endorsement, not just the one that froze it: a
      // second business can't have filed one (only the receiver can flag a
      // live endorsement), but a giver's earlier unfair_cancel on a previous
      // attempt could still be sitting open, and leaving it would keep the
      // endorsement in the queue after it had been dealt with.
      await tx.endorsementFlag.updateMany({
        where: { endorsementId: endorsement.id, status: "open" },
        data: {
          status: "reviewed",
          outcome: decision.outcome,
          resolvedAt: new Date(),
          resolvedByAccountId: req.account.id,
        },
      });

      // actorBusinessId null — an admin isn't a business. Both sides get
      // told, since the endorsement just changed hands for both of them.
      await createActivityEvent(tx, {
        businessId: endorsement.fromBusinessId,
        actorBusinessId: null,
        type: decision.events.giver,
      });
      await createActivityEvent(tx, {
        businessId: endorsement.toBusinessId,
        actorBusinessId: null,
        type: decision.events.receiver,
      });
    });

    const fresh = await prisma.endorsement.findUnique({
      where: { id: endorsement.id },
      include: REVIEW_INCLUDE,
    });
    res.json({ review: serializeReview(fresh) });
  }),
);

// Rules on a report against an endorsement that's already settled — in practice a
// giver's "unfair_cancel" on a cancelled one. There's no state to move, so
// this only records the judgement, and it records the SAME judgement fields
// as a decide above: whoever later counts upheld flags per business must not
// have to care which of the two paths produced the row.
//
// Refuses to touch a frozen endorsement's flags. Marking those reviewed here would
// resolve the report while leaving the endorsement stuck in under_review, which is
// exactly the dead end this whole change removes — /decide is the way out.
router.post(
  "/endorsement-flags/:id/resolve",
  asyncHandler(async (req, res) => {
    const outcome = req.body?.outcome;
    if (outcome !== "upheld" && outcome !== "dismissed") {
      return res.status(400).json({ error: "Outcome must be 'upheld' or 'dismissed'." });
    }

    const flag = await prisma.endorsementFlag.findUnique({
      where: { id: req.params.id },
      include: { endorsement: { select: { status: true } } },
    });
    if (!flag) return res.status(404).json({ error: "Flag not found." });
    if (flag.endorsement.status === "under_review") {
      return res.status(400).json({
        error: "This endorsement is on hold — resolve it through the review decision instead.",
      });
    }

    const updated = await prisma.endorsementFlag.update({
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

// ---------------------------------------------------------------------------
// Businesses: list, add, edit, delete.
//
// Exists so an admin can set up and reset a listing by hand, mainly to test
// the claim flow: a business whose domain matches the claimant's email
// (auto-approved) and one that does not (goes to review). Level, plan and
// claims are NOT editable here; they have their own screens.
// ---------------------------------------------------------------------------

// Fields an admin sets that a member can't (see PROTECTED_FIELDS in
// lib/contactFields.js). The rest go through normalizeBusinessEdit, so a
// phone number is stored exactly as the member's own edit would store it.
const ADMIN_ONLY_FIELDS = ["name", "category", "location", "domain", "ssm"];

function adminBusinessData(body, { creating }) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Expected a JSON object." };
  }
  const data = {};

  for (const field of ["name", "category", "location"]) {
    if (!Object.hasOwn(body, field) && !creating) continue;
    const value = typeof body[field] === "string" ? body[field].trim() : "";
    if (!value) return { error: `${field[0].toUpperCase()}${field.slice(1)} is required.` };
    if (value.length > 200) return { error: `${field} is too long.` };
    data[field] = value;
  }

  if (Object.hasOwn(body, "domain")) {
    const raw = body.domain;
    if (raw === null || raw === "") {
      data.domain = null;
    } else if (typeof raw !== "string") {
      return { error: "Domain must be text." };
    } else {
      const domain = normalizeDomain(raw);
      if (!looksLikeDomain(domain)) {
        return { error: "That doesn't look like a domain. Use something like acme.com.my." };
      }
      if (isPublicEmailDomain(domain)) {
        return { error: `${domain} is a public email domain; it can't be used to approve claims.` };
      }
      data.domain = domain;
    }
  }

  // ssm and ssmNormalized are written together or not at all (schema.prisma).
  if (Object.hasOwn(body, "ssm")) {
    const raw = typeof body.ssm === "string" ? body.ssm.trim() : "";
    data.ssm = raw || null;
    data.ssmNormalized = raw ? normalizeSsm(raw) : null;
  }

  const rest = {};
  for (const [k, v] of Object.entries(body)) {
    if (!ADMIN_ONLY_FIELDS.includes(k)) rest[k] = v;
  }
  if (Object.keys(rest).length > 0) {
    const { data: edit, error } = normalizeBusinessEdit(rest);
    if (error) return { error };
    Object.assign(data, edit);
  }
  return { data };
}

const BUSINESS_LIST_SELECT = {
  id: true,
  name: true,
  category: true,
  location: true,
  domain: true,
  email: true,
  phone: true,
  website: true,
  // The rest of what the edit form shows; leaving any out would blank it on save.
  ssm: true,
  whatsapp: true,
  address: true,
  openingHours: true,
  description: true,
  verificationLevel: true,
  membershipTier: true,
  updatedAt: true,
  accounts: {
    where: { claimStatus: { in: ["pending", "approved"] } },
    select: { id: true, email: true, claimStatus: true },
  },
};

function serializeAdminBusiness({ accounts, ...business }) {
  return { ...business, claimants: accounts };
}

router.get(
  "/businesses",
  asyncHandler(async (req, res) => {
    const q = req.query;
    const pageSize = Math.min(Math.max(parseInt(q.pageSize, 10) || 25, 1), 100);
    const page = Math.max(parseInt(q.page, 10) || 1, 1);

    const contains = (v) => ({ contains: String(v).trim(), mode: "insensitive" });
    const where = {};
    for (const field of ["name", "id", "domain", "email", "location", "category"]) {
      if (typeof q[field] === "string" && q[field].trim()) where[field] = contains(q[field]);
    }
    if (typeof q.verificationLevel === "string" && q.verificationLevel) {
      where.verificationLevel = q.verificationLevel;
    }
    if (q.claimed === "yes") {
      where.accounts = { some: { claimStatus: { in: ["pending", "approved"] } } };
    } else if (q.claimed === "no") {
      where.accounts = { none: { claimStatus: { in: ["pending", "approved"] } } };
    }

    const [rows, total] = await prisma.$transaction([
      prisma.business.findMany({
        where,
        select: BUSINESS_LIST_SELECT,
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.business.count({ where }),
    ]);
    res.json({ businesses: rows.map(serializeAdminBusiness), total, page, pageSize });
  }),
);

router.post(
  "/businesses",
  asyncHandler(async (req, res) => {
    const { data, error } = adminBusinessData(req.body, { creating: true });
    if (error) return res.status(400).json({ error });
    const id = await uniqueBusinessId(data.name);
    const business = await prisma.business.create({
      data: {
        services: CATEGORY_SERVICES[data.category] ?? [],
        ...data,
        id,
      },
      select: BUSINESS_LIST_SELECT,
    });
    res.status(201).json({ business: serializeAdminBusiness(business) });
  }),
);

router.patch(
  "/businesses/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.business.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Business not found." });
    const { data, error } = adminBusinessData(req.body, { creating: false });
    if (error) return res.status(400).json({ error });
    if (Object.keys(data).length === 0) return res.status(400).json({ error: "Nothing to update." });
    // A source's old pin next to a new address is worse than no pin (same
    // rule as the member PATCH).
    if (Object.hasOwn(data, "address") && data.address !== existing.address) {
      data.lat = null;
      data.lng = null;
    }
    const business = await prisma.business.update({
      where: { id: existing.id },
      data,
      select: BUSINESS_LIST_SELECT,
    });
    res.json({ business: serializeAdminBusiness(business) });
  }),
);

// For resetting a test listing. Refuses anything with network history, so a
// real member can't be wiped by a stray click; the rows a claim itself
// writes (system events with no acting business) go with it.
router.delete(
  "/businesses/:id",
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const business = await prisma.business.findUnique({ where: { id } });
    if (!business) return res.status(404).json({ error: "Business not found." });

    const either = (a, b) => ({ OR: [{ [a]: id }, { [b]: id }] });
    const counts = await Promise.all([
      prisma.endorsement.count({ where: either("fromBusinessId", "toBusinessId") }),
      prisma.endorsementRevision.count({ where: { createdById: id } }),
      prisma.endorsementFlag.count({ where: either("raisedByBusinessId", "againstBusinessId") }),
      prisma.endorsementAction.count({ where: { actorId: id } }),
      prisma.connection.count({ where: { OR: [{ businessAId: id }, { businessBId: id }, { requestedById: id }] } }),
      prisma.follow.count({ where: either("followerId", "followedId") }),
      prisma.portfolioEntry.count({
        where: { OR: [{ businessAId: id }, { businessBId: id }, { proposedById: id }, { serviceProvidedById: id }] },
      }),
      prisma.businessWatch.count({ where: either("watcherId", "watchedId") }),
      prisma.businessCheck.count({ where: either("checkedById", "checkedId") }),
      // Events with an acting business are network history; the ones a claim
      // approval writes have none.
      prisma.networkEvent.count({
        where: { OR: [{ actorBusinessId: id }, { subjectBusinessId: id, actorBusinessId: { not: null } }] },
      }),
      prisma.activityEvent.count({
        where: { OR: [{ actorBusinessId: id }, { businessId: id, actorBusinessId: { not: null } }] },
      }),
    ]);
    if (counts.some((n) => n > 0)) {
      return res.status(409).json({
        error: "This business has activity on the network (endorsements, connections or similar), so it can't be deleted.",
      });
    }

    const accounts = await prisma.account.findMany({
      where: { businessId: id, isAdmin: false },
      select: { id: true },
    });
    const accountIds = accounts.map((a) => a.id);
    await prisma.$transaction([
      prisma.emailVerificationToken.deleteMany({
        where: { OR: [{ businessId: id }, { accountId: { in: accountIds } }] },
      }),
      prisma.deferredConnection.deleteMany({
        where: { OR: [{ businessId: id }, { accountId: { in: accountIds } }] },
      }),
      // Views are analytics, not a relationship, so they never block a delete.
      prisma.profileView.deleteMany({ where: either("viewerId", "viewedId") }),
      prisma.networkEvent.deleteMany({ where: { subjectBusinessId: id } }),
      prisma.activityEvent.deleteMany({ where: { businessId: id } }),
      prisma.account.deleteMany({ where: { id: { in: accountIds } } }),
      // An admin who somehow holds this business keeps their account.
      prisma.account.updateMany({ where: { businessId: id }, data: { businessId: null, claimStatus: null } }),
      prisma.business.delete({ where: { id } }),
    ]);
    res.json({ deleted: id, accountsDeleted: accountIds.length });
  }),
);

export { router as adminRouter };
