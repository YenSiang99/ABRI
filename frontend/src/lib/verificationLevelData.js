import { CLAIMED, VERIFICATION_LEVELS } from "@/lib/verificationLevels";

// The verification ladder — what each level means, what it takes to reach it,
// and what it unlocks. ONE definition, read by two screens.
//
// It lived inside pages/app/Verify.jsx while that page was the only thing
// showing it. The Dashboard grew its own hardcoded copy, and the two drifted:
// the Dashboard's said "Progress to L3" to every member regardless of their
// actual level, and listed steps ("Complete optional eKYC", "Verify
// representative identity") that didn't match what this list says L3 needs.
// Two explainers giving different answers is worse than one, so there is now
// one.
//
// Starts at L1, not L0. An L0 business has no owner by definition — nobody is
// reading this page about it. Callers deriving a "current" index must handle
// findIndex returning -1 rather than assuming a match.
function buildVerificationLevelData(account, business) {
  const ssmDone = business.verificationLevel !== CLAIMED;
  return [
    {
      verificationLevel: VERIFICATION_LEVELS[1],
      blurb: "You claimed this business listing.",
      steps: [
        { id: "email", label: "Confirm work email", done: Boolean(account?.emailVerified) },
        { id: "phone", label: "Confirm phone number", done: Boolean(account?.phoneVerified) },
      ],
      unlocks: "Basic profile page and directory listing.",
    },
    {
      verificationLevel: VERIFICATION_LEVELS[2],
      blurb: ssmDone
        ? "SSM records cross-checked against your registration."
        : "Pending manual review by the ABRI team — usually within a couple of business days.",
      steps: [
        { id: "ssm", label: "SSM entity match", done: ssmDone },
        { id: "director", label: "Director-name match", done: ssmDone },
      ],
      unlocks: "SSM-Verified badge · eligible to give and receive vouches · NFC card unlocked.",
    },
    {
      verificationLevel: VERIFICATION_LEVELS[3],
      blurb: "Optional identity verification (eKYC) — coming in a later stage.",
      steps: [
        { id: "id", label: "Government ID upload", done: false },
        { id: "selfie", label: "Liveness selfie check", done: false },
      ],
      unlocks: "Identity-Verified badge.",
    },
    {
      verificationLevel: VERIFICATION_LEVELS[4],
      blurb: "Transaction history verified through the network — coming in a later stage.",
      steps: [
        { id: "tx1", label: "First closed transaction on-platform", done: false },
        { id: "tx3", label: "3+ transactions across distinct counterparties", done: false },
      ],
      unlocks: "Transaction-Trusted badge · escrow-eligible.",
    },
  ];
}

// The level the member is working towards, or null once they're at the top.
// Derived rather than hardcoded, which is the whole point of this module.
function nextVerificationLevel(account, business) {
  const levels = buildVerificationLevelData(account, business);
  const currentIndex = levels.findIndex((l) => l.verificationLevel === business.verificationLevel);
  return levels[currentIndex + 1] ?? null;
}

export { buildVerificationLevelData, nextVerificationLevel };
