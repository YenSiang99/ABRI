import { prisma } from "../prisma.js";
import { createActivityEvent } from "./activityEvents.js";
import { orderedPair } from "./connections.js";

// Confirmed work records. Read the PortfolioEntry model in schema.prisma first —
// this file implements the rules that comment states.

// Untouched this long and a pending portfolio entry lapses. Same number and same
// lazy mechanism as lib/vouchExpiry.js: there is no background-job infra in
// this codebase, so every route that reads one sweeps it first.
const EXPIRY_DAYS = 14;

// The only status anyone other than the two parties ever sees.
const PUBLIC_STATUS = "confirmed";

const PORTFOLIO_BUSINESS_SELECT = {
  id: true,
  name: true,
  category: true,
  location: true,
  verificationLevel: true,
};

const PORTFOLIO_INCLUDE = {
  businessA: { select: PORTFOLIO_BUSINESS_SELECT },
  businessB: { select: PORTFOLIO_BUSINESS_SELECT },
};

function isExpired(entry) {
  if (entry.status !== "pending") return false;
  return entry.lastActionAt.getTime() < Date.now() - EXPIRY_DAYS * 24 * 60 * 60 * 1000;
}

// Lapses a pending portfolio entry nobody answered. Returns the row either way, so
// callers can use it inline — the shape applyExpiryIfNeeded has in
// lib/vouchExpiry.js.
//
// Told to the PROPOSER only, and worded to name no culprit: nobody declined
// this, it just sat there. That distinction is the same one vouch_expired
// exists for — without it the proposer is told they were refused by a business
// that never actually did anything.
async function applyExpiryIfNeeded(entry) {
  if (!isExpired(entry)) return entry;

  const [updated] = await prisma.$transaction([
    prisma.portfolioEntry.update({
      where: { id: entry.id },
      data: { status: "cancelled", lastActionAt: new Date() },
      include: PORTFOLIO_INCLUDE,
    }),
    createActivityEvent(prisma, {
      businessId: entry.proposedById,
      actorBusinessId: counterpartyIdOf(entry, entry.proposedById),
      type: "portfolio_expired",
    }),
  ]);
  return updated;
}

// The other end of the pair. The pair is stored ordered by id, so neither
// column means "me" — every read has to resolve this, which is why it lives
// here rather than at each call site.
function counterpartyIdOf(entry, viewerBusinessId) {
  return entry.businessAId === viewerBusinessId
    ? entry.businessBId
    : entry.businessAId;
}

// Mirrors serializeConnection: `counterparty` is resolved server-side so the
// client never works out which end of the pair it is.
//
// `yours` is what the UI branches on — only the non-proposer may confirm or
// decline, and only the proposer may withdraw.
function serializePortfolioEntry(entry, viewerBusinessId = null) {
  const counterparty =
    entry.businessAId === viewerBusinessId ? entry.businessB : entry.businessA;

  return {
    id: entry.id,
    status: entry.status,
    service: entry.service,
    // Which end delivered it, so the client can label the record instead of
    // implying both sides do this work. Null means nobody recorded it.
    serviceProvidedById: entry.serviceProvidedById,
    note: entry.note,
    occurredOn: entry.occurredOn,
    createdAt: entry.createdAt,
    confirmedAt: entry.confirmedAt,
    counterparty: viewerBusinessId ? counterparty : null,
    businessA: entry.businessA,
    businessB: entry.businessB,
    proposedByYou: viewerBusinessId ? entry.proposedById === viewerBusinessId : null,
  };
}

// Every confirmed portfolio entry touching this business, newest work first.
// Confirmed only — see the status comment on the model for why a declined one
// is shown to nobody.
async function confirmedPortfolioFor(businessId, { limit = 50 } = {}) {
  return prisma.portfolioEntry.findMany({
    where: {
      status: PUBLIC_STATUS,
      OR: [{ businessAId: businessId }, { businessBId: businessId }],
    },
    include: PORTFOLIO_INCLUDE,
    orderBy: [{ occurredOn: "desc" }, { id: "desc" }],
    take: limit,
  });
}

// Confirmed portfolio entries grouped by service.
//
// COUNTS DISTINCT COUNTERPARTIES, NEVER ROWS, and that is the anti-collusion
// design rather than a presentation choice. Ten portfolio entries with one friendly
// business is one counterparty; reporting "10" would make the cheapest
// possible fake look like the strongest possible signal. A reader who sees
// "4 portfolio entries from 1 business" can judge it; a reader who sees "4" cannot.
//
// Portfolio entries with no service are counted in `total` and appear in no group —
// the same contract a custom service has on a profile.
async function portfolioSummaryFor(businessId) {
  const rows = await prisma.portfolioEntry.findMany({
    where: {
      status: PUBLIC_STATUS,
      OR: [{ businessAId: businessId }, { businessBId: businessId }],
    },
    select: {
      service: true,
      serviceProvidedById: true,
      businessAId: true,
      businessBId: true,
    },
  });

  const byService = new Map();
  for (const row of rows) {
    if (!row.service) continue;
    // A SERVICE IS CREDITED TO WHOEVER DELIVERED IT, once anybody has said who
    // that was. Before serviceProvidedById existed nothing asked, so both ends
    // of the pair were credited — which put "SST advisory" on the public
    // profile of a bakery whose only involvement was paying for it.
    //
    // A NULL PROVIDER IS CREDITED TO BOTH ENDS, and that is a RULE rather than
    // leniency towards old rows. Do not "tighten" it: every row the backfill
    // could not speak for would silently vanish from its own profile, with
    // nothing failing and nothing in the logs. See the column comment.
    if (row.serviceProvidedById && row.serviceProvidedById !== businessId) continue;
    const other = row.businessAId === businessId ? row.businessBId : row.businessAId;
    if (!byService.has(row.service)) {
      byService.set(row.service, { service: row.service, entries: 0, counterparties: new Set() });
    }
    const group = byService.get(row.service);
    group.entries += 1;
    group.counterparties.add(other);
  }

  // DISTINCT COUNTERPARTIES ACROSS THE WHOLE RECORD, and it has to be computed
  // here rather than summed from `services` below: a business with no service
  // on its rows appears in no group, and two groups can share a counterparty.
  //
  // This arrived as part of a repeat-business signal that also counted how many
  // of them CAME BACK. That count is gone — the portfolio is a list of work,
  // not a measurement of loyalty — but this half is a different thing and
  // stays: it is the anti-collusion denominator the directory ranks on. Ten
  // portfolio entries with one friendly business is one counterparty.
  const counterparties = new Set();
  for (const row of rows) {
    counterparties.add(row.businessAId === businessId ? row.businessBId : row.businessAId);
  }

  return {
    total: rows.length,
    counterparties: counterparties.size,
    // Sorted by distinct counterparties, then volume: the service the most
    // DIFFERENT businesses have confirmed is the most defensible claim this
    // business has, so it leads.
    services: [...byService.values()]
      .map((g) => ({
        service: g.service,
        entries: g.entries,
        counterparties: g.counterparties.size,
      }))
      .sort((a, b) => b.counterparties - a.counterparties || b.entries - a.entries),
  };
}

export {
  EXPIRY_DAYS,
  PUBLIC_STATUS,
  PORTFOLIO_INCLUDE,
  PORTFOLIO_BUSINESS_SELECT,
  applyExpiryIfNeeded,
  counterpartyIdOf,
  serializePortfolioEntry,
  confirmedPortfolioFor,
  portfolioSummaryFor,
  orderedPair,
};
