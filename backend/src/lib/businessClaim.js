import { prisma } from "../prisma.js";
import { CATEGORY_SERVICES } from "./categoryServices.js";
import { uniqueBusinessId } from "./slug.js";
import { CLAIMED, UNCLAIMED, SSM_VERIFIED } from "./verificationLevels.js";
import { createActivityEvent } from "./activityEvents.js";
import { createNetworkEvent } from "./networkEvents.js";
import { normalizeSsm } from "./businessLookup.js";
import { notifyWatchers } from "./businessWatch.js";
import { sendVerificationEmail } from "./mailer.js";
import { foundingGrantForApproval } from "./founding.js";

// Resolves the Business a claim is being submitted against — an existing
// listing, or a brand new one. Deliberately does NOT touch the verification level or set any
// claim status on the business — those live on the Account making the
// claim (see schema.prisma), since several accounts can be mid-claim on
// the same business at once. Also does NOT overwrite an existing
// business's name/category/location from the submitted form — while a
// listing is contested, one claimant's edits shouldn't clobber what
// another claimant (or the original seed data) already has.
async function findOrCreateClaimTarget({ businessId, businessName, category, location, ssm }) {
  if (businessId) {
    const existing = await prisma.business.findUnique({ where: { id: businessId } });
    if (!existing) {
      throw Object.assign(new Error("This listing isn't available to claim."), { status: 400 });
    }
    const alreadyApproved = await prisma.account.findFirst({
      where: { businessId, claimStatus: "approved" },
    });
    if (alreadyApproved) {
      throw Object.assign(new Error("This business has already been claimed."), { status: 400 });
    }
    return existing;
  }

  const id = await uniqueBusinessId(businessName);
  return prisma.business.create({
    data: {
      id,
      name: businessName,
      category,
      location,
      // No `ssm` here, even though the claimant typed one: it lives on their
      // Account (claimSsm) until the claim is approved, the same as a claim
      // on an existing listing. Writing it now would put an unchecked number
      // on the business — and, at L1, into the SSM queue — before anyone had
      // looked at the claim.
      // A manually-registered business has no established domain to check
      // against, so it always goes through manual review.
      domain: null,
      services: CATEGORY_SERVICES[category] ?? [],
    },
  });
}


// Approves one account's claim on a business and rejects every other
// pending claim on the same business — a claim only ever "wins" outright,
// never coexists with rivals (until the separate, later team-members
// feature intentionally allows multiple approved accounts per business).
// `verifySsm`: the admin's one review covered the SSM number as well as the
// claim (ABRI-launch-access-plan.md step 3), so the business goes straight to
// L2. Without it — an email-code or domain approval, which prove the inbox and
// nothing about the registration — the claimant's number is copied onto the
// business at L1, which IS the SSM queue (ssm set + L1), and an admin rules
// on it there.
async function approveClaimAndRejectRivals({ accountId, businessId, verificationMethod, verifySsm = false }) {
  // Rivals are rejected, not deleted: they can log in while pending, so the
  // account is theirs and stays. Same shape as POST /admin/claims/:id/reject.
  const rivals = await prisma.account.findMany({
    where: { businessId, claimStatus: "pending", id: { not: accountId } },
  });
  if (rivals.length) {
    await prisma.account.updateMany({
      where: { id: { in: rivals.map((r) => r.id) } },
      data: { claimStatus: "rejected", businessId: null, verificationMethod: null },
    });
  }

  const account = await prisma.account.update({
    where: { id: accountId },
    data: { claimStatus: "approved", verificationMethod },
  });

  // The Founding programme (lib/founding.js): while it is open, every approval
  // is a Founding member on Pro until the Founding end date; once it closes,
  // approvals start on Free. It replaced a count of the first 100 approvals,
  // which turned away the 101st business to join during seeding. A claim
  // revoked and re-approved after the programme closes lands on Free — fine,
  // since revokeApprovedClaim is a full unwind — but the founding FLAG, once
  // earned, is never taken back: see below.
  const grant = await foundingGrantForApproval();

  const business = await prisma.business.update({
    where: { id: businessId },
    data: {
      verificationLevel: CLAIMED,
      membershipTier: grant.membershipTier,
      membershipTierGrant: grant.membershipTierGrant,
      membershipTierExpiresAt: grant.membershipTierExpiresAt,
      membershipTierStartedAt: new Date(),
      // Set only on the founding branch — never written as `false`. Once a
      // business has been recognised as founding, no later approval can
      // take it back, which is exactly what the old plan-encoded version
      // couldn't promise (any plan change erased it). Spreading rather than
      // a ternary keeps the non-founding path from touching the column at
      // all, so the column default is the only thing that ever sets false.
      ...(grant.isFoundingMember ? { isFoundingMember: true } : {}),
    },
  });

  // The claimant's number becomes the business's, now that they own it.
  // Skipped when they gave none (a claim from before numbers were required).
  const claimSsm = account.claimSsm?.trim();
  if (claimSsm) {
    await prisma.business.update({
      where: { id: businessId },
      data: { ssm: claimSsm, ssmNormalized: normalizeSsm(claimSsm) },
    });
  }

  // The network hears that a listing became a member. Sequential rather than
  // transactional, matching the rest of this function — and safe to be, for
  // the reason the feed is built on: this row announces the level change and
  // is only VISIBLE while the business is still at or above L1, so a claim
  // that is later revoked retracts its own announcement with no unwind step
  // in revokeApprovedClaim.
  //
  // actorBusinessId stays null. An admin approved this, and an admin is not a
  // member — naming one would put staff into a members' feed. Same call
  // activityEvents.js makes on ask_expired.
  await createNetworkEvent(prisma, {
    type: "business_claimed",
    subjectBusinessId: business.id,
  });
  // And anyone watching. This is the case the feature was named for: a member
  // checked a counterparty, found only a bare listing, and asked to be told
  // the moment somebody stood behind it.
  await notifyWatchers(business.id, { fromLevel: UNCLAIMED, toLevel: CLAIMED });

  for (const rival of rivals) await emailRejectedClaimant(rival, business.name);

  if (verifySsm && claimSsm) {
    return { account, business: await verifyBusinessSsm(businessId) };
  }
  return { account, business };
}

// The Business fields for a paid year of `tier` starting now. Twelve months,
// because every paid tier is annual (see the pricing page).
function startPaidYear(tier, now = new Date()) {
  const expiresAt = new Date(now);
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  return {
    membershipTier: tier,
    membershipTierGrant: "paid",
    membershipTierStartedAt: now,
    membershipTierExpiresAt: expiresAt,
    pendingMembershipTier: null,
  };
}

// L1 -> L2: an admin matched the business's SSM number against the register.
// The one way a business becomes SSM-Verified — POST /admin/businesses/:id/
// verify-ssm (the SSM queue) and a combined claim approval both come here, so
// the announcement, the member's notice and the watchers' alerts can't differ
// between the two doors.
async function verifyBusinessSsm(businessId) {
  const before = await prisma.business.findUnique({ where: { id: businessId } });
  const updated = await prisma.business.update({
    where: { id: businessId },
    data: {
      verificationLevel: SSM_VERIFIED,
      // A tier paid for before verification starts now, so the member's year
      // is counted from the day they could actually use it.
      ...(before?.pendingMembershipTier ? startPaidYear(before.pendingMembershipTier) : {}),
    },
  });
  // Announced to the network. No matching write in revoke-ssm, and that
  // absence is the design: the feed only shows a level announcement while the
  // business is still at or above the level it announced, so dropping back to
  // L1 retracts this row by itself — see verificationLevelsAtOrAbove.
  //
  // actorBusinessId null: an admin decided this, and staff never appear in a
  // members' feed.
  await createNetworkEvent(prisma, {
    type: "business_verified",
    subjectBusinessId: businessId,
  });
  // And the member is TOLD — they submitted a number and are waiting.
  await createActivityEvent(prisma, {
    businessId,
    actorBusinessId: null,
    type: "ssm_verified",
  });
  // Everyone who asked to be told. Fired here rather than lazily on read
  // because the whole point of a watch is not having to come back and look.
  await notifyWatchers(businessId, { fromLevel: CLAIMED, toLevel: SSM_VERIFIED });
  return updated;
}

// Tells a claimant their claim did not go through, and that the account is
// still theirs. Fire-and-forget like every mail here (lib/mailer.js logs a
// failure and never throws).
async function emailRejectedClaimant(account, businessName) {
  if (!account.emailVerified) return; // never confirmed: we can't be sure the inbox is theirs
  await sendVerificationEmail({
    to: account.email,
    subject: `Your claim on ${businessName ?? "a business"} wasn't approved`,
    heading: "Your claim wasn't approved",
    message: `An ABRI admin couldn't approve your claim on ${businessName ?? "this business"}. Your account is still active — log in to claim again with your SSM registration number, or reply to this email if you think this is a mistake.`,
    link: `${process.env.FRONTEND_URL}/login`,
  });
}

// Undoes an already-approved claim entirely — the admin's equivalent of
// "this approval was a mistake." Unlike revoke-ssm (which steps a business
// back exactly one level, L2 -> L1), this always lands on L0: the account
// making the claim is being deleted outright, so there's no intermediate
// claim state left to fall back to.
//
// Any DeferredConnection rows this account still had queued go with it —
// DeferredConnection.accountId is ON DELETE CASCADE, so the database drops
// them rather than every account-delete in the codebase having to remember
// to (see the model's comment in schema.prisma for why that's the right
// place for the rule).
//
// Assumes exactly one approved account per business at a time (true today
// — see approveClaimAndRejectRivals). If a future team-members feature
// allows multiple approved accounts per business, this needs to stop
// dropping the whole business's verification level unconditionally.
async function revokeApprovedClaim({ accountId, businessId }) {
  await prisma.account.delete({ where: { id: accountId } });

  const business = await prisma.business.update({
    where: { id: businessId },
    // A paid tier still waiting for SSM goes with the claim: the listing has
    // no owner to start it for. Refunding it is an admin's job (it is shown
    // on the claims screen until this runs).
    data: { verificationLevel: UNCLAIMED, pendingMembershipTier: null },
  });

  return { business };
}

export {
  findOrCreateClaimTarget,
  approveClaimAndRejectRivals,
  revokeApprovedClaim,
  emailRejectedClaimant,
  verifyBusinessSsm,
  startPaidYear,
};
