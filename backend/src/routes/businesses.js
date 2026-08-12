import { Router } from "express";

import { prisma } from "../prisma.js";
import { hashPassword } from "../lib/password.js";
import { matchesBusinessDomain } from "../lib/domainVerification.js";
import { findOrCreateClaimTarget } from "../lib/businessClaim.js";
import { serializeAccount } from "../lib/serialize.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sendVerificationEmail } from "../lib/mailer.js";
import { requireAuth } from "../middleware/auth.js";
import { messageFor, pruneActivityEvents } from "../lib/activityEvents.js";
import { ladderFor } from "../lib/vouchLadder.js";

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
      include: { _count: { select: { vouchesReceived: { where: { status: "published" } } } } },
      orderBy: { name: "asc" },
    });
    res.json({
      // ladder alongside vouchCount — components like VouchBadge assume
      // every business object carries both (see
      // components/badge/VouchBadge.jsx, which indexes an icon map by
      // ladder with no undefined fallback).
      businesses: businesses.map(({ _count, ...business }) => ({
        ...business,
        vouchCount: _count.vouchesReceived,
        ladder: ladderFor(_count.vouchesReceived),
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
        // Public profile — only ever show vouches the receiver has
        // actually accepted (see the Vouch review state machine in
        // schema.prisma). This route returns the raw business object
        // (not through serializeBusiness), so the filter has to happen
        // here rather than being inherited from a shared helper.
        vouchesReceived: {
          where: { status: "published" },
          include: {
            fromBusiness: { select: { id: true, name: true, category: true, tier: true } },
            currentRevision: { select: { comment: true } },
          },
        },
      },
    });
    if (!business) return res.status(404).json({ error: "Business not found." });

    // Flatten the live revision's text onto each vouch as `testimonial`.
    // The column of that name is gone (schema.prisma) — it was the copy a
    // revise overwrote — but the public shape is unchanged, so nothing
    // downstream needs to know a join happened.
    res.json({
      business: {
        ...business,
        vouchesReceived: business.vouchesReceived.map(({ currentRevision, ...v }) => ({
          ...v,
          testimonial: currentRevision?.comment ?? null,
        })),
      },
    });
  }),
);

// Powers Dashboard.jsx's "Recent activity" — the notify step of the
// give-first reciprocity loop (vouch -> notify -> thank -> vouch back).
// Two segments ("/me/activity"), so this never collides with GET /:id
// above, which only matches a single path segment.
router.get(
  "/me/activity",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.account.businessId) return res.json({ activity: [] });

    const events = await prisma.activityEvent.findMany({
      where: { businessId: req.account.businessId },
      include: { actorBusiness: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    res.json({
      activity: events.map((e) => ({
        id: e.id,
        type: e.type,
        actorId: e.actorBusinessId,
        actorName: e.actorBusiness?.name ?? null,
        message: messageFor(e.type, e.actorBusiness?.name),
        date: e.createdAt,
      })),
    });

    // Trim this business's backlog to the retention cap, after responding —
    // pruning is housekeeping, so it must never add latency to the feed or
    // fail the request. A no-op whenever the business is under the cap.
    // Runs here rather than in createActivityEvent so the delete stays off
    // the vouch write transactions; the tradeoff is that a business nobody
    // ever logs into never gets pruned (see PRUNING note in BACKEND_STATUS.md).
    pruneActivityEvents(prisma, req.account.businessId).catch(() => {});
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
      // and auto-approves + logs in. Also returned directly below (handy
      // for local dev when RESEND_API_KEY isn't set — see lib/mailer.js).
      const record = await prisma.emailVerificationToken.create({
        data: {
          email: repEmail,
          businessId: businessId ?? null,
          claimPayload,
          expiresAt: new Date(Date.now() + CLAIM_TOKEN_TTL_MS),
        },
      });

      await sendVerificationEmail({
        to: repEmail,
        subject: `Confirm your claim on ${businessName}`,
        heading: "Confirm your claim",
        message: `Your email matches ${businessName}'s domain, so your claim is auto-approved. Click below to verify your email and log in.`,
        link: `${process.env.FRONTEND_URL}/verify-claim/${record.token}`,
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