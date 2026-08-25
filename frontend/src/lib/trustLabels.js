// Display labels for the two TRUST axes a business sits on. The third axis —
// the billing plan — is deliberately elsewhere, in lib/plans.js, and styled
// differently everywhere it appears: see schema.prisma's membershipPlan
// comment on why a plan must never read as a third kind of trust signal.
//
// These lived in lib/store/businesses.js, the localStorage mock store, long
// after every screen had moved to the real API. They were the last three
// reachable exports in that whole directory (with updateBusinessProfile,
// retired when PATCH /businesses/me landed), which is what kept it alive —
// four unrelated components importing two constant maps from a fake data
// layer. Moving them here let the mock store be deleted outright.
//
// Both maps mirror server-side values and must move with them:
//   tier   — Business.tier in backend/prisma/schema.prisma
//   ladder — ladderFor() in backend/src/lib/vouchLadder.js
const tierLabel = {
  T0: "Listed",
  T1: "Claimed",
  T2: "SSM-Verified",
  T3: "Identity-Verified",
  T4: "Transaction-Trusted",
};

const ladderLabel = {
  none: "New Member",
  first: "First Vouch",
  top20: "Top 20%",
  trusted: "Trusted Business",
  leader: "Network Leader",
};

export { tierLabel, ladderLabel };
