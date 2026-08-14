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
} from "../lib/connections.js";

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
// There is no update. The only mutable thing on a connection is `source`,
// and that's first-write-wins on purpose: if A connects from the directory
// and B later taps A's card, the row keeps "directory". Re-labelling it
// would rewrite how the pair met, which is the one thing the field records.

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

// Every edge touching the caller, newest first. Powers Network.jsx and,
// through ConnectionsContext, the "Connected" state of every connect button
// in the app.
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
    if (target.tier === "T0") fail(400, "This business hasn't been claimed yet.");

    const pair = orderedPair(own.id, target.id);
    const existing = await prisma.connection.findUnique({
      where: { businessAId_businessBId: pair },
    });
    if (existing) return respondWithConnection(res, existing.id, own.id);

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

// Either party can remove, and it removes for both — there's one row and
// they own it equally. No confirmation handshake and no notification to the
// other side: see createConnection in lib/connections.js for why removal is
// deliberately silent.
router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const own = await loadOwnBusiness(req);

    const connection = await prisma.connection.findUnique({ where: { id: req.params.id } });
    if (!connection) fail(404, "Connection not found.");
    // The only guard this route needs, and the one place a wrong answer
    // would let someone delete an edge between two other businesses.
    if (connection.businessAId !== own.id && connection.businessBId !== own.id) {
      fail(403, "This isn't your connection.");
    }

    await prisma.connection.delete({ where: { id: connection.id } });
    res.json({ ok: true });
  }),
);

export { router as connectionRouter };
