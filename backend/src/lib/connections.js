import { prisma } from "../prisma.js";
import { createActivityEvent } from "./activityEvents.js";
import { UNCLAIMED } from "./verificationLevels.js";

// Everything about connections that has to behave identically outside an
// HTTP request lives here rather than in routes/connections.js, because
// three non-route callers create them: both verify-claim branches in
// routes/auth.js (via consumeDeferredConnections below) and the claim
// endpoint in routes/businesses.js. If orderedPair lived in the router,
// those would each have to re-derive the ordering invariant, and the first
// one to get it backwards would write a duplicate edge the unique
// constraint can't catch.

// The valid Connection.source values. Free text at the DB level (see
// schema.prisma), so this is what actually constrains it — same role as
// RECEIVER_FLAG_REASONS in routes/vouches.js. "nfc_scan" is a physical card
// tap; "directory" is the in-app connect button.
const CONNECTION_SOURCES = new Set(["nfc_scan", "directory"]);

// Connection.status, and the one place the union is enforced.
const CONNECTION_STATUSES = new Set(["pending", "accepted"]);

// Which source skips the approval step. A card tap is physical evidence the
// two businesses were in the same room, which is the thing an approval step
// exists to establish — asking someone to confirm a handshake they just gave
// is friction that buys nothing. A directory connect is a claim about a
// relationship made at a distance, so it waits.
//
// Keyed off source rather than branched at the call site so the rule is
// stated once. Adding a source means deciding this question for it.
const AUTO_ACCEPT_SOURCES = new Set(["nfc_scan"]);

function statusForSource(source) {
  return AUTO_ACCEPT_SOURCES.has(source) ? "accepted" : "pending";
}

// Wider than vouchTurn.js's BUSINESS_SELECT by one field: Network.jsx
// renders the counterparty's location on every card. Kept separate rather
// than widening that one, which would silently add a field to every vouch
// payload for the sake of an unrelated consumer.
const CONNECTION_BUSINESS_SELECT = {
  id: true,
  name: true,
  category: true,
  location: true,
  verificationLevel: true,
};

// One include for every connection read. Lives next to serializeConnection
// below, which can't work without it (same reasoning as VOUCH_INCLUDE).
const CONNECTION_INCLUDE = {
  businessA: { select: CONNECTION_BUSINESS_SELECT },
  businessB: { select: CONNECTION_BUSINESS_SELECT },
};

// The ordering invariant from schema.prisma, in the one place that owns it:
// the lexicographically smaller id is always businessAId. A connection is a
// mutual edge stored once, so without a canonical order A-scans-B and
// B-scans-A would write two rows that @@unique([businessAId, businessBId])
// has no way to recognise as the same pair.
function orderedPair(idA, idB) {
  return idA < idB
    ? { businessAId: idA, businessBId: idB }
    : { businessAId: idB, businessBId: idA };
}

// Expects a row loaded with CONNECTION_INCLUDE. `counterparty` is resolved
// server-side — the client never has to work out which end of the pair it
// is, which is the whole awkwardness of storing a mutual edge once.
function serializeConnection(connection, viewerBusinessId) {
  const counterparty =
    connection.businessAId === viewerBusinessId ? connection.businessB : connection.businessA;

  return {
    id: connection.id,
    source: connection.source,
    status: connection.status,
    createdAt: connection.createdAt,
    respondedAt: connection.respondedAt,
    // Resolved server-side for the same reason `counterparty` is: the client
    // can't work it out from the payload. requestedById points at one end of
    // a pair whose A/B order is lexicographic, so "was it me?" is the only
    // form of the question any caller actually asks.
    //
    // While pending this is the whole UI: true means "waiting on them, you
    // may withdraw", false means "waiting on you, you may accept or decline".
    requestedByYou: connection.requestedById === viewerBusinessId,
    counterparty: counterparty ?? null,
  };
}

// Creates the edge and notifies the other side, as one unit — they're
// bundled here so a future caller can't add a connection that nobody hears
// about. Takes the client as its first arg (like createActivityEvent) so
// callers can pass a `tx` and get both writes in one transaction.
//
// Only the counterparty is notified: the actor pressed the button, so
// telling them what they just did is noise. There's deliberately no
// equivalent on removal — "X removed you from their network" is a hostile
// notification the reader can do nothing about.
async function createConnection(client, { actorBusinessId, counterpartyId, source }) {
  const status = statusForSource(source);

  const connection = await client.connection.create({
    data: {
      ...orderedPair(actorBusinessId, counterpartyId),
      source,
      status,
      requestedById: actorBusinessId,
      respondedAt: status === "accepted" ? new Date() : null,
    },
  });

  // Two different facts, so two different events. "X connected with you" is
  // something that has happened and needs nothing from the reader; "X wants
  // to connect" is a request sitting on their desk. Wording the second like
  // the first is how an inbox item goes unanswered — the reader is told it
  // is already done.
  await createActivityEvent(client, {
    businessId: counterpartyId,
    actorBusinessId,
    type: status === "accepted" ? "connection_added" : "connection_requested",
  });

  return connection;
}

// The other side says yes. Separate from createConnection because it is the
// only transition a connection has, and folding it in would make one
// function whose behaviour flipped on whether the row already existed.
//
// The activity event goes to the REQUESTER — the accepter pressed the
// button, so telling them what they just did is noise. Same rule as
// createConnection.
async function acceptConnection(client, connection, accepterBusinessId) {
  const updated = await client.connection.update({
    where: { id: connection.id },
    data: { status: "accepted", respondedAt: new Date() },
  });

  await createActivityEvent(client, {
    businessId: connection.requestedById,
    actorBusinessId: accepterBusinessId,
    type: "connection_accepted",
  });

  return updated;
}

// Turns the connect-intents queued against an account into real edges, then
// clears the queue. Called from startSession (lib/session.js) and nowhere
// else — see the DeferredConnection comment in schema.prisma for why the
// intent has to survive between requests at all.
//
// Every failure mode here is "nothing to do", not "error": the account may
// have no business, the target may have been revoked back to T0 while the
// claim sat in review, or the edge may already exist. None of those should
// surface to someone who is just logging in.
async function consumeDeferredConnections(accountId) {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account?.businessId) return;

  const queued = await prisma.deferredConnection.findMany({
    where: { accountId },
    include: { business: { select: { id: true, verificationLevel: true } } },
  });
  if (queued.length === 0) return;

  // Filtered out here rather than inside the transaction so the write stays
  // as short as possible.
  const targets = queued.filter(
    (row) => row.businessId !== account.businessId && row.business.verificationLevel !== UNCLAIMED,
  );

  await prisma.$transaction(async (tx) => {
    for (const row of targets) {
      const pair = orderedPair(account.businessId, row.businessId);
      const existing = await tx.connection.findUnique({
        where: { businessAId_businessBId: pair },
      });
      if (existing) continue;

      await createConnection(tx, {
        actorBusinessId: account.businessId,
        counterpartyId: row.businessId,
        // The only way a row lands in DeferredConnection is a card tap made
        // while logged out, and a tap is exactly the evidence
        // AUTO_ACCEPT_SOURCES trusts — so these arrive already accepted, the
        // same as a tap made with a session. Someone who tapped a card before
        // they had an account shouldn't come back to a request to approve.
        source: "nfc_scan",
      });
    }

    // Clears ALL queued rows, including the ones skipped above. A stale
    // target is nothing to do, not something to retry on the next login.
    await tx.deferredConnection.deleteMany({ where: { accountId } });
  });
}

export {
  CONNECTION_SOURCES,
  CONNECTION_STATUSES,
  AUTO_ACCEPT_SOURCES,
  statusForSource,
  acceptConnection,
  CONNECTION_BUSINESS_SELECT,
  CONNECTION_INCLUDE,
  orderedPair,
  serializeConnection,
  createConnection,
  consumeDeferredConnections,
};
