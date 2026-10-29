import { Router } from "express";

import { prisma } from "../prisma.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { clearSessionCookie } from "../lib/cookies.js";
import { serializeAccount } from "../lib/serialize.js";
import { loadAccountView } from "../lib/accountView.js";
import { startSession } from "../lib/session.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sendVerificationEmail, devOnlyToken } from "../lib/mailer.js";
import { findOrCreateClaimTarget, approveClaimAndRejectRivals } from "../lib/businessClaim.js";
import { matchesListingEmail } from "../lib/claimCode.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { CLAIM_TOKEN_TTL_MS } from "../lib/tokens.js";

const router = Router();

const EMAIL_RE = /^\S+@\S+\.\S+$/;

// A bare self-serve signup — not a business claim — so there's no admin or
// domain-match check to wait on, just email ownership. Not expected to be
// clicked in one sitting the way the claim link is, so it gets a longer
// window (24h — see MANUAL_APPROVAL_TOKEN_TTL_MS in routes/admin.js for the
// claim-side equivalent).
const REGISTER_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// A reset link is as good as the password, so it closes quickly.
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

// The shortest gap between two emails to the same address from the resend
// and reset routes. Checked against the newest token's createdAt rather than
// held in memory, so it holds per address and survives a deploy.
const RESEND_COOLDOWN_MS = 60 * 1000;
const COOLDOWN_ERROR = "We just sent one. Wait a minute before asking again.";

const recentlySent = (newest) => Boolean(newest && Date.now() - newest.createdAt.getTime() < RESEND_COOLDOWN_MS);

// A fresh "confirm your account" link for an account that exists but never
// confirmed. Older unused links for it are cancelled so only the newest one
// in the inbox works.
async function sendAccountConfirmation(account) {
  await prisma.emailVerificationToken.deleteMany({ where: { accountId: account.id, consumed: false } });
  const tokenRecord = await prisma.emailVerificationToken.create({
    data: {
      email: account.email,
      accountId: account.id,
      expiresAt: new Date(Date.now() + REGISTER_TOKEN_TTL_MS),
    },
  });
  await sendVerificationEmail({
    to: account.email,
    subject: "Confirm your ABRI account",
    heading: "Confirm your account",
    message: "Click below to verify your email and log in.",
    link: `${process.env.FRONTEND_URL}/verify-claim/${tokenRecord.token}`,
  });
  return tokenRecord;
}

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
  // so this mints the same kind of confirmation token as the claim paths,
  // and is also returned directly below (handy for local dev when
  // no mail is set up — see lib/mailer.js devOnlyToken).
  const tokenRecord = await sendAccountConfirmation(account);

  res
    .status(201)
    .json({ requiresEmailVerification: true, account: serializeAccount(account), token: devOnlyToken(tokenRecord.token) });
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

  res.json(await startSession(res, account.id));
}));

// "Send a new confirmation link", from two places a person gets stuck:
//  - { email, password }: the login screen, after "please verify". The
//    password is checked first, so this can't be used to flood a stranger's
//    inbox or to find out which emails are registered.
//  - { token }: the page an old link lands on. Having the link proves the
//    inbox, so the new one goes to the same address with nothing to type.
//    An auto-approve claim link (claimPayload) is re-sent as the same claim;
//    nothing was created for it yet, so it only ever needed a new expiry.
router.post("/resend-verification", asyncHandler(async (req, res) => {
  const { email, password, token } = req.body ?? {};

  let account;
  if (token) {
    const record = await prisma.emailVerificationToken.findUnique({ where: { token: String(token) } });
    if (!record) return res.status(404).json({ error: "This verification link is invalid." });
    if (record.consumed) {
      return res.status(400).json({ error: "This link has already been used. Log in instead." });
    }

    if (record.claimPayload) {
      if (await prisma.account.findUnique({ where: { email: record.email } })) {
        return res.status(409).json({ error: "An account with this email already exists. Log in instead." });
      }
      const newest = await prisma.emailVerificationToken.findFirst({
        where: { email: record.email }, orderBy: { createdAt: "desc" },
      });
      if (recentlySent(newest)) return res.status(429).json({ error: COOLDOWN_ERROR });

      await prisma.emailVerificationToken.deleteMany({
        // Claim links are the ones with no account behind them yet.
        where: { email: record.email, consumed: false, accountId: null },
      });
      const fresh = await prisma.emailVerificationToken.create({
        data: {
          email: record.email,
          businessId: record.businessId,
          claimPayload: record.claimPayload,
          expiresAt: new Date(Date.now() + CLAIM_TOKEN_TTL_MS),
        },
      });
      const businessName = record.claimPayload.businessName ?? "your business";
      await sendVerificationEmail({
        to: record.email,
        subject: `Confirm your claim on ${businessName}`,
        heading: "Confirm your claim",
        message: `Here is a new link for your claim on ${businessName}. Click below to verify your email and log in.`,
        link: `${process.env.FRONTEND_URL}/verify-claim/${fresh.token}`,
      });
      return res.json({ ok: true, token: devOnlyToken(fresh.token) });
    }

    account = await prisma.account.findUnique({ where: { id: record.accountId } });
    if (!account) return res.status(404).json({ error: "Account not found." });
  } else {
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }
    account = await prisma.account.findUnique({ where: { email } });
    // The same answer as /login, for the same reason.
    if (!account || !(await verifyPassword(password, account.passwordHash))) {
      return res.status(401).json({ error: "Incorrect email or password." });
    }
  }

  if (account.emailVerified) {
    return res.status(400).json({ error: "Your email is already confirmed. Log in instead." });
  }
  const newest = await prisma.emailVerificationToken.findFirst({
    where: { email: account.email }, orderBy: { createdAt: "desc" },
  });
  if (recentlySent(newest)) return res.status(429).json({ error: COOLDOWN_ERROR });

  const tokenRecord = await sendAccountConfirmation(account);
  res.json({ ok: true, token: devOnlyToken(tokenRecord.token) });
}));

// The same answer whether or not the email has an account, so this can't be
// used to find out who is registered. The per-IP limit is for someone
// trying many addresses; the per-account cooldown is for one inbox.
router.post(
  "/forgot-password",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: "Too many reset requests. Wait a few minutes and try again.",
  }),
  asyncHandler(async (req, res) => {
    const email = String(req.body?.email ?? "").trim();
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: "Enter a valid email." });
    }
    const sent = { ok: true, message: "If an account exists for that email, we've sent a link to reset your password." };

    const account = await prisma.account.findUnique({ where: { email } });
    if (!account) return res.json(sent);
    const newest = await prisma.passwordResetToken.findFirst({
      where: { accountId: account.id }, orderBy: { createdAt: "desc" },
    });
    if (recentlySent(newest)) return res.json(sent);

    await prisma.passwordResetToken.deleteMany({ where: { accountId: account.id, consumed: false } });
    const record = await prisma.passwordResetToken.create({
      data: { accountId: account.id, expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
    });
    await sendVerificationEmail({
      to: account.email,
      subject: "Reset your ABRI password",
      heading: "Reset your password",
      message: "Click below to choose a new password. The link works for one hour. If you didn't ask for this, you can ignore this email.",
      link: `${process.env.FRONTEND_URL}/reset-password/${record.token}`,
    });
    res.json({ ...sent, token: devOnlyToken(record.token) });
  }),
);

// Opening the link proves the inbox, so this also confirms the email: an
// account that never clicked its confirmation link is unstuck by a reset.
router.post("/reset-password/:token", asyncHandler(async (req, res) => {
  const record = await prisma.passwordResetToken.findUnique({ where: { token: req.params.token } });
  if (!record) return res.status(404).json({ error: "This reset link is invalid." });
  if (record.consumed || record.expiresAt < new Date()) {
    return res.status(400).json({ error: "This reset link has expired or was already used.", expired: true });
  }
  const { password } = req.body ?? {};
  if (!password || password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }

  await prisma.$transaction([
    prisma.account.update({
      where: { id: record.accountId },
      data: { passwordHash: await hashPassword(password), emailVerified: true },
    }),
    prisma.passwordResetToken.updateMany({ where: { accountId: record.accountId }, data: { consumed: true } }),
  ]);
  res.json(await startSession(res, record.accountId));
}));

router.post("/logout", (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get("/me", requireAuth, asyncHandler(async (req, res) => {
  res.json(await loadAccountView(req.account.id));
}));

// Consumes a link minted by either claim path (see EmailVerificationToken
// in schema.prisma for the two shapes):
//  - claimPayload set: domain-match or listing-email-match path — nothing
//    exists yet; this is what actually creates the account/business,
//    auto-approves the claim, and logs in.
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
    return res.status(400).json({ error: "This verification link has expired.", expired: true });
  }

  await prisma.emailVerificationToken.update({
    where: { token: record.token },
    data: { consumed: true },
  });

  if (record.claimPayload) {
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
      passwordHash,
      connectTargetId,
      // Tokens minted before email-match existed carry none: domain-match.
      verificationMethod = "domain-auto",
    } = record.claimPayload;

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
        claimSsm: ssm ? String(ssm).trim() : null,
        emailVerified: true,
        phoneVerified: false,
      },
    });

    // The listing's email can change in the minutes the link is open (an
    // admin edit, a re-import), and approval rests on it being THEIR inbox,
    // so it is checked again now. If it no longer holds, the claim stays
    // pending for the admin, the same as any non-matching claim — the email
    // is still confirmed, so they are logged in to the limited app.
    const stillMatches =
      verificationMethod !== "email-match" || (await matchesListingEmail(repEmail, targetBusiness));

    // Domain or listing-email match is strong enough proof to win outright —
    // this resolves the claim immediately and rejects any other pending
    // claims sitting on the same business.
    const account = stillMatches
      ? (
          await approveClaimAndRejectRivals({
            accountId: pendingAccount.id,
            businessId: targetBusiness.id,
            verificationMethod,
          })
        ).account
      : pendingAccount;

    // Queued rather than connected directly, even though the session starts
    // three lines below and could just as well do it here: this way the
    // domain-match path and the days-later manual-review path both connect
    // through the same code in consumeDeferredConnections, instead of one
    // rehearsed constantly and the other only in production.
    if (connectTargetId) {
      await prisma.deferredConnection
        .create({ data: { accountId: account.id, businessId: connectTargetId } })
        .catch((err) => console.error("Failed to queue connect intent", err));
    }

    return res.json(await startSession(res, account.id));
  }

  const account = await prisma.account.findUnique({ where: { id: record.accountId } });
  if (!account) {
    return res.status(404).json({ error: "Account not found." });
  }

  const verified = await prisma.account.update({
    where: { id: account.id },
    data: { emailVerified: true },
  });

  res.json(await startSession(res, verified.id));
}));

export { router as authRouter };
