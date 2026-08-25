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
//
// That reasoning held up when the contact columns arrived: website, address
// and openingHours are public and needed no edit here at all, which is
// exactly the case this shape was chosen for. There are now TWO private
// groups, though — see omitContactFields below, and read publicBusinessView
// before adding a third.
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

// Sibling of omitBillingFields — same shape, different reason. Billing is
// private because it's ours; contact is private because it's the thing
// members pay to publish and scrapers pay nothing to harvest.
//
// Unlike billing, this omit is CONDITIONAL: whether it applies depends on the
// viewer, so it is never called directly by a route. Call publicBusinessView.
//
// Adding a PRIVATE column means adding it here, or it leaks by default.
// Adding a PUBLIC one still means doing nothing. If a THIRD private group
// ever appears, stop and switch this file to an explicit public allowlist
// rather than adding a third omit — at three groups the "do nothing" default
// stops being a convenience and starts being the reason something leaked.
function omitContactFields(business) {
  const {
    phone: _phone,
    whatsapp: _whatsapp,
    email: _email,
    ...rest
  } = business;
  return rest;
}

// The one serializer for a Business row leaving the server to somebody who is
// NOT that business and NOT an admin. Every public route should call this and
// nothing else — grep for omitBillingFields( and omitContactFields( and
// expect zero hits outside this file.
//
// It exists because the two omits must never be applied one-and-not-the-
// other. Before it, omitBillingFields was spread by hand at each call site;
// adding a second, conditional omit would have doubled the number of ways
// that goes wrong — silently, and in the leaking direction both times.
// Composing them here turns "did you remember both omits?" into "did you use
// the public serializer?", which a reviewer can actually check.
//
// showContact comes from contactVisibility(business, viewer) and MUST be
// computed on the RAW row, before this function runs: omitBillingFields
// strips membershipPlan, so can() asked about this function's output would
// deny everything and every business would silently look free. Same trap the
// testimonials gate in routes/businesses.js already warns about.
function publicBusinessView(business, { showContact = false } = {}) {
  const stripped = omitBillingFields(business);
  return showContact ? stripped : omitContactFields(stripped);
}

// The OWNER's own view. Deliberately does NOT go through publicBusinessView:
// billing columns belong to the business itself, and the contact columns are
// what makes "the owner always sees their own contact details" true without a
// special case anywhere else. Reached only via loadAccountView, i.e. /login,
// /auth/me and /verify-claim.
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

export {
  loadAccountView,
  serializeBusiness,
  omitBillingFields,
  omitContactFields,
  publicBusinessView,
};
