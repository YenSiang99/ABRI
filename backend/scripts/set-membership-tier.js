// Moves a business onto a membership tier. There's no upgrade UI and no
// admin route for this yet (both are deliberately the next ring of work),
// so this is currently the only way to see anything other than the tier a
// business landed on at claim approval — which makes it the only way to
// test tier-gated behaviour at all.
//
// Mirrors scripts/grant-admin.js: a flag with no UI behind it gets a
// one-purpose script rather than a hand-written SQL statement, so the
// valid values live somewhere that can be wrong loudly.
//
// Usage: node scripts/set-membership-tier.js <businessId> <free|plus|pro|enterprise>
//        node scripts/set-membership-tier.js <businessId> plus --founding
//        node scripts/set-membership-tier.js --list
import { prisma } from "../src/prisma.js";
import { MEMBERSHIP_TIER_RANK } from "../src/lib/entitlements.js";

// Derived from the entitlements rank rather than repeated, so this script
// and POST /admin/businesses/:id/plan can never disagree about what a valid
// plan is. That leaves schema.prisma's membershipTier union and
// VOUCH_CAP_BY_MEMBERSHIP_TIER in src/lib/vouchCap.js as the two places still kept in
// step by hand — a value missing from either is a bug in that one.
const PLANS = Object.keys(MEMBERSHIP_TIER_RANK);

async function list() {
  const businesses = await prisma.business.findMany({
    where: { accounts: { some: { claimStatus: "approved" } } },
    select: {
      id: true,
      name: true,
      membershipTier: true,
      isFoundingMember: true,
      accounts: { where: { claimStatus: "approved" }, select: { email: true } },
    },
    orderBy: { name: "asc" },
  });

  if (businesses.length === 0) {
    console.log("No claimed businesses — nothing to log in as.");
    return;
  }

  console.log("Claimed businesses (these are the ones you can log in as):\n");
  for (const b of businesses) {
    const founding = b.isFoundingMember ? " · founding" : "";
    console.log(`  ${b.id}`);
    console.log(`    ${b.name} — ${b.membershipTier}${founding}`);
    console.log(`    ${b.accounts.map((a) => a.email).join(", ")}\n`);
  }
}

const [target, plan] = process.argv.slice(2);

if (target === "--list") {
  await list();
  await prisma.$disconnect();
  process.exit(0);
}

if (!target || !PLANS.includes(plan)) {
  console.error("Usage: node scripts/set-membership-tier.js <businessId> <" + PLANS.join("|") + "> [--founding]");
  console.error("       node scripts/set-membership-tier.js --list");
  process.exit(1);
}

const business = await prisma.business.update({
  where: { id: target },
  data: {
    membershipTier: plan,
    membershipTierStartedAt: new Date(),
    // Only ever set to true here, never false — same rule as
    // businessClaim.js. Founding status is earned once; a script that
    // could quietly strip it would defeat the point of splitting it out
    // of membershipTier in the first place.
    ...(process.argv.includes("--founding") ? { isFoundingMember: true } : {}),
  },
});

console.log(
  `${business.id} is now on "${business.membershipTier}"` +
    (business.isFoundingMember ? " (founding member)" : "")
);
await prisma.$disconnect();
