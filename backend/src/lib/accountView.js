import { prisma } from "../prisma.js";
import { serializeAccount } from "./serialize.js";
import { ladderFor } from "./vouchLadder.js";

// Shapes a Business row (with its vouchesReceived relation loaded) into what
// the frontend expects: vouchCount/ladder derived at read time (never
// stored, per schema.prisma) plus a flat `vouches` list mirroring the old
// mock store's shape so components like VouchListItem don't need to branch
// on where the data came from.
//
// Filters to status: "published" here, defensively, rather than relying on
// every caller's query to have already filtered — a vouch only becomes a
// trust signal once its receiver has accepted it (see the Vouch review
// state machine in schema.prisma); pending/reverted/under_review/cancelled
// rows must never count toward vouchCount/ladder or appear in the public
// `vouches` list.
function serializeBusiness(business) {
  const { vouchesReceived, ...rest } = business;
  const published = vouchesReceived.filter((v) => v.status === "published");
  const vouchCount = published.length;
  return {
    ...rest,
    vouchCount,
    ladder: ladderFor(vouchCount),
    vouches: published.map((v) => ({
      id: v.id,
      fromBusinessId: v.fromBusinessId,
      fromName: v.fromBusiness.name,
      fromCategory: v.fromBusiness.category,
      fromTier: v.fromBusiness.tier,
      // Joined through currentRevision rather than read off the Vouch row:
      // the denormalized `testimonial` column this used to read is gone
      // (see schema.prisma), because it was the thing a revise overwrote.
      testimonial: v.currentRevision?.comment ?? null,
      date: v.createdAt,
    })),
  };
}

// Single source of truth for "what does the frontend get back for a logged
// in account" — used by /login, /me, and /verify-claim so all three shape
// the response identically instead of drifting apart.
async function loadAccountView(accountId) {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: {
      business: {
        include: {
          vouchesReceived: {
            include: {
              fromBusiness: { select: { name: true, category: true, tier: true } },
              currentRevision: { select: { comment: true } },
            },
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
  });
  if (!account) return null;

  const { business, ...accountFields } = account;
  return {
    account: serializeAccount(accountFields),
    business: business ? serializeBusiness(business) : null,
  };
}

export { loadAccountView, serializeBusiness };
