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
// Billing columns are for the business itself and for admins, never for
// whoever is looking at it. They live on the same row as the public profile
// fields, so any handler that spreads a raw Business row leaks them — which
// is what routes/businesses.js does, deliberately, for both the directory
// list and the public profile (see the comment on GET /:id explaining why
// those don't go through serializeBusiness).
//
// Exported as an omit rather than a public allowlist on purpose: a new
// PUBLIC column should appear on profiles automatically, while a new
// BILLING column is the kind you have to opt into exposing. Adding one
// means adding it here.
function omitBillingFields(business) {
  const {
    membershipPlan: _membershipPlan,
    planStartedAt: _planStartedAt,
    planExpiresAt: _planExpiresAt,
    isFoundingMember: _isFoundingMember,
    ...publicFields
  } = business;
  return publicFields;
}
function serializeBusiness(business) {
  const { vouchesReceived, vouchesGiven, ...rest } = business;
  const published = vouchesReceived.filter((v) => v.status === "published");
  const vouchCount = published.length;
  return {
    ...rest,
    vouchCount,
    ladder: ladderFor(vouchCount),
    // Who this business already has a vouch OUT to, and where it stands.
    // Mirrors the 409 guard in routes/vouches.js exactly: cancelled rows are
    // omitted because a cancelled pair may vouch again, and every other
    // status blocks a fresh POST /vouches. Without this the client had no
    // way to know its own outgoing vouches — /auth/me's `vouches` is the
    // received direction — so every "vouch for them" affordance rendered
    // unconditionally and failed on submit.
    vouchedFor: (vouchesGiven ?? [])
      .filter((v) => v.status !== "cancelled")
      .map((v) => ({ businessId: v.toBusinessId, status: v.status })),
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
          // Two scalars, no joins — this feeds the client's "can I vouch for
          // them" gate, which needs the target and the status and nothing
          // else. The testimonials on this side belong to /vouches/given.
          vouchesGiven: { select: { toBusinessId: true, status: true } },
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

export { loadAccountView, serializeBusiness, omitBillingFields };
