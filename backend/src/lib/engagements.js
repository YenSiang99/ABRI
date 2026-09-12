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
    select: { service: true, businessAId: true, businessBId: true },
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
