import { Router } from "express";

import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import {
  CONNECTION_SOURCES,
  CONNECTION_INCLUDE,
  orderedPair,
  serializeConnection,
  createConnection,
  acceptConnection,
  AUTO_ACCEPT_SOURCES,
} from "../lib/connections.js";
import { UNCLAIMED } from "../lib/verificationLevels.js";

const router = Router();

// A connection is a mutual edge stored once per pair (see schema.prisma),
// which shapes all three routes here:
//   - reads have to look at both ends of the relation, and the serializer
//     resolves "the other one" so the client never does;
//   - creates have to canonicalise the pair first, or the same two
//     businesses can be written twice;
//   - a delete by either side removes it for both, because there is only
//     one row and both parties own it equally.
//
// `source` is still first-write-wins: if A connects from the directory and B
// later taps A's card, the row keeps "directory". Re-labelling it would
// rewrite how the pair met, which is the one thing the field records.
//
// Since Aug 2026 a connection also has a STATE, which adds the accept route
// below and changes what DELETE means. A directory connect is now a request
// the other side answers; a card tap still lands accepted, because a tap is
// the evidence the approval step exists to collect (AUTO_ACCEPT_SOURCES).
//
// Withdraw, decline and remove are all DELETE. They are the same operation on
// the same row by different people at different times, and giving each its
// own route would mean three handlers whose bodies were one delete and three
// slightly different ownership checks — which is how the third one ends up
// missing the check.

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

async function loadOwnBusiness(req) {
  if (!req.account.businessId) fail(400, "You need a claimed business to do this.");
  const business = await prisma.business.findUnique({ where: { id: req.account.businessId } });
  if (!business) fail(400, "You need a claimed business to do this.");
  return business;
}

async function respondWithConnection(res, connectionId, viewerBusinessId, status = 200) {
  const fresh = await prisma.connection.findUnique({
    where: { id: connectionId },
    include: CONNECTION_INCLUDE,
  });
  res.status(status).json({
    connection: serializeConnection(fresh, viewerBusinessId),
    // Whether THIS request created the edge, mirroring 201 vs 200 in the
    // body so a fetch wrapper that only returns JSON can still tell. CardTap
    // needs it to choose between "you're now connected" and "you were
    // already connected" — without it, the only way to tell them apart is to
    // have the whole connection list loaded first, and making a card tap
    // wait on that is what left it stuck on "Adding…" when the list failed.
    created: status === 201,
  });
}

// Every edge touching the caller, newest first, PENDING ONES INCLUDED. One
// call rather than one per status: the client needs all three groups on the
// same screen (requests to answer, requests it sent, the network itself),
// and every connect button in the app has to tell "connected" from "asked"
// from "neither". Splitting this into /pending and /accepted would make the
// common case two round trips to answer one question about one business.
//
// Each row carries `status` and `requestedByYou`, which is everything needed
// to sort them — see serializeConnection.
//
// An account with no business gets an empty list rather than a 400: this is
// a read, an admin account legitimately has no business, and the same call
// on GET /businesses/me/activity already answers that way.
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.account.businessId) return res.json({ connections: [] });

    const connections = await prisma.connection.findMany({
      where: {
        OR: [{ businessAId: req.account.businessId }, { businessBId: req.account.businessId }],
      },
      include: CONNECTION_INCLUDE,
      orderBy: { createdAt: "desc" },
    });

    res.json({
      connections: connections.map((c) => serializeConnection(c, req.account.businessId)),
    });
  }),
);

// Sends a connection request, or — for a card tap — makes the connection
// outright — see statusForSource in lib/connections.js, which decides which.
//
// Idempotent by design. CardTap.jsx fires this from an effect the moment a
// tap resolves, so the same pair can arrive twice in quick succession (a
// re-render, StrictMode's double-invoke in dev, an impatient second tap) —
// and "you were already connected" is a success, not a conflict. Hence 200
// on an existing row and no second activity event.
router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const own = await loadOwnBusiness(req);
    const { businessId, source } = req.body ?? {};

    // No default source: both callers know which one they are, and a wrong
    // guess here doesn't fail loudly, it mislabels the row and renders under
    // the wrong filter in Network forever after.
    if (!CONNECTION_SOURCES.has(source)) fail(400, "Unknown connection source.");
    if (!businessId) fail(400, "A business to connect with is required.");
    if (businessId === own.id) fail(400, "You can't connect with your own business.");

    const target = await prisma.business.findUnique({ where: { id: businessId } });
    if (!target) fail(404, "Business not found.");
    // No caller-side tier check to match: an account only has a businessId
    // at all by way of an approved claim, which sets T1.
    if (target.verificationLevel === UNCLAIMED) fail(400, "This business hasn't been claimed yet.");

    const pair = orderedPair(own.id, target.id);
    const existing = await prisma.connection.findUnique({
      where: { businessAId_businessBId: pair },
    });
    if (existing) {
      // Two ways an existing pending row settles here rather than needing a
      // trip to the Requests tab.
      //
      // 1. They already asked you. Pressing Connect IS accepting: both
      //    parties wanting the connection is the entire condition the accept
      //    step tests for, and it has been met. Bouncing them to an inbox to
      //    press a second button would ask the same question twice.
      //
      // 2. You tap their card while your own request is still outstanding.
      //    A tap is the evidence AUTO_ACCEPT_SOURCES trusts — a fresh one
      //    would have connected instantly — so it has to settle a pending
      //    row too. Without this clause, politely asking first and then
      //    meeting in person leaves you worse off than never asking, which
      //    is precisely backwards.
      //
      // Both deliberately leave `source` alone: settling a request doesn't
      // rewrite how the pair met, which is the one thing that field records.
      const theyAsked = existing.requestedById !== own.id;
      if (existing.status === "pending" && (theyAsked || AUTO_ACCEPT_SOURCES.has(source))) {
        // The accepter is always whoever did NOT ask, because acceptConnection
        // notifies the requester and nobody should be told they accepted
        // their own request. In case 1 that's the caller; in case 2 it's the
        // other end of the pair, which has to be derived — the A/B columns
        // are ordered by id, not by direction.
        const otherEnd =
          existing.businessAId === own.id ? existing.businessBId : existing.businessAId;
        const accepterId = theyAsked ? own.id : otherEnd;
        await prisma.$transaction((tx) => acceptConnection(tx, existing, accepterId));
      }
      return respondWithConnection(res, existing.id, own.id);
    }

    try {
      const connection = await prisma.$transaction((tx) =>
        createConnection(tx, {
          actorBusinessId: own.id,
          counterpartyId: target.id,
          source,
        }),
      );
      return respondWithConnection(res, connection.id, own.id, 201);
    } catch (err) {
      // The findUnique above is a pre-check, not a lock — two concurrent
      // requests for the same pair both pass it and one loses on the unique
      // constraint. It got the outcome it asked for, so re-read and report
      // success rather than surfacing a 409 for a connection that exists.
      if (err.code !== "P2002") throw err;
      const raced = await prisma.connection.findUnique({
        where: { businessAId_businessBId: pair },
      });
      if (!raced) throw err;
      return respondWithConnection(res, raced.id, own.id);
    }
  }),
);

// The recipient says yes. Only the recipient: the requester pressing this
// would be approving their own request, which is the one thing the whole
// status column exists to prevent.
//
// Not idempotent-by-shrug like POST — accepting an already-accepted
// connection answers 400 rather than 200. POST is fired by an effect and can
// legitimately arrive twice; this one is a button press on a card that
// disappears afterwards, so a second one means the client is out of date and
// saying so is more useful than pretending.
router.post(
  "/:id/accept",
  requireAuth,
  asyncHandler(async (req, res) => {
    const own = await loadOwnBusiness(req);

    const connection = await prisma.connection.findUnique({ where: { id: req.params.id } });
    if (!connection) fail(404, "Connection request not found.");
    if (connection.businessAId !== own.id && connection.businessBId !== own.id) {
      fail(403, "This isn't your connection request.");
    }
    if (connection.status !== "pending") fail(400, "This connection isn't waiting on you.");
    if (connection.requestedById === own.id) {
      fail(403, "You sent this request — it's for them to accept.");
    }

    await prisma.$transaction((tx) => acceptConnection(tx, connection, own.id));
    await respondWithConnection(res, connection.id, own.id);
  }),
);

// One route, three jobs, because they are the same write by different people:
//
//   remove   — an accepted connection, by either side. Removes it for both;
//              there is one row and they own it equally.
//   withdraw — a pending request, by the business that sent it.
//   decline  — a pending request, by the business it was sent to.
//
// Declining DELETES rather than recording a rejection. Nothing needs to
// remember that someone said no: a stored "declined" would either block the
// pair forever (a block feature nobody asked for) or be reopenable anyway,
// and it would sit in the database as a permanent note about a social
// refusal. Volume is what makes re-asking a problem, and volume is the
// connection cap's job, not this table's.
//
// No confirmation handshake and no notification in any of the three cases —
// see createConnection in lib/connections.js for why removal is deliberately
// silent. That applies doubly to a decline.
router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const own = await loadOwnBusiness(req);

    const connection = await prisma.connection.findUnique({ where: { id: req.params.id } });
    if (!connection) fail(404, "Connection not found.");
    // Still the only guard this route needs, and it covers all three jobs
    // above: both ends may delete, whatever the status and whoever asked.
    // It remains the one place a wrong answer would let someone delete an
    // edge between two other businesses.
    if (connection.businessAId !== own.id && connection.businessBId !== own.id) {
      fail(403, "This isn't your connection.");
    }

    await prisma.connection.delete({ where: { id: connection.id } });
    res.json({ ok: true });
  }),
);

export { router as connectionRouter };
