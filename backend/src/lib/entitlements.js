// "Is this business allowed to do X?" — the one place a feature gate asks
// about a plan, so a gate is never re-derived at a call site and never
// drifts from another gate's idea of what a plan includes.
//
// The second plan-reading module after lib/vouchCap.js, and the split
// between them is deliberate: vouchCap answers "how many", this answers
// "at all". A quantity and a boolean want different shapes, and collapsing
// them would mean every yes/no feature carried a meaningless number.
//
// schema.prisma's membershipPlan comment requires the plan union and
// VOUCH_CAP_BY_PLAN to move in the same commit. That invariant now covers
// this file too: a new plan needs a PLAN_RANK entry, or every gate denies
// it (loudly — see below — but denies it).

// Plans are a ladder, not a set of unrelated bundles: every tier so far is
// a strict superset of the one below it. Ranking them once here means a
// feature declares a MINIMUM rather than listing the plans that include
// it — which is what stops a later edit granting something to Plus and
// forgetting Pro.
const PLAN_RANK = { free: 0, plus: 1, pro: 2, enterprise: 3 };

const FEATURE_MIN_PLAN = {
  // Third parties see the vouch COUNT on every plan; only paid plans show
  // the words. See ABRI-feature-checklist.md's Free tier: "'12 vouches' is
  // visible, the written words are not."
  testimonials: "plus",

  // The OWNER's plan half of the contact gate — the second server-enforced
  // entry here, after testimonials. Deliberately only half: the full rule
  // also requires the VIEWER to be logged in, which is not a plan question,
  // so it lives in lib/contactVisibility.js and that is what routes call.
  //
  // Don't add a viewer argument to can() to accommodate it. Every other gate
  // in this file asks about one business's own plan, and it should stay that
  // way — a two-subject can() would make every existing call site ambiguous
  // about which business it was asking about.
  contactDetails: "plus",


  // DECLARED HERE, ENFORCED ONLY IN THE UI — for now. There is no server
  // endpoint: the card screen reads frontend/src/data/appMockData.js, which
  // ships inside the bundle, so nothing on this side can withhold anything
  // yet. It lives here regardless so there is ONE registry of what a plan
  // includes rather than a short server list and a longer client one, and so
  // the gate is already written down when the real route arrives — at which
  // point that route calls can() and this becomes real.
  //
  // Don't cite it as a server-enforced gate until that happens.
  //
  // `introductions: "pro"` sat here too until Aug 2026, when the screen it
  // gated was deleted for being mock data end to end. A gate is not a
  // feature: keeping the entry would have left the registry describing a
  // plan that included something the product didn't have. If a replacement
  // Pro feature arrives, it gets its own entry under its own name.
  nfcCard: "plus",
};

function can(business, feature) {
  const minimum = FEATURE_MIN_PLAN[feature];
  if (minimum === undefined) {
    // Throws where an unknown PLAN only warns: an unknown plan is bad data
    // arriving at runtime, but an unknown feature is a typo in the calling
    // code. Returning false there would make a gate that never opens look
    // exactly like a gate that works, which is the worst way to find out.
    throw new Error(
      `Unknown feature ${JSON.stringify(feature)}. Known: ${Object.keys(FEATURE_MIN_PLAN).join(", ")}.`
    );
  }

  const rank = PLAN_RANK[business?.membershipPlan];
  if (rank === undefined) {
    // Same call as vouchCap.js's: deny rather than throw, because an
    // off-union plan value is our data bug, not the visitor's, and a
    // public profile shouldn't 500 over it. Warn so we find out from the
    // logs rather than from a member asking why their page looks wrong.
    console.warn(
      `[entitlements] Unknown membershipPlan ${JSON.stringify(business?.membershipPlan)} — ` +
        `denying "${feature}".`
    );
    return false;
  }
  return rank >= PLAN_RANK[minimum];
}

export { PLAN_RANK, FEATURE_MIN_PLAN, can };
