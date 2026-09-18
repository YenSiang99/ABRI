// Mirrors backend/src/lib/verificationLevels.js — the Business.verificationLevel
// union, and the only place these five strings are written down on this side.
//
// The server is the authority; this copy exists so the client can branch on a
// level without hardcoding a string. Ordered, and the order is the meaning:
// index 0 is "nobody has claimed this listing", index 4 is the top.
//
// Flat and logic-free on purpose. The moment this file grows rules of its own
// it stops being a mirror and starts being a second source of truth that can
// disagree with the server — the same reason lib/membershipTiers.js keeps its
// FEATURE_MIN_MEMBERSHIP_TIER mirror flat.
const VERIFICATION_LEVELS = ["L0", "L1", "L2", "L3", "L4"];

const UNCLAIMED = VERIFICATION_LEVELS[0];
const CLAIMED = VERIFICATION_LEVELS[1];
const SSM_VERIFIED = VERIFICATION_LEVELS[2];

const VOUCHABLE_VERIFICATION_LEVELS = new Set(VERIFICATION_LEVELS.slice(2));

export {
  VERIFICATION_LEVELS,
  UNCLAIMED,
  CLAIMED,
  SSM_VERIFIED,
  VOUCHABLE_VERIFICATION_LEVELS,
};
