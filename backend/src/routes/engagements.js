import { Router } from "express";

import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { createActivityEvent } from "../lib/activityEvents.js";
import { canonicalService } from "../lib/serviceVocab.js";
import { UNCLAIMED } from "../lib/verificationLevels.js";
import {
  ENGAGEMENT_INCLUDE,
  applyExpiryIfNeeded,
  counterpartyIdOf,
  serializeEngagement,
  orderedPair,
} from "../lib/engagements.js";

const router = Router();

// Engagements — "we worked together" records, confirmed by both sides.
//
// THE WHOLE FILE TURNS ON ONE RULE: the business that PROPOSED an engagement
// can never be the one that confirms it. Every route below re-derives that
// from Engagement.proposedById rather than trusting anything the client sends,
// because an engagement a business can confirm alone is a self-nomination with
// extra steps, and a self-nomination is exactly what this record must not be.

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

// The caller's own business, refused unless it is claimed.
//
// An L0 listing has no account and therefore nobody who could ever confirm,
// so an engagement naming one would sit pending until it lapsed. Refusing at
// the door is the honest version of that.
async function ownBusiness(req) {
  if (!req.account.businessId) fail(400, "You need a claimed business to do this.");
  const business = await prisma.business.findUnique({ where: { id: req.account.businessId } });
  if (!business) fail(400, "You need a claimed business to do this.");
  if (business.verificationLevel === UNCLAIMED) {
    fail(400, "Your business needs to be claimed before you can log work.");
  }
  return business;
}

// Loads an engagement the caller is actually part of, expiry swept first.
// Returns 404 rather than 403 for one the caller has no part in: whether a
// given engagement exists between two other businesses is not this caller's
// business, and a 403 would confirm it does.
async function ownEngagement(req, own) {
  const row = await prisma.engagement.findUnique({
    where: { id: req.params.id },
    include: ENGAGEMENT_INCLUDE,
  });
  if (!row) fail(404, "Engagement not found.");
  if (row.businessAId !== own.id && row.businessBId !== own.id) {
    fail(404, "Engagement not found.");
  }
  return applyExpiryIfNeeded(row);
}

// Propose one.
router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const own = await ownBusiness(req);
    const { businessId, service, note, occurredOn, serviceProvidedById } = req.body ?? {};

    if (!businessId) fail(400, "Say which business you worked with.");
    if (businessId === own.id) fail(400, "You can't log working with yourself.");

    const other = await prisma.business.findUnique({ where: { id: businessId } });
    if (!other) fail(404, "Business not found.");
    if (other.verificationLevel === UNCLAIMED) {
      // Nobody there to agree. Named plainly so the member knows it is about
      // the other business's state, not a rejection of their record.
      fail(400, "That listing hasn't been claimed yet, so nobody can confirm this.");
    }

    // Validated against the catalogue, not accepted as typed: a service
    // nothing else can hold is a row that can never appear in an aggregate.
    let canonical = null;
    if (service !== undefined && service !== null && service !== "") {
      canonical = canonicalService(service);
      if (!canonical) fail(400, `"${service}" isn't a service we can record work against.`);
    }

    // WHICH END DELIVERED IT. Defaults to the OTHER business rather than the
    // caller, because that is what this flow has always meant: the dialog only
    // ever offered services from the target's catalogue ("logging 'SST
    // advisory' against a law firm because the logger is an accountant would
    // put a service on their profile they do not offer"). The default keeps
    // every existing client correct without a change; the explicit value is
    // for the logger who did the work themselves.
    //
    // Constrained to the two parties, never a third business — the invariant
    // the column comment states and the DB cannot cheaply enforce.
    let provider = null;
    if (canonical) {
      provider = serviceProvidedById ?? other.id;
      if (provider !== own.id && provider !== other.id) {
        fail(400, "Only the two businesses on an engagement can have delivered it.");
      }
    } else if (serviceProvidedById) {
      // Naming a provider with no service to provide is a contradiction, and
      // silently dropping it would leave the caller thinking it stuck.
      fail(400, "Say which service was delivered before saying who delivered it.");
    }

    // Month precision, normalised to the first of the month. See the column
    // comment: a false day-level precision invites disputes about the day.
    const when = new Date(occurredOn);
    if (Number.isNaN(when.getTime())) fail(400, "Say roughly when the work happened.");
    const month = new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), 1));
    // A month in the future is not a record of work, it is a plan.
    const thisMonth = new Date();
    if (month > new Date(Date.UTC(thisMonth.getUTCFullYear(), thisMonth.getUTCMonth(), 1))) {
      fail(400, "That month hasn't happened yet.");
    }

    if (typeof note === "string" && note.length > 280) {
      fail(400, "Keep the note to 280 characters or fewer.");
    }


    const engagement = await prisma.engagement.create({
      data: {
        ...orderedPair(own.id, other.id),
        proposedById: own.id,
        service: canonical,
        serviceProvidedById: provider,
        note: typeof note === "string" && note.trim() ? note.trim() : null,
        occurredOn: month,
      },
      include: ENGAGEMENT_INCLUDE,
    });

    await createActivityEvent(prisma, {
      businessId: other.id,
      actorBusinessId: own.id,
      type: "engagement_proposed",
    });

    res.status(201).json({ engagement: serializeEngagement(engagement, own.id) });
  }),
);

// Confirm. The counterparty's move, and never the proposer's.
router.post(
  "/:id/confirm",
  requireAuth,
  asyncHandler(async (req, res) => {
    const own = await ownBusiness(req);
    const engagement = await ownEngagement(req, own);

    if (engagement.proposedById === own.id) {
      fail(403, "The other business has to confirm this one.");
    }
    if (engagement.status !== "pending") {
      fail(409, `This engagement is already ${engagement.status}.`);
    }

    const updated = await prisma.engagement.update({
      where: { id: engagement.id },
      data: { status: "confirmed", confirmedAt: new Date(), lastActionAt: new Date() },
      include: ENGAGEMENT_INCLUDE,
    });
    await createActivityEvent(prisma, {
      businessId: engagement.proposedById,
      actorBusinessId: own.id,
      type: "engagement_confirmed",
    });

    res.json({ engagement: serializeEngagement(updated, own.id) });
  }),
);

// Decline. TERMINAL AND PRIVATE — see the status comment on the model. Only
// the proposer is told, and the row is shown to nobody and counted nowhere.
router.post(
  "/:id/decline",
  requireAuth,
  asyncHandler(async (req, res) => {
    const own = await ownBusiness(req);
    const engagement = await ownEngagement(req, own);

    if (engagement.proposedById === own.id) {
      fail(403, "You proposed this one — withdraw it instead.");
    }
    if (engagement.status !== "pending") {
      fail(409, `This engagement is already ${engagement.status}.`);
    }

    const updated = await prisma.engagement.update({
      where: { id: engagement.id },
      data: { status: "declined", lastActionAt: new Date() },
      include: ENGAGEMENT_INCLUDE,
    });
    await createActivityEvent(prisma, {
      businessId: engagement.proposedById,
      actorBusinessId: own.id,
      type: "engagement_declined",
    });

    res.json({ engagement: serializeEngagement(updated, own.id) });
  }),
);

// Withdraw. The proposer's move, while it is still pending.
//
// Deleted rather than moved to "cancelled": a proposal nobody answered is not
// a fact about the relationship, and keeping it would leave the counterparty's
// Inbox history full of things that never happened. A lapse is different —
// that one is written as "cancelled" because the clock, not a person, ended it.
router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const own = await ownBusiness(req);
    const engagement = await ownEngagement(req, own);

    if (engagement.proposedById !== own.id) {
      fail(403, "Only the business that proposed this can withdraw it.");
    }
    if (engagement.status !== "pending") {
      fail(409, `This engagement is already ${engagement.status}.`);
    }

    await prisma.engagement.delete({ where: { id: engagement.id } });
    res.json({ ok: true });
  }),
);

// The caller's own, both directions. `?status=` narrows; without it every
// status the caller is party to comes back, because their own declined and
// lapsed rows are theirs to see even though nobody else's are.
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const own = await ownBusiness(req);
    const { status } = req.query;

    const rows = await prisma.engagement.findMany({
      where: {
        OR: [{ businessAId: own.id }, { businessBId: own.id }],
        ...(status ? { status } : {}),
      },
      include: ENGAGEMENT_INCLUDE,
      orderBy: [{ lastActionAt: "desc" }, { id: "desc" }],
    });

    // Swept on read, the same shape routes/vouches.js uses:
    // there is no cron, so the list read is where a lapse gets noticed.
    const swept = await Promise.all(rows.map(applyExpiryIfNeeded));
    res.json({ engagements: swept.map((e) => serializeEngagement(e, own.id)) });
  }),
);

export { router as engagementRouter };
