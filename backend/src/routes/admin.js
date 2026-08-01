import { Router } from "express";

import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { approveClaimAndRejectRivals, revokeApprovedClaim } from "../lib/businessClaim.js";
import { serializeAccount } from "../lib/serialize.js";
import { asyncHandler } from "../lib/asyncHandler.js";

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
// confirmation token so the claimant can verify their email and log in.
// TODO: email this link once a provider is wired up — for now, return the
// token directly (same placeholder as the domain-match path).
router.post(
  "/claims/:accountId/approve",
  asyncHandler(async (req, res) => {
    const pending = await prisma.account.findUnique({ where: { id: req.params.accountId } });
    if (!pending || pending.claimStatus !== "pending") {
      return res.status(404).json({ error: "No pending claim found for this account." });
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

    res.json({ account: serializeAccount(account), business, token: tokenRecord.token });
  }),
);

// Rejects a single pending claim — deletes that account only. Any other
// pending claims on the same business (or the business itself) are
// untouched.
router.post(
  "/claims/:accountId/reject",
  asyncHandler(async (req, res) => {
    const pending = await prisma.account.findUnique({ where: { id: req.params.accountId } });
    if (!pending || pending.claimStatus !== "pending") {
      return res.status(404).json({ error: "No pending claim found for this account." });
    }

    await prisma.account.delete({ where: { id: pending.id } });
    res.json({ ok: true });
  }),
);

// Undoes an already-approved claim — deletes the account entirely and
// drops the business back to T0. For an admin fixing a fat-fingered
// approval, not a "downgrade one tier" operation (contrast with
// /businesses/:id/revoke-ssm below) — the whole claim is being unwound,
// so T0 is the only place left to land.
router.post(
  "/claims/:accountId/revoke",
  asyncHandler(async (req, res) => {
    const account = await prisma.account.findUnique({ where: { id: req.params.accountId } });
    if (!account || account.claimStatus !== "approved") {
      return res.status(404).json({ error: "No approved claim found for this account." });
    }

    const { business } = await revokeApprovedClaim({
      accountId: account.id,
      businessId: account.businessId,
    });

    res.json({ ok: true, business });
  }),
);

router.post(
  "/businesses/:id/verify-ssm",
  asyncHandler(async (req, res) => {
    const business = await prisma.business.findUnique({ where: { id: req.params.id } });
    if (!business || business.tier !== "T1") {
      return res.status(400).json({ error: "Business must be claimed (T1) before SSM verification." });
    }
    const updated = await prisma.business.update({ where: { id: business.id }, data: { tier: "T2" } });
    res.json({ business: updated });
  }),
);

router.post(
  "/businesses/:id/revoke-ssm",
  asyncHandler(async (req, res) => {
    const business = await prisma.business.findUnique({ where: { id: req.params.id } });
    if (!business || business.tier !== "T2") {
      return res.status(400).json({ error: "Business isn't currently SSM-verified." });
    }
    const updated = await prisma.business.update({ where: { id: business.id }, data: { tier: "T1" } });
    res.json({ business: updated });
  }),
);

export { router as adminRouter };
