// Display labels for the two EARNED axes a business sits on — the two LEVELS.
// The third axis, the membership TIER, is deliberately elsewhere in
// lib/membershipTiers.js and styled differently everywhere it appears: see
// schema.prisma's membershipTier comment on why a tier must never read as a
// third kind of trust signal.
//
// That quarantine is the whole reason this file exists, and the Aug 2026
// rename made it load-bearing rather than tidy. Billing's label map is
// `membershipTierLabel`, NOT `tierLabel` — and these two are NOT `levelLabel`.
// Every name says its axis in full, on purpose: an import of the wrong short
// name would have RESOLVED SILENTLY and rendered "Plus" where "SSM-Verified"
// belongs. Fully-qualified names turn that into a build error instead. Don't
// shorten any of them.
//
// These lived in lib/store/businesses.js, the localStorage mock store, long
// after every screen had moved to the real API. They were the last reachable
// exports in that whole directory, which is what kept it alive — four
// unrelated components importing two constant maps from a fake data layer.
// Moving them here let the mock store be deleted outright.
//
// Both maps mirror server-side values and must move with them:
//   verificationLevelLabel — the union in backend/src/lib/verificationLevels.js
//   vouchLevelLabel        — vouchLevelFor() in backend/src/lib/vouchLevel.js
const verificationLevelLabel = {
  L0: "Unclaimed",
  L1: "Claimed",
  L2: "SSM-Verified",
  L3: "Identity-Verified",
  L4: "Transaction-Trusted",
};

const vouchLevelLabel = {
  none: "New Member",
  first: "First Vouch",
  top20: "Top 20%",
  trusted: "Trusted Business",
  leader: "Network Leader",
};

export { verificationLevelLabel, vouchLevelLabel };
