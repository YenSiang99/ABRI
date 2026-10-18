import { prisma } from "../prisma.js";

// Membership tiers END now. membershipTierExpiresAt was recorded and never
// read until the Founding programme gave every founding member a real end
// date (lib/founding.js), at which point an unread expiry would have meant
// Pro forever.
//
// Two halves, on purpose:
//   - effectiveMembershipTier() is exact. Every gate (lib/entitlements.js
//     can(), the endorsement cap) asks it, so a tier stops working the moment it
//     expires, whatever the stored column still says.
//   - sweepExpiredMemberships() makes the stored column catch up, so the
//     member's own screens (which read the column) and the admin screens say
//     Free too. Hourly is plenty; the gates never wait for it.

function effectiveMembershipTier(business, now = new Date()) {
  const expiresAt = business?.membershipTierExpiresAt;
  if (expiresAt && new Date(expiresAt) <= now) return "free";
  return business?.membershipTier;
}

async function sweepExpiredMemberships(now = new Date()) {
  const { count } = await prisma.business.updateMany({
    where: { membershipTier: { not: "free" }, membershipTierExpiresAt: { lte: now } },
    data: {
      membershipTier: "free",
      membershipTierGrant: null,
      membershipTierStartedAt: now,
      membershipTierExpiresAt: null,
    },
  });
  if (count) console.log(`[membershipExpiry] ${count} membership(s) expired to Free`);
  return count;
}

const SWEEP_EVERY_MS = 60 * 60 * 1000;

// Called once at boot (src/index.js). unref'd so it never holds the process
// open, and a failed sweep only logs: the gates are already exact without it.
function startMembershipSweep() {
  const run = () => sweepExpiredMemberships().catch((err) => console.error("[membershipExpiry] sweep failed", err));
  run();
  setInterval(run, SWEEP_EVERY_MS).unref();
}

export { effectiveMembershipTier, sweepExpiredMemberships, startMembershipSweep };
