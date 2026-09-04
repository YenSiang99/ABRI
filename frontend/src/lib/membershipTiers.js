// The four membership TIERS, and the feature matrix behind the pricing table.
// The one axis of this product that is for sale — which is what the word
// "tier" now means, and the only thing it means.
//
// The two EARNED axes (verification level, vouch level) are quarantined in
// lib/trustLabels.js and must never be labelled from here; see that file's
// header. The exported label map is `membershipTierLabel`, not `tierLabel`,
// and that is the one naming decision in this rename a build cannot check
// for you.
//
// Lives here rather than inside the Pricing section because two surfaces
// need it — the public comparison table and the member's own tier chip in
// AppSidebar — and a later in-app upgrade screen will be a third. Mirrors
// backend/prisma/schema.prisma's Business.membershipTier union; the values
// below are the ones actually stored, the labels are only for display.
const MEMBERSHIP_TIER_ORDER = ["free", "plus", "pro", "enterprise"];

const membershipTierLabel = {
  free: "Free",
  plus: "Plus",
  pro: "Pro",
  enterprise: "Enterprise",
};

// What each plan is FOR, in the member's words. The pricing table sells the
// outcome and lets the feature rows justify it, rather than leading with a
// feature count — a business owner decides on "will this get me work",
// not on how many ticks a column has.
const membershipTierPitch = {
  free: "People can find me.",
  plus: "People can trust me.",
  pro: "The network brings me business.",
  enterprise: "One account for my whole organisation.",
};

const membershipTierPrice = {
  free: "RM0",
  plus: "RM490",
  pro: "RM1,490",
  enterprise: "Custom",
};

// Suffix rather than part of membershipTierPrice so the table can typeset it smaller,
// and so "Custom" doesn't render as "Custom / year".
const membershipTierPriceNote = {
  free: "forever",
  plus: "/ year",
  pro: "/ year",
  enterprise: "from RM3,500",
};

// One entry per feature row. `true` renders a tick, `false` a dash, and a
// string renders as-is for the rows where the answer is a quantity rather
// than a yes/no. Kept deliberately short — this is the table that has to be
// readable at a glance on a phone, not the full build checklist.
const MEMBERSHIP_TIER_FEATURES = [
  { label: "Listed in the directory", free: true, plus: true, pro: true, enterprise: true },
  { label: "SSM-verified badge", free: false, plus: true, pro: true, enterprise: true },
  // Free, and nothing anywhere gates it: PATCH /businesses/me asks only for
  // an approved claim. This row said `false` until Aug 2026, which made the
  // table the only thing in the product claiming otherwise. Editing your own
  // page is table stakes for being listed at all — what Plus buys is the
  // contact block on it being VISIBLE (see the row below), not writable.
  { label: "Full editable profile", free: true, plus: true, pro: true, enterprise: true },
  // GATED, in the UI only — see FEATURE_MIN_MEMBERSHIP_TIER below and its counterpart
  // in backend/src/lib/entitlements.js. /app/card is not SHUT to Free: it
  // shows them the card artwork with their own details on it, marked as a
  // preview, and withholds the printed card, the status panel and the tap
  // history. The dash in this column is right anyway — what Plus sells is
  // the physical card, and a Free member doesn't get one.
  { label: "NFC card", free: false, plus: "1 card", pro: "1 card", enterprise: "Per person" },
  // ENFORCED. These four values must match VOUCH_CAP_BY_PLAN in
  // backend/src/lib/vouchCap.js exactly — it's a rolling 30-day window,
  // not a calendar month.
  //
  // Free is a dash, not "0 / mo". Zero-of-a-quantity invites the reader to
  // treat it as a small allowance that might be topped up; a dash says the
  // feature starts at Plus, which is what the server enforces (`giveVouch`).
  { label: "Vouches you can give", free: false, plus: "20 / mo", pro: "40 / mo", enterprise: "100 / mo" },
  // ENFORCED, by `acceptVouch` — and the row that describes the Free tier
  // most honestly, so it sits next to the giving row rather than further
  // down. A Free business still RECEIVES vouch requests in full: the
  // request lands, the notification fires, the card sits in their queue.
  // What it can't do is publish one. Net effect, and the thing to say out
  // loud rather than let a reader discover: a Free business has no vouches.
  { label: "Accept vouches onto your profile", free: false, plus: true, pro: true, enterprise: true },
  // ENFORCED, by FEATURE_MIN_MEMBERSHIP_TIER in backend/src/lib/entitlements.js —
  // GET /businesses/:id withholds the text itself, not just the UI.
  //
  // Vouch caps, this row and the contact-details row below are the only
  // ones the SERVER enforces. The NFC card row is shut in the UI but not on
  // the wire (it has no endpoint yet). Every other row is still a promise,
  // and the comment saying so is what keeps this table from quietly becoming
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
  // Nothing behind this yet — no route, no screen, no data. It used to read
  // "Referral tracker + introductions"; the introductions half was removed
  // in Aug 2026 (the screen was mock data end to end) and the referral
  // tracker has never been built, so this row is Pro's headline promise and
  // is entirely a promise. It's the first thing to make real, or the first
  // thing to replace, before Pro is sold to anyone.
  { label: "Referral tracker", free: false, plus: false, pro: true, enterprise: true },
  { label: "Business card scanner", free: false, plus: false, pro: true, enterprise: true },
  { label: "Team accounts", free: false, plus: false, pro: false, enterprise: true },
];

// The features tier `t` adds over the tier below it, for the in-app upgrade
// cards on pages/app/Plan.jsx. Derived from MEMBERSHIP_TIER_FEATURES rather
// than written out a second time: a card list that restates the matrix in its
// own words is the drift this file's single-source layout exists to prevent.
//
// A row belongs to tier `t` when its value CHANGED from the tier below AND is
// truthy. That falls out correctly for the three shapes of row in the matrix:
//
//   booleans   — appear once, on the tier that first turns them on.
//   quantities — appear on every tier that raises them ("20 / mo" then
//                "40 / mo"), and drop off where they don't ("Top" under Pro
//                stays "Top" under Enterprise, so Enterprise doesn't claim it).
//   constants  — never appear as a delta at all: a row that reads the same
//                in every column is not something any tier is buying.
//
// `free` is the base case: its own truthy rows, since there is no tier below.
//
// Returns { label, detail } rather than a formatted string — detail is null
// for a plain boolean and the cell's own text for a quantity. Typography is
// the page's job, not this file's.
function membershipTierUpgrades(t) {
  const i = MEMBERSHIP_TIER_ORDER.indexOf(t);
  if (i < 0) return [];
  const below = MEMBERSHIP_TIER_ORDER[i - 1];
  return MEMBERSHIP_TIER_FEATURES.filter(
    (row) => Boolean(row[t]) && (below === undefined || row[t] !== row[below]),
  ).map((row) => ({ label: row.label, detail: row[t] === true ? null : row[t] }));
}

// Mirrors FEATURE_MIN_MEMBERSHIP_TIER in backend/src/lib/entitlements.js, which is
// the authority — keep the two in step.
//
// For `testimonials` the server strips the data and this copy exists only
// so the UI can explain the gate before the payload arrives (e.g. telling
// an owner what visitors can't see on their own profile). For `nfcCard`
// there is no endpoint yet, so this copy is currently the ONLY thing
// deciding what /app/card renders — which is a real limit, not a safeguard:
// anyone can edit it in a browser. Never put anything behind this that would
// matter if it were read.
//
// It happens not to matter for the card today: everything that entry
// withholds is either a physical object nobody can grant themselves or mock
// data that is false for every plan. That is luck, not design — the moment a
// real taps table exists, this gate needs a server half.
const FEATURE_MIN_MEMBERSHIP_TIER = {
  testimonials: "plus",
  // Like `testimonials` and unlike the two below it: the server strips the
  // data, so this copy only lets the UI explain a gate that is already
  // enforced. It is also only HALF the rule — the full one additionally
  // requires the viewer to be logged in. That half has no mirror here
  // because the client already knows whether it's logged in, and modelling
  // it as a plan question is what would recreate the viewer-side paywall
  // this feature deliberately doesn't have.
  contactDetails: "plus",
  // Both server-enforced (POST /vouches and POST /vouches/:id/accept
  // respectively, which answer 402 with an `requiredMembershipTier` plan). Unlike
  // every other entry here, these two are read to decide whether a button
  // OPENS ITS ACTION OR AN UPGRADE PROMPT — never whether it renders. The
  // affordance staying visible is the whole mechanism: a Free member is
  // meant to reach for the thing and be told what it costs, not to find an
  // app with fewer buttons in it. See components/app/UpgradePrompt.jsx.
  giveVouch: "plus",
  // Covers reverting too — see the note on the same feature in
  // backend/src/lib/entitlements.js. Cancel and flag are deliberately
  // ungated on both sides.
  acceptVouch: "plus",
  nfcCard: "plus",
};

// True when `plan` reaches the minimum tier for `feature`. Unknown plan or
// unknown feature returns false, matching the server's deny-by-default.
function membershipTierAllows(plan, feature) {
  const minimum = FEATURE_MIN_MEMBERSHIP_TIER[feature];
  const i = MEMBERSHIP_TIER_ORDER.indexOf(plan);
  const min = MEMBERSHIP_TIER_ORDER.indexOf(minimum);
  return minimum !== undefined && i > -1 && i >= min;
}

// Everyone except the top tier has somewhere to go. Derived from
// MEMBERSHIP_TIER_ORDER rather than comparing against "enterprise" by name, so adding
// a tier above it can't leave a dead Upgrade link pointing nowhere.
// An unrecognised plan gets `false`: the caller can't say where to upgrade
// TO, so it shouldn't offer.
function canUpgradeFromMembershipTier(plan) {
  const i = MEMBERSHIP_TIER_ORDER.indexOf(plan);
  return i > -1 && i < MEMBERSHIP_TIER_ORDER.length - 1;
}

export {
  MEMBERSHIP_TIER_ORDER,
  MEMBERSHIP_TIER_FEATURES,
  FEATURE_MIN_MEMBERSHIP_TIER,
  membershipTierAllows,
  membershipTierUpgrades,
  membershipTierLabel,
  membershipTierPitch,
  membershipTierPrice,
  membershipTierPriceNote,
  canUpgradeFromMembershipTier,
};
