import { Router } from "express";

import { prisma } from "../prisma.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { signSessionToken } from "../lib/jwt.js";
import { setSessionCookie, clearSessionCookie } from "../lib/cookies.js";
import { serializeAccount } from "../lib/serialize.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { findOrCreateClaimTarget, approveClaimAndRejectRivals } from "../lib/businessClaim.js";

const router = Router();

const EMAIL_RE = /^\S+@\S+\.\S+$/;

// A bare self-serve signup — not a business claim — so there's no admin or
// domain-match check to wait on, just email ownership. Not expected to be
// clicked in one sitting the way the claim link is, so it gets a longer
// window (24h — see MANUAL_APPROVAL_TOKEN_TTL_MS in routes/admin.js for the
// claim-side equivalent).
const REGISTER_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// Scope note: this only creates an Account. It does NOT yet create/claim a
// Business or gate login behind admin approval the way the frontend's
// claimOrRegister does — that whole state machine (claim → pending →
// approved → SSM-verified) is the next piece of work, built on top of this.
router.post("/register", asyncHandler(async (req, res) => {
  const { email, password, name, phone, role } = req.body ?? {};

  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "Enter a valid email." });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }
  if (!name?.trim() || !phone?.trim() || !role?.trim()) {
    return res.status(400).json({ error: "Name, phone, and role are required." });
  }

  const existing = await prisma.account.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists." });
  }

  const passwordHash = await hashPassword(password);
  const account = await prisma.account.create({
    data: { email, phone, name, role, passwordHash },
  });

  // Not logged in yet — login is gated on emailVerified (see /login below),
  // so this mints the same kind of confirmation token as the claim paths.
  // TODO: email this link once a provider is wired up — for now, return the
  // token directly (same placeholder as the claim paths).
  const tokenRecord = await prisma.emailVerificationToken.create({
    data: {
      email: account.email,
      accountId: account.id,
      expiresAt: new Date(Date.now() + REGISTER_TOKEN_TTL_MS),
    },
  });

  res
    .status(201)
    .json({ requiresEmailVerification: true, account: serializeAccount(account), token: tokenRecord.token });
}));

router.post("/login", asyncHandler(async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const account = await prisma.account.findUnique({ where: { email } });
  // Same error either way — confirming which emails exist is its own leak.
  if (!account || !(await verifyPassword(password, account.passwordHash))) {
    return res.status(401).json({ error: "Incorrect email or password." });
  }
  // Safe to be specific here — they've already proven they own the
  // password, so this can't be used to probe which emails are registered.
  if (!account.emailVerified) {
    return res.status(403).json({ error: "Please verify your email before logging in.", requiresEmailVerification: true });
  }

  setSessionCookie(res, signSessionToken(account.id));
  res.json({ account: serializeAccount(account) });
}));

router.post("/logout", (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ account: serializeAccount(req.account) });
});

// Consumes a link minted by either claim path (see EmailVerificationToken
// in schema.prisma for the two shapes):
//  - claimPayload set: domain-match path — nothing exists yet; this is what
//    actually creates the account/business, auto-approves the claim, and
//    logs in.
//  - accountId set: manual-review path (token minted by an admin approving
//    a pending claim, once that endpoint exists) — account/business
//    already exist and are already approved; this just confirms email
//    ownership and logs in.
router.post("/verify-claim/:token", asyncHandler(async (req, res) => {
  const record = await prisma.emailVerificationToken.findUnique({
    where: { token: req.params.token },
  });
  if (!record) {
    return res.status(404).json({ error: "This verification link is invalid." });
  }
  if (record.consumed) {
    return res.status(400).json({ error: "This verification link has already been used." });
  }
  if (record.expiresAt < new Date()) {
    return res.status(400).json({ error: "This verification link has expired." });
  }

  await prisma.emailVerificationToken.update({
    where: { token: record.token },
    data: { consumed: true },
  });

  if (record.claimPayload) {
    const { businessId, businessName, category, location, ssm, repName, repEmail, repPhone, repRole, passwordHash } =
      record.claimPayload;

    const targetBusiness = await findOrCreateClaimTarget({ businessId, businessName, category, location, ssm });

    const pendingAccount = await prisma.account.create({
      data: {
        email: repEmail,
        phone: repPhone,
        name: repName,
        role: repRole,
        passwordHash,
        businessId: targetBusiness.id,
        claimStatus: "pending",
        emailVerified: true,
        phoneVerified: false,
      },
    });

    // Domain-match is strong enough proof to win outright — this resolves
    // the claim immediately and rejects (deletes) any other pending,
    // unverified claims sitting on the same business.
    const { account, business } = await approveClaimAndRejectRivals({
      accountId: pendingAccount.id,
      businessId: targetBusiness.id,
      verificationMethod: "domain-auto",
    });

    setSessionCookie(res, signSessionToken(account.id));
    return res.json({ account: serializeAccount(account), business });
  }

  const account = await prisma.account.findUnique({ where: { id: record.accountId } });
  if (!account) {
    return res.status(404).json({ error: "Account not found." });
  }

  const verified = await prisma.account.update({
    where: { id: account.id },
    data: { emailVerified: true },
  });

  setSessionCookie(res, signSessionToken(verified.id));
  res.json({ account: serializeAccount(verified) });
}));

export { router as authRouter };
