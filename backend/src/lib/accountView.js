import { prisma } from "../prisma.js";
import { serializeAccount } from "./serialize.js";
import { ladderFor } from "./vouchLadder.js";

// Shapes a Business row (with its vouchesReceived relation loaded) into what
// the frontend expects: vouchCount/ladder derived at read time (never
// stored, per schema.prisma) plus a flat `vouches` list mirroring the old
// mock store's shape so components like VouchListItem don't need to branch
// on where the data came from.
function serializeBusiness(business) {
  const { vouchesReceived, ...rest } = business;
  const vouchCount = vouchesReceived.length;
  return {
    ...rest,
    vouchCount,
    ladder: ladderFor(vouchCount),
    vouches: vouchesReceived.map((v) => ({
      id: v.id,
      fromBusinessId: v.fromBusinessId,
      fromName: v.fromBusiness.name,
      testimonial: v.testimonial,
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
            include: { fromBusiness: { select: { name: true } } },
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
