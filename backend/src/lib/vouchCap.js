// How many vouches a business may give per rolling 30-day window, by
// membershipPlan. Rolling rather than calendar-month: a calendar-month cap
// lets someone burn their whole allotment on the last day of the month and
// get a fresh batch the next day, at identical implementation cost to a
// rolling window. "enterprise" is priced here even though it isn't
// sellable yet — a lookup-map entry costs nothing, unlike a future
// migration would.
const VOUCH_CAP_BY_PLAN = { basic: 10, premium: 20, enterprise: 40 };
const VOUCH_CAP_WINDOW_DAYS = 30;

function vouchCapFor(membershipPlan) {
  return VOUCH_CAP_BY_PLAN[membershipPlan] ?? VOUCH_CAP_BY_PLAN.basic;
}

function vouchCapWindowStart() {
  return new Date(Date.now() - VOUCH_CAP_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

export { vouchCapFor, vouchCapWindowStart };
