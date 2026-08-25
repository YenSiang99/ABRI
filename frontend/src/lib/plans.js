// The four billing tiers, and the feature matrix behind the pricing table.
// Lives here rather than inside the Pricing section because two surfaces
// need it — the public comparison table and the member's own plan label in
// AppSidebar — and a later in-app upgrade screen will be a third. Mirrors
// backend/prisma/schema.prisma's Business.membershipPlan union; the values
// below are the ones actually stored, the labels are only for display.
const PLAN_ORDER = ["free", "plus", "pro", "enterprise"];

const planLabel = {
  free: "Free",
  plus: "Plus",
  pro: "Pro",
  enterprise: "Enterprise",
};

// What each plan is FOR, in the member's words. The pricing table sells the
// outcome and lets the feature rows justify it, rather than leading with a
// feature count — a business owner decides on "will this get me work",
// not on how many ticks a column has.
const planPitch = {
  free: "People can find me.",
  plus: "People can trust me.",
  pro: "The network brings me business.",
  enterprise: "One account for my whole organisation.",
};

const planPrice = {
  free: "RM0",
  plus: "RM490",
  pro: "RM1,490",
  enterprise: "Custom",
};

// Suffix rather than part of planPrice so the table can typeset it smaller,
// and so "Custom" doesn't render as "Custom / year".
const planPriceNote = {
  free: "forever",
  plus: "/ year",
  pro: "/ year",
  enterprise: "from RM3,500",
};

// One entry per feature row. `true` renders a tick, `false` a dash, and a
// string renders as-is for the rows where the answer is a quantity rather
// than a yes/no. Kept deliberately short — this is the table that has to be
// readable at a glance on a phone, not the full build checklist.
const PLAN_FEATURES = [
  { label: "Listed in the directory", free: true, plus: true, pro: true, enterprise: true },
  { label: "SSM-verified badge", free: false, plus: true, pro: true, enterprise: true },
  // Free, and nothing anywhere gates it: PATCH /businesses/me asks only for
  // an approved claim. This row said `false` until Aug 2026, which made the
  // table the only thing in the product claiming otherwise. Editing your own
  // page is table stakes for being listed at all — what Plus buys is the
  // contact block on it being VISIBLE (see the row below), not writable.
  { label: "Full editable profile", free: true, plus: true, pro: true, enterprise: true },
  // GATED, in the UI only — see FEATURE_MIN_PLAN below and its counterpart
  // in backend/src/lib/entitlements.js. /app/card is shut to Free.
  { label: "NFC card", free: false, plus: "1 card", pro: "1 card", enterprise: "Per person" },
  // ENFORCED. These four numbers must match VOUCH_CAP_BY_PLAN in
  // backend/src/lib/vouchCap.js exactly — it's a rolling 30-day window,
  // not a calendar month.
  { label: "Vouches you can give", free: "3 / mo", plus: "20 / mo", pro: "40 / mo", enterprise: "100 / mo" },
  // ENFORCED, by FEATURE_MIN_PLAN in backend/src/lib/entitlements.js —
  // GET /businesses/:id withholds the text itself, not just the UI.
  //
  // Vouch caps, this row and the contact-details row below are the only
  // three the SERVER enforces. The NFC card and introductions rows are shut
  // in the UI but not on the wire
  // (they have no endpoint yet). Every other row is still a promise, and
  // the comment saying so is what keeps this table from quietly becoming
  // fiction — move a row up as it starts being enforced.
  { label: "Testimonials shown on your page", free: false, plus: true, pro: true, enterprise: true },
  // ENFORCED. GET /businesses/:id withholds phone/whatsapp/email outright —
  // the server sends nothing, so there is no masked value on the page to
  // un-mask.
  //
  // The label says "Your" for a reason. It used to read "Contact details
  // visible" with "Members" in the paid cells, which stated the feature
  // backwards: it read as "you can see other people's", i.e. a viewer-side
  // paywall, which is explicitly NOT what was built. No plan is required to
  // SEE anyone's details — a free logged-in member sees a Plus member's, on
  // purpose. What Plus buys is being reachable. The viewer half of the gate
  // is only "be logged in", which is anti-scraping, not billing.
  //
  // Rule: backend/src/lib/contactVisibility.js.
  { label: "Your contact details visible to members", free: false, plus: true, pro: true, enterprise: true },
  { label: "Profile view alerts + weekly summary", free: false, plus: true, pro: true, enterprise: true },
  { label: "Search ranking", free: "Standard", plus: "Higher", pro: "Top", enterprise: "Top" },
  { label: "Requests board", free: "Read only", plus: "Read only", pro: "Post + reply", enterprise: "Private" },
  // The introductions half is GATED in the UI (/app/introductions); the
  // referral tracker doesn't exist yet.
  { label: "Referral tracker + introductions", free: false, plus: false, pro: true, enterprise: true },
  { label: "Business card scanner", free: false, plus: false, pro: true, enterprise: true },
  { label: "Team accounts", free: false, plus: false, pro: false, enterprise: true },
];

// Mirrors FEATURE_MIN_PLAN in backend/src/lib/entitlements.js, which is
// the authority — keep the two in step.
//
// For `testimonials` the server strips the data and this copy exists only
// so the UI can explain the gate before the payload arrives (e.g. telling
// an owner what visitors can't see on their own profile). For `nfcCard`
// and `introductions` there is no endpoint yet, so this copy is currently
// the ONLY thing shutting those screens — which is a real limit, not a
// safeguard: anyone can edit it in a browser. Never put anything behind
// this that would matter if it were read.
const FEATURE_MIN_PLAN = {
  testimonials: "plus",
  // Like `testimonials` and unlike the two below it: the server strips the
  // data, so this copy only lets the UI explain a gate that is already
  // enforced. It is also only HALF the rule — the full one additionally
  // requires the viewer to be logged in. That half has no mirror here
  // because the client already knows whether it's logged in, and modelling
  // it as a plan question is what would recreate the viewer-side paywall
  // this feature deliberately doesn't have.
  contactDetails: "plus",
  nfcCard: "plus",
  introductions: "pro",
};

// True when `plan` reaches the minimum tier for `feature`. Unknown plan or
// unknown feature returns false, matching the server's deny-by-default.
function planAllows(plan, feature) {
  const minimum = FEATURE_MIN_PLAN[feature];
  const i = PLAN_ORDER.indexOf(plan);
  const min = PLAN_ORDER.indexOf(minimum);
  return minimum !== undefined && i > -1 && i >= min;
}

// Everyone except the top tier has somewhere to go. Derived from
// PLAN_ORDER rather than comparing against "enterprise" by name, so adding
// a tier above it can't leave a dead Upgrade link pointing nowhere.
// An unrecognised plan gets `false`: the caller can't say where to upgrade
// TO, so it shouldn't offer.
function canUpgradeFrom(plan) {
  const i = PLAN_ORDER.indexOf(plan);
  return i > -1 && i < PLAN_ORDER.length - 1;
}

export {
  PLAN_ORDER,
  PLAN_FEATURES,
  FEATURE_MIN_PLAN,
  planAllows,
  planLabel,
  planPitch,
  planPrice,
  planPriceNote,
  canUpgradeFrom,
};
