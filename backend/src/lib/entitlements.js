// "Is this business allowed to do X?" — the one place a feature gate asks
// about a membership tier, so a gate is never re-derived at a call site and never
// drifts from another gate's idea of what a plan includes.
//
// The second tier-reading module after lib/vouchCap.js, and the split
// between them is deliberate: vouchCap answers "how many", this answers
// "at all". A quantity and a boolean want different shapes, and collapsing
// them would mean every yes/no feature carried a meaningless number.
//
// schema.prisma's membershipTier comment requires the plan union and
// VOUCH_CAP_BY_MEMBERSHIP_TIER to move in the same commit. That invariant now covers
// this file too: a new tier needs a MEMBERSHIP_TIER_RANK entry, or every gate denies
// it (loudly — see below — but denies it).

// The membership tiers are cumulative, not a set of unrelated bundles: every
// tier so far is a strict superset of the one below it. Ranking them once
// here means a feature declares a MINIMUM rather than listing the tiers that
// include it — which is what stops a later edit granting something to Plus
// and forgetting Pro.
//
// This comment used to call them "a ladder", and the change is not cosmetic:
// "ladder" was the VOUCH axis's name, so the one sentence in this codebase
// that had to be clearest about billing was the sentence borrowing another
// axis's word for it. The vouch axis is now vouchLevelFor() in
// lib/vouchLevel.js and shares nothing with this file.
//
// Ranks, not the ordered array lib/verificationLevels.js uses, because this
// map is read with >= (see can() below) while verification levels are only
// ever read with === and Set.has. The two shapes disagree on purpose.
const MEMBERSHIP_TIER_RANK = { free: 0, plus: 1, pro: 2, enterprise: 3 };

const FEATURE_MIN_MEMBERSHIP_TIER = {
  // Third parties see the vouch COUNT on every plan; only paid plans show
  // the words. See ABRI-feature-checklist.md's Free tier: "'12 vouches' is
  // visible, the written words are not."
  //
  // Looks dead now that `acceptVouch` stops a Free business ever publishing
  // a vouch — a Free profile has nothing for this to hide. It isn't. This is
  // the DOWNGRADE path, and it's the only thing that makes a downgrade mean
  // anything: a business that published 12 vouches on Plus and then lapses
  // to Free keeps the count on its page and loses the words. Without this
  // gate, cancelling Plus would cost them nothing they could see.
  //
  // That path is one admin click away today (POST /admin/businesses/:id/plan)
  // and becomes automatic the moment membershipTierExpiresAt starts being enforced.
  // Don't remove this as unreachable — it's the thing that will be reached.
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

  // The two halves of the vouch paywall, and the shape of the Free tier.
  // A Free business may RECEIVE a vouch request in full — the row is
  // created, the activity event fires, the card appears in their queue —
  // and may not move it. That is deliberate: the request sitting there
  // unanswerable is the pitch, and a gate that hid it would throw the pitch
  // away to save the member a disappointment.
  //
  // Two features rather than one `vouching`, because they are enforced at
  // opposite ends of the state machine (POST /vouches vs POST
  // /vouches/:id/accept) and each reads at its own call site as the
  // question actually being asked.
  //
  // NOT gated, on purpose: cancel and flag. A member must always be able to
  // get rid of a vouch they don't want and to report an abusive one —
  // paywalling either would make "pay us" the only way out of content
  // somebody else put in front of you. `acceptVouch` covers revert too,
  // since reverting is a step towards publishing and nothing else.
  giveVouch: "plus",
  acceptVouch: "plus",

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
  const minimum = FEATURE_MIN_MEMBERSHIP_TIER[feature];
  if (minimum === undefined) {
    // Throws where an unknown PLAN only warns: an unknown plan is bad data
    // arriving at runtime, but an unknown feature is a typo in the calling
    // code. Returning false there would make a gate that never opens look
    // exactly like a gate that works, which is the worst way to find out.
    throw new Error(
      `Unknown feature ${JSON.stringify(feature)}. Known: ${Object.keys(FEATURE_MIN_MEMBERSHIP_TIER).join(", ")}.`
    );
  }

  const rank = MEMBERSHIP_TIER_RANK[business?.membershipTier];
  if (rank === undefined) {
    // Same call as vouchCap.js's: deny rather than throw, because an
    // off-union plan value is our data bug, not the visitor's, and a
    // public profile shouldn't 500 over it. Warn so we find out from the
    // logs rather than from a member asking why their page looks wrong.
    console.warn(
      `[entitlements] Unknown membershipTier ${JSON.stringify(business?.membershipTier)} — ` +
        `denying "${feature}".`
    );
    return false;
  }
  return rank >= MEMBERSHIP_TIER_RANK[minimum];
}

export { MEMBERSHIP_TIER_RANK, FEATURE_MIN_MEMBERSHIP_TIER, can };
