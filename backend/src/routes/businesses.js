import { Router } from "express";

import { prisma } from "../prisma.js";
import { hashPassword } from "../lib/password.js";
import { matchesBusinessDomain } from "../lib/domainVerification.js";
import { findOrCreateClaimTarget } from "../lib/businessClaim.js";
import { serializeAccount } from "../lib/serialize.js";
import { asyncHandler } from "../lib/asyncHandler.js";

const router = Router();

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const CLAIM_TOKEN_TTL_MS = 15 * 60 * 1000;

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { search, tier } = req.query;
    const businesses = await prisma.business.findMany({
      where: {
        ...(tier ? { tier } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { category: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { _count: { select: { vouchesReceived: true } } },
      orderBy: { name: "asc" },
    });
    res.json({
      businesses: businesses.map(({ _count, ...business }) => ({
        ...business,
        vouchCount: _count.vouchesReceived,
      })),
    });
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const business = await prisma.business.findUnique({
      where: { id: req.params.id },
      include: {
        vouchesReceived: {
          include: { fromBusiness: { select: { id: true, name: true, category: true } } },
        },
      },
    });
    if (!business) return res.status(404).json({ error: "Business not found." });
    res.json({ business });
  }),
);

// Scope note: this only covers submission. It always ends in one of two
// states — a token waiting to be opened (domain match), or a pending
// account waiting on an admin (no domain match) — never an immediate
// login. Multiple accounts can hold pending claims on the same business
// at once (see schema.prisma) — this only rejects a claim outright once
// the business already has an approved owner.
router.post(
  "/claim",
  asyncHandler(async (req, res) => {
    const {
      businessId,
      businessName,
      category,
      location,
      ssm,
      repName,
      repEmail,
      repPhone,
      repRole,
      password,
    } = req.body ?? {};

    if (!businessName?.trim() || !category?.trim() || !location?.trim()) {
      return res.status(400).json({ error: "Business name, category, and location are required." });
    }
    if (!repEmail || !EMAIL_RE.test(repEmail)) {
      return res.status(400).json({ error: "Enter a valid email." });
    }
    if (!repName?.trim() || !repPhone?.trim() || !repRole?.trim()) {
      return res.status(400).json({ error: "Your name, phone, and role are required." });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }

    const existingAccount = await prisma.account.findUnique({ where: { email: repEmail } });
    if (existingAccount) {
      return res.status(409).json({ error: "An account with this email already exists — log in instead." });
    }

    // Resolve the business's known domain BEFORE creating/mutating
    // anything — a manually-registered business has none (always manual
    // review); an existing listing might. Only rejected here if it's
    // already fully claimed — a listing with other pending claims on it
    // is still fair game (see findOrCreateClaimTarget for why).
    let knownDomain = null;
    if (businessId) {
      const existingBusiness = await prisma.business.findUnique({ where: { id: businessId } });
      if (!existingBusiness) {
        return res.status(400).json({ error: "This listing isn't available to claim." });
      }
      const alreadyApproved = await prisma.account.findFirst({
        where: { businessId, claimStatus: "approved" },
      });
      if (alreadyApproved) {
        return res.status(400).json({ error: "This business has already been claimed." });
      }
      knownDomain = existingBusiness.domain;
    }

    const passwordHash = await hashPassword(password);
    const claimPayload = {
      businessId,
      businessName,
      category,
      location,
      ssm,
      repName,
      repEmail,
      repPhone,
      repRole,
      passwordHash,
    };

    if (matchesBusinessDomain(repEmail, knownDomain)) {
      // Nothing is created yet — consuming the link (POST
      // /auth/verify-claim/:token) is what creates the account/business
      // and auto-approves + logs in.
      // TODO: actually send this by email once a provider is wired up —
      // for now, return the token directly so it can be "opened" without one.
      const record = await prisma.emailVerificationToken.create({
        data: {
          email: repEmail,
          businessId: businessId ?? null,
          claimPayload,
          expiresAt: new Date(Date.now() + CLAIM_TOKEN_TTL_MS),
        },
      });
      return res.json({ requiresEmailVerification: true, token: record.token });
    }

    const business = await findOrCreateClaimTarget({ businessId, businessName, category, location, ssm });
    const account = await prisma.account.create({
      data: {
        email: repEmail,
        phone: repPhone,
        name: repName,
        role: repRole,
        passwordHash,
        businessId: business.id,
        claimStatus: "pending",
        verificationMethod: null,
        emailVerified: false,
        // No SMS/OTP provider wired up yet — this stays false until that's
        // built (the frontend mock faked it by accepting any 4+ digit code).
        phoneVerified: false,
      },
    });

    res.status(201).json({ requiresAdminApproval: true, account: serializeAccount(account), business });
  }),
);

export { router as businessRouter };