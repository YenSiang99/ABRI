import { prisma } from "../prisma.js";
import { CATEGORY_SERVICES } from "./categoryServices.js";
import { uniqueBusinessId } from "./slug.js";

// Resolves the Business a claim is being submitted against — an existing
// listing, or a brand new one. Deliberately does NOT touch tier or set any
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
      ssm: ssm || null,
      // A manually-registered business has no established domain to check
      // against, so it always goes through manual review.
      domain: null,
      services: CATEGORY_SERVICES[category] ?? [],
    },
  });
}

// How many businesses get the founding-100 program's free "premium"
// membershipPlan (see schema.prisma's Business.membershipPlan comment).
const FOUNDING_MEMBER_LIMIT = 100;

// Approves one account's claim on a business and rejects every other
// pending claim on the same business — a claim only ever "wins" outright,
// never coexists with rivals (until the separate, later team-members
// feature intentionally allows multiple approved accounts per business).
async function approveClaimAndRejectRivals({ accountId, businessId, verificationMethod }) {
  await prisma.account.deleteMany({
    where: { businessId, claimStatus: "pending", id: { not: accountId } },
  });

  const account = await prisma.account.update({
    where: { id: accountId },
    data: { claimStatus: "approved", verificationMethod },
  });

  // Counted AFTER the update above, so it already includes this account —
  // "<= FOUNDING_MEMBER_LIMIT" means this is the Nth-or-earlier approval.
  // Encodes the blueprint's founding-100 program automatically, with no
  // manual per-business admin step (mirrors how every other admin-only
  // flag in this codebase, e.g. Account.isAdmin, is otherwise a manual DB
  // flip). Known minor edge case, not worth engineering around at
  // N=100–600: if a founding business's claim is later revoked (which
  // resets tier to T0 but doesn't touch membershipPlan) and re-claimed
  // after 100 other businesses have since been approved, re-running this
  // check on re-approval would downgrade it to "basic" — acceptable given
  // revokeApprovedClaim is already framed as a full unwind.
  const approvedCount = await prisma.account.count({ where: { claimStatus: "approved" } });
  const membershipPlan = approvedCount <= FOUNDING_MEMBER_LIMIT ? "premium" : "basic";

  const business = await prisma.business.update({
    where: { id: businessId },
    data: { tier: "T1", membershipPlan },
  });

  return { account, business };
}

// Undoes an already-approved claim entirely — the admin's equivalent of
// "this approval was a mistake." Unlike revoke-ssm (which steps a business
// back exactly one tier, T2 -> T1), this always lands on T0: the account
// making the claim is being deleted outright, so there's no intermediate
// claim state left to fall back to.
//
// Any PendingConnection rows this account still had queued go with it —
// PendingConnection.accountId is ON DELETE CASCADE, so the database drops
// them rather than every account-delete in the codebase having to remember
// to (see the model's comment in schema.prisma for why that's the right
// place for the rule).
//
// Assumes exactly one approved account per business at a time (true today
// — see approveClaimAndRejectRivals). If a future team-members feature
// allows multiple approved accounts per business, this needs to stop
// dropping the whole business's tier unconditionally.
async function revokeApprovedClaim({ accountId, businessId }) {
  await prisma.account.delete({ where: { id: accountId } });

  const business = await prisma.business.update({
    where: { id: businessId },
    data: { tier: "T0" },
  });

  return { business };
}

export { findOrCreateClaimTarget, approveClaimAndRejectRivals, revokeApprovedClaim };
