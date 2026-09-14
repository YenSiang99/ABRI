import { prisma } from "../prisma.js";
import { createActivityEvent } from "./activityEvents.js";
import { orderedPair } from "./connections.js";

// Confirmed work records. Read the Engagement model in schema.prisma first —
// this file implements the rules that comment states.

// Untouched this long and a pending engagement lapses. Same number and same
// lazy mechanism as lib/vouchExpiry.js: there is no background-job infra in
// this codebase, so every route that reads one sweeps it first.
const EXPIRY_DAYS = 14;

// The only status anyone other than the two parties ever sees.
const PUBLIC_STATUS = "confirmed";

const ENGAGEMENT_BUSINESS_SELECT = {
  id: true,
  name: true,
  category: true,
  location: true,
  verificationLevel: true,
};

const ENGAGEMENT_INCLUDE = {
  businessA: { select: ENGAGEMENT_BUSINESS_SELECT },
  businessB: { select: ENGAGEMENT_BUSINESS_SELECT },
  ask: { select: { id: true, title: true } },
};

function isExpired(engagement) {
  if (engagement.status !== "pending") return false;
  return engagement.lastActionAt.getTime() < Date.now() - EXPIRY_DAYS * 24 * 60 * 60 * 1000;
}

// Lapses a pending engagement nobody answered. Returns the row either way, so
// callers can use it inline — the shape applyExpiryIfNeeded has in
// lib/vouchExpiry.js and lib/askExpiry.js.
//
// Told to the PROPOSER only, and worded to name no culprit: nobody declined
// this, it just sat there. That distinction is the same one vouch_expired
// exists for — without it the proposer is told they were refused by a business
// that never actually did anything.
async function applyExpiryIfNeeded(engagement) {
  if (!isExpired(engagement)) return engagement;

  const [updated] = await prisma.$transaction([
    prisma.engagement.update({
      where: { id: engagement.id },
      data: { status: "cancelled", lastActionAt: new Date() },
      include: ENGAGEMENT_INCLUDE,
    }),
    createActivityEvent(prisma, {
      businessId: engagement.proposedById,
      actorBusinessId: counterpartyIdOf(engagement, engagement.proposedById),
      type: "engagement_expired",
    }),
  ]);
  return updated;
}

// The other end of the pair. The pair is stored ordered by id, so neither
// column means "me" — every read has to resolve this, which is why it lives
// here rather than at each call site.
function counterpartyIdOf(engagement, viewerBusinessId) {
  return engagement.businessAId === viewerBusinessId
    ? engagement.businessBId
    : engagement.businessAId;
}

// Mirrors serializeConnection: `counterparty` is resolved server-side so the
// client never works out which end of the pair it is.
//
// `yours` is what the UI branches on — only the non-proposer may confirm or
// decline, and only the proposer may withdraw.
function serializeEngagement(engagement, viewerBusinessId = null) {
  const counterparty =
    engagement.businessAId === viewerBusinessId ? engagement.businessB : engagement.businessA;

  return {
    id: engagement.id,
    status: engagement.status,
    service: engagement.service,
    note: engagement.note,
    occurredOn: engagement.occurredOn,
    createdAt: engagement.createdAt,
    confirmedAt: engagement.confirmedAt,
    ask: engagement.ask ?? null,
    counterparty: viewerBusinessId ? counterparty : null,
    businessA: engagement.businessA,
    businessB: engagement.businessB,
    proposedByYou: viewerBusinessId ? engagement.proposedById === viewerBusinessId : null,
  };
}

// Every confirmed engagement touching this business, newest work first.
// Confirmed only — see the status comment on the model for why a declined one
// is shown to nobody.
async function confirmedEngagementsFor(businessId, { limit = 50 } = {}) {
  return prisma.engagement.findMany({
    where: {
      status: PUBLIC_STATUS,
      OR: [{ businessAId: businessId }, { businessBId: businessId }],
    },
    include: ENGAGEMENT_INCLUDE,
    orderBy: [{ occurredOn: "desc" }, { id: "desc" }],
    take: limit,
  });
}

// HOW MANY OF THE BUSINESSES THAT WORKED WITH THEM CAME BACK.
//
// The only negative-capable signal in the product that is derived purely from
// facts both sides already confirmed. Every other signal on a profile is
// positive-only by construction — a vouch has to be accepted, an engagement
// has to be confirmed — so absence is the
// only bad news a reader can currently get, and absence is indistinguishable
// from being new. "Six businesses worked with them and one came back" is bad
// news that nobody wrote, nobody can deny, and nobody can sue over.
//
// It is the reading the schema was already built for: Engagement deliberately
// carries no @@unique on the pair, unlike Connection, precisely because repeat
// work is the strongest thing this model records. Until now nothing read it.
//
// COUNTS DISTINCT MONTHS, NOT ROWS, and that distinction is the whole
// difference between a fact and an advertisement. An engagement is one piece
// of work, and a single project is routinely logged as several — four services
// with one business in one August is one relationship, not four returns. Row
// counting called that a repeat customer, which made the one number on the
// page that is meant to be unfakeable the easiest thing on it to inflate, and
// needing no colluder to do it. Two engagements in two different months is
// somebody coming back; two in the same month is somebody itemising.
//
// The cost is real and deliberately accepted: two genuinely separate projects
// inside one month count once. That understates a good record rather than
// overstating it, which is the only direction this figure can afford to err.
//
// A COUNT, NOT A RATIO, and that is a deliberate reversal worth recording.
// This shipped as "1 of 3 businesses came back" and the denominator is gone on
// purpose: a rate is only readable once a business has enough counterparties
// for the fraction to mean something, and at this network's size almost nobody
// does. A count rises the first time anyone returns, which is the behaviour the
// product wants to encourage — logging work — rather than a verdict on a
// sample of four.
//
// The honest cost, so nobody rediscovers it as a bug: three-of-four and
// three-of-forty now read identically. This figure therefore does NOT say
// anything unflattering any more, and must not be described as though it does.
// The ratio is a read over the same rows and can come back once there is
// density to support it — nothing here needs to change for that, only the
// serializer and the copy.
//
// Still never a score and still never a rank: DO NOT sort the directory by it,
// do not average it into anything, and do not put it on a card beside
// businesses from another category, where a trade whose work does not recur
// (you incorporate a company once) would look worse than one that bills
// annually for reasons that have nothing to do with either being any good.
// The month an engagement happened in, as "2026-08". occurredOn is a month a
// member picked from a control, never a timestamp, so this throws away no
// precision the data ever had. UTC to match how the routes store it — a local
// reading would move a 1st-of-the-month engagement into the previous month for
// anyone west of Greenwich and invent a repeat out of nothing.
function monthKey(occurredOn) {
  const d = new Date(occurredOn);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
}

function repeatSignalFor(rows, businessId) {
  const monthsPer = new Map();
  for (const row of rows) {
    const other = row.businessAId === businessId ? row.businessBId : row.businessAId;
    if (!monthsPer.has(other)) monthsPer.set(other, new Set());
    monthsPer.get(other).add(monthKey(row.occurredOn));
  }

  const counterparties = monthsPer.size;

  let repeatCounterparties = 0;
  for (const months of monthsPer.values()) {
    if (months.size > 1) repeatCounterparties += 1;
  }

  // Both numbers always cross the wire, zeros included. Nothing here is
  // withheld: every row this counts is already on the public profile, so a
  // reader could tally it by hand. WHETHER a zero is worth drawing is the
  // client's call — see RepeatSignal, which shows it to the owner as a prompt
  // and to a visitor not at all.
  return { counterparties, repeatCounterparties };
}

// Confirmed engagements grouped by service.
//
// COUNTS DISTINCT COUNTERPARTIES, NEVER ROWS, and that is the anti-collusion
// design rather than a presentation choice. Ten engagements with one friendly
// business is one counterparty; reporting "10" would make the cheapest
// possible fake look like the strongest possible signal. A reader who sees
// "4 engagements from 1 business" can judge it; a reader who sees "4" cannot.
//
// Engagements with no service are counted in `total` and appear in no group —
// the same contract a custom service has on a profile.
async function engagementSummaryFor(businessId) {
  const rows = await prisma.engagement.findMany({
    where: {
      status: PUBLIC_STATUS,
      OR: [{ businessAId: businessId }, { businessBId: businessId }],
    },
    select: { service: true, businessAId: true, businessBId: true, occurredOn: true },
  });

  const byService = new Map();
  for (const row of rows) {
    if (!row.service) continue;
    const other = row.businessAId === businessId ? row.businessBId : row.businessAId;
    if (!byService.has(row.service)) {
      byService.set(row.service, { service: row.service, engagements: 0, counterparties: new Set() });
    }
    const group = byService.get(row.service);
    group.engagements += 1;
    group.counterparties.add(other);
  }

  return {
    total: rows.length,
    ...repeatSignalFor(rows, businessId),
    // Sorted by distinct counterparties, then volume: the service the most
    // DIFFERENT businesses have confirmed is the most defensible claim this
    // business has, so it leads.
    services: [...byService.values()]
      .map((g) => ({
        service: g.service,
        engagements: g.engagements,
        counterparties: g.counterparties.size,
      }))
      .sort((a, b) => b.counterparties - a.counterparties || b.engagements - a.engagements),
  };
}

export {
  EXPIRY_DAYS,
  PUBLIC_STATUS,
  ENGAGEMENT_INCLUDE,
  ENGAGEMENT_BUSINESS_SELECT,
  applyExpiryIfNeeded,
  counterpartyIdOf,
  serializeEngagement,
  confirmedEngagementsFor,
  engagementSummaryFor,
  orderedPair,
};
