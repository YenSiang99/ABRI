// How many vouches a business may give per rolling 30-day window, by
// membershipPlan. Rolling rather than calendar-month: a calendar-month cap
// lets someone burn their whole allotment on the last day of the month and
// get a fresh batch the next day, at identical implementation cost to a
// rolling window.
//
// This map and the membershipPlan union in schema.prisma have to change in
// the same commit, always. A plan value with no entry here used to fall
// back to a hardcoded key, so a rename made every lookup miss AND the
// fallback key vanish — cap became undefined, `submittedCount >= cap` was
// always false, and the limit quietly stopped existing. It now falls back
// to the most restrictive tier instead, so the failure mode of an unknown
// plan is "too strict" (visible, complained about) rather than "no limit
// at all" (invisible, and exactly what the cap is there to prevent).
//
// Free is 0, and that is a paywall rather than a quota: a Free business
// cannot give a vouch at all. The cap is not what enforces it — POST
// /vouches asks lib/entitlements.js's `giveVouch` first, so a Free member
// gets a priced door ("Giving vouches is part of Plus") instead of this
// module's wording, which would tell them they had used up a limit of zero.
// The 0 is here so the two can't disagree: if the entitlement check were
// ever removed, the cap would still hold.
const VOUCH_CAP_BY_PLAN = { free: 0, plus: 20, pro: 40, enterprise: 100 };
// Now 0, which makes the unknown-plan fallback a total block rather than a
// tight quota. Still the intended direction — see below — and it matches
// what entitlements.js does with the same unknown value, which denies every
// feature and warns. An off-union plan should fail the same way everywhere.
const VOUCH_CAP_FALLBACK = Math.min(...Object.values(VOUCH_CAP_BY_PLAN));
const VOUCH_CAP_WINDOW_DAYS = 30;

function vouchCapFor(membershipPlan) {
  const cap = VOUCH_CAP_BY_PLAN[membershipPlan];
  if (cap === undefined) {
    // Warn rather than throw: an off-union plan value is a bug in our data,
    // but it's not the vouching member's bug and they shouldn't get a 500
    // for it. Without this line the only symptom is a member quietly
    // capped at 3 and eventually complaining — which is us finding out
    // from the customer instead of from the logs.
    console.warn(
      `[vouchCap] Unknown membershipPlan ${JSON.stringify(membershipPlan)} — ` +
        `falling back to the strictest cap (${VOUCH_CAP_FALLBACK}/30d).`
    );
    return VOUCH_CAP_FALLBACK;
  }
  return cap;
}

function vouchCapWindowStart() {
  return new Date(Date.now() - VOUCH_CAP_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

export { vouchCapFor, vouchCapWindowStart };
