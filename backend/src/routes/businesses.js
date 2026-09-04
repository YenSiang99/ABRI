import { Router } from "express";

import { prisma } from "../prisma.js";
import { hashPassword } from "../lib/password.js";
import { matchesBusinessDomain } from "../lib/domainVerification.js";
import { findOrCreateClaimTarget } from "../lib/businessClaim.js";
import { serializeAccount } from "../lib/serialize.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sendVerificationEmail } from "../lib/mailer.js";
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { messageFor, pruneActivityEvents } from "../lib/activityEvents.js";
import { vouchLevelFor } from "../lib/vouchLevel.js";
import { publicBusinessView } from "../lib/accountView.js";
import { can } from "../lib/entitlements.js";
import { contactVisibility } from "../lib/contactVisibility.js";
import { normalizeBusinessEdit } from "../lib/contactFields.js";
import { isValidCategory, isValidLocation } from "../lib/businessVocab.js";
import { loadAccountView } from "../lib/accountView.js";
import { UNCLAIMED } from "../lib/verificationLevels.js";

const router = Router();

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const CLAIM_TOKEN_TTL_MS = 15 * 60 * 1000;

// Validates the "connect me to this business once I'm in" hint that rides
// along with a claim submitted off a card tap. Returns the id if it's still
// worth acting on, or null — never throws, because every way this can fail
// is somebody else's stale link, not a problem with the claim being made.
async function resolveConnectTarget(connectTargetId, claimedBusinessId) {
  if (!connectTargetId || connectTargetId === claimedBusinessId) return null;
  const target = await prisma.business.findUnique({ where: { id: connectTargetId } });
  // T0 means unclaimed, and POST /connections refuses those too — no point
  // queueing an intent that would be dropped on the way out.
  if (!target || target.verificationLevel === UNCLAIMED) return null;
  return target.id;
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { search, verificationLevel } = req.query;
    const businesses = await prisma.business.findMany({
      where: {
        // NOTE: an unrecognised query key is simply NO FILTER here, not a
        // 400 — so a client and server that disagree about this param name
        // fail silently and wide. That is not hypothetical: Register.jsx
        // filters on UNCLAIMED to find claimable listings, and a dropped
        // filter there offers already-claimed businesses for claiming.
        // Renaming this param means renaming lib/api/businesses.js in the
        // same commit.
        ...(verificationLevel ? { verificationLevel } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { category: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        _count: {
          select: {
            vouchesReceived: { where: { status: "published" } },
            // Needed for the top vouch level, which is 25 received AND 10
            // given. Counting only one direction caps every business at
            // "trusted" with nothing to show it happened.
            vouchesGiven: { where: { status: "published" } },
          },
        },
      },
      orderBy: { name: "asc" },
    });
    res.json({
      // vouchLevel alongside vouchCount — components like VouchBadge assume
      // every business object carries both (see
      // components/badge/VouchBadge.jsx, which indexes an icon map by
      // vouchLevel; it now falls back rather than throwing, but shipping the
      // field is still the contract).
      // Contact details are stripped UNCONDITIONALLY here, which is why this
      // route needs no optionalAuth and no contactLocked flag: it has no
      // viewer-dependent behaviour at all, and identical output for everyone
      // is the assertion that keeps it that way.
      //
      // Two reasons. BusinessCard.jsx renders name/category/location/level/
      // vouchCount and has nowhere to put a phone number, so nothing here
      // would read them. And shipping every listing's phone number to every
      // session would be the best scraping surface in the app, built to serve
      // a card that doesn't display it — which is the precise thing the
      // logged-in half of the gate exists to prevent.
      //
      // The trade-off, stated so it can be revisited deliberately: a future
      // "call" button on directory cards is a change to THIS route, and that
      // is the right moment to decide whether the gated surface should grow
      // past the single profile route it occupies today.
      businesses: businesses.map(({ _count, ...business }) => ({
        ...publicBusinessView(business),
        vouchCount: _count.vouchesReceived,
        vouchLevel: vouchLevelFor({
          received: _count.vouchesReceived,
          given: _count.vouchesGiven,
        }),
      })),
    });
  }),
);

// optionalAuth, not requireAuth: this is a public route — it serves both the
// profile page and the NFC tap page (/m/:businessId resolves through it) — but
// it withholds contact details from anonymous visitors, so it has to be able
// to tell an anonymous visitor from a logged-in member. req.account is null
// rather than undefined here, and must be read as req.account?.something.
router.get(
  "/:id",
  optionalAuth,
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
            fromBusiness: { select: { id: true, name: true, category: true, verificationLevel: true } },
            currentRevision: { select: { comment: true } },
          },
        },
      },
    });
    if (!business) return res.status(404).json({ error: "Business not found." });

    // Read the plan off the RAW row: publicBusinessView strips
    // membershipTier, so asking can() about its output denies everything.
    const showTestimonials = can(business, "testimonials");

    // Deliberately adjacent to the line above, and for the same reason: this
    // reads the plan off the RAW row too. publicBusinessView strips
    // membershipTier, so a gate computed after it would see every business as
    // free and withhold from everyone.
    const contact = contactVisibility(business, req.account);

    // Sent explicitly rather than left for the client to infer from
    // vouchesReceived.length, which is what it used to do in three places.
    // The moment the array can be withheld, its length stops meaning "how
    // many vouches" — and the count is the half of this that every plan
    // keeps, so it must not travel inside the half that gets taken away.
    const vouchCount = business.vouchesReceived.length;

    // Flatten the live revision's text onto each vouch as `testimonial`.
    // The column of that name is gone (schema.prisma) — it was the copy a
    // revise overwrote — but the public shape is unchanged, so nothing
    // downstream needs to know a join happened.
    //
    // Withheld as an empty array rather than rows with `testimonial: null`:
    // the free tier shows a number and nothing else, and keeping the rows
    // would still publish who vouched and when.
    res.json({
      business: {
        ...publicBusinessView(business, { showContact: contact.visible }),
        vouchCount,
        testimonialsLocked: !showTestimonials,
        // Withheld the same way testimonials are — the keys are absent, not
        // null, so there is no masked value on the wire to un-mask.
        //
        // Both a boolean AND a reason. The boolean keeps the client's check
        // as `if (contactLocked)`, the same idiom as testimonialsLocked right
        // above it. The reason exists because the two locked states are
        // different messages: "owner_plan" is something the viewer can do
        // nothing about, while "viewer_anonymous" names a free action they
        // can take. With only a boolean the client's sole inference would be
        // "am I logged in?", which would render "log in to see this" on a
        // free owner's page too — promising something logging in does not
        // deliver.
        //
        // Note contactLocked false with all three fields null means the owner
        // hasn't added any. Withheld and empty must not render the same.
        contactLocked: !contact.visible,
        contactLockedReason: contact.reason,
        vouchesReceived: showTestimonials
          ? business.vouchesReceived.map(({ currentRevision, ...v }) => ({
              ...v,
              testimonial: currentRevision?.comment ?? null,
            }))
          : [],
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
        // Sent so the feed can mark which lines are new. Deliberately not
        // consumed here: reading the feed doesn't clear it, POST
        // /me/activity/read does. Otherwise the response that renders the
        // "new" highlights would be the same one that erases them.
        read: e.readAt !== null,
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

// The sidebar badge. Split from GET /me/activity because the sidebar renders
// on every /app/* page and only needs the number — pulling 20 rows and their
// actor joins to derive it would make the count the most expensive thing on
// pages that don't show the feed at all.
router.get(
  "/me/activity/unread-count",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.account.businessId) return res.json({ unread: 0 });

    const unread = await prisma.activityEvent.count({
      where: { businessId: req.account.businessId, readAt: null },
    });

    res.json({ unread });
  }),
);

// Marks everything currently unread as seen — the "Mark all read" escape
// hatch for events the member has no reason to open (a vouch that was
// cancelled, a connection they already know about). Opening a notification
// is what normally clears it; see POST /me/activity/:id/read below.
//
// `readAt: null` in the filter rather than blanket-updating the business's
// rows keeps this idempotent and cheap — a second call matches nothing and
// preserves the original timestamps.
router.post(
  "/me/activity/read",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.account.businessId) return res.json({ marked: 0 });

    const { count } = await prisma.activityEvent.updateMany({
      where: { businessId: req.account.businessId, readAt: null },
      data: { readAt: new Date() },
    });

    res.json({ marked: count });
  }),
);

// Marks one event read, which is what opening a notification does. Kept
// separate from the bulk route above because they answer different questions:
// this one means "I dealt with this", the other means "stop showing me these".
//
// updateMany rather than update-by-id so the businessId filter is part of the
// write itself — a member passing someone else's event id matches zero rows
// and gets `{ marked: 0 }`, rather than a 404 that would confirm the id
// exists, or worse a successful write on a feed that isn't theirs.
router.post(
  "/me/activity/:id/read",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.account.businessId) return res.json({ marked: 0 });

    const { count } = await prisma.activityEvent.updateMany({
      where: { id: req.params.id, businessId: req.account.businessId, readAt: null },
      data: { readAt: new Date() },
    });

    res.json({ marked: count });
  }),
);

// The owner edits their own business. Everything the profile page can change
// goes through here.
//
// "/me" rather than "/:id" so that "you can only edit your own business" is
// structural instead of a check that can be got wrong: the target comes from
// the session, so there is no id to compare against and no way to pass someone
// else's. Same reasoning as the /me/activity routes above. No collision with
// GET /:id — different verb — but if a PATCH /:id is ever added it has to be
// declared AFTER this one.
//
// Replaces a write that never reached the server: the Edit-profile dialog used
// to call updateBusinessProfile() from frontend/src/lib/store/businesses.js,
// which put description and services into localStorage that nothing read back.
// It toasted "Profile updated" and changed nothing.
router.patch(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.account.businessId) {
      return res.status(403).json({ error: "Your account isn't attached to a business yet." });
    }

    // LOAD-BEARING, and it will look redundant — read this before deleting it.
    //
    // Account.businessId is set for PENDING claimants too: POST /claim's
    // manual-review branch (below) creates the account with businessId already
    // populated and claimStatus "pending". So "has a businessId" is NOT "owns
    // this business".
    //
    // Today nothing can reach this line with a pending claim, because that
    // same branch sets emailVerified false and POST /auth/login refuses to
    // start a session for an unverified account. That invariant lives in a
    // different file, which is exactly why this check is here and not assumed:
    // if login ever loosens by a line — say, to let a claimant in to watch
    // their own claim — its absence is a stranger publishing contact details
    // on a business they merely applied for.
    if (req.account.claimStatus !== "approved") {
      return res.status(403).json({ error: "Your claim on this business hasn't been approved yet." });
    }

    const { data, error } = normalizeBusinessEdit(req.body);
    if (error) return res.status(400).json({ error });

    await prisma.business.update({
      where: { id: req.account.businessId },
      data,
    });

    // Same shape as GET /auth/me, so the client re-uses refreshAccount() and
    // there is no second response shape to keep in step. loadAccountView is
    // already described as the single source of truth for what a logged-in
    // account gets back.
    res.json(await loadAccountView(req.account.id));
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
      connectTargetId,
    } = req.body ?? {};

    if (!businessName?.trim() || !category?.trim() || !location?.trim()) {
      return res.status(400).json({ error: "Business name, category, and location are required." });
    }
    // Both are closed lists (lib/businessVocab.js), and this is the only route
    // that writes them. Checked on the server rather than trusted from the
    // form: the directory filters and groups on these two columns by exact
    // equality, so a value that isn't in the list is a business nothing can
    // ever match, and nothing about that failure is visible to them.
    if (!isValidCategory(category.trim())) {
      return res.status(400).json({ error: "Pick a category from the list." });
    }
    if (!isValidLocation(location.trim())) {
      return res.status(400).json({ error: "Pick a location from the list." });
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

    // Someone who tapped a card while logged out arrives here with the
    // tapped business in tow (/register?connect=<id>), and expects to be
    // connected to it once they're in. That can't happen now — neither the
    // account nor the approval exists yet — so the intent is parked and
    // consumed at their first session (see lib/session.js).
    //
    // Resolved best-effort and dropped silently if it doesn't hold up: a
    // stale or hand-edited query param is not a reason to block somebody
    // from registering their business.
    const connectTarget = await resolveConnectTarget(connectTargetId, businessId);

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
      // Carried through the token rather than a DeferredConnection row: on
      // this path there is no account to hang one off yet. verify-claim
      // turns it into a row moments before startSession consumes it.
      connectTargetId: connectTarget,
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

    // The account exists from here on, so the connect intent gets a real
    // row to hang off — unlike the domain-match branch above, this claim
    // can sit in an admin queue for days before its first session.
    // Guarded: a queued nicety must never sink the claim it rode in on.
    if (connectTarget) {
      await prisma.deferredConnection
        .create({ data: { accountId: account.id, businessId: connectTarget } })
        .catch((err) => console.error("Failed to queue connect intent", err));
    }

    // publicBusinessView, not the raw row. This response goes to whoever
    // POSTed the claim, BEFORE any approval — so before this, any stranger
    // could claim an existing listing and read back that business's four
    // billing columns. With contact columns on the same row it would have
    // handed over the phone, WhatsApp and email too.
    //
    // On the brand-new-business path the columns are all null anyway; the leak
    // was only ever real on the claim-an-existing-listing path, and fixing it
    // at the response covers both. Safe to narrow: AuthContext.claimOrRegister
    // reads only requiresEmailVerification and token off this payload.
    res.status(201).json({
      requiresAdminApproval: true,
      account: serializeAccount(account),
      business: publicBusinessView(business),
    });
  }),
);

export { router as businessRouter };