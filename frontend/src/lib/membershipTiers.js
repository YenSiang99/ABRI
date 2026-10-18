// The four membership TIERS, and the feature matrix behind the pricing table.
// The one axis of this product that is for sale — which is what the word
// "tier" now means, and the only thing it means.
//
// The two EARNED axes (verification level, endorsement level) are quarantined in
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
  enterprise: "Talk to us about my organisation.",
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
  {
    label: "Listed in the directory",
    free: true,
    plus: true,
    pro: true,
    enterprise: true,
  },
  // Every plan. It said Free: dash, Plus: tick until 12 Oct 2026, which
  // sold the badge — and the line under this table says you cannot pay your
  // way to it. A Free business whose SSM number checks out is SSM-Verified
  // like anyone else (lib/businessClaim.js verifyBusinessSsm reads no plan).
  {
    label: "SSM-verified badge, once we've checked your registration",
    free: true,
    plus: true,
    pro: true,
    enterprise: true,
  },
  // ─── The check-a-business screen, Sep 2026 ───────────────────────────────
  //
  // These five were missing from this table for a while after they shipped,
  // which is the failure mode this file exists to prevent in the other
  // direction: the table is usually accused of promising more than the
  // product has, and here it was quietly delivering more than it sold.
  //
  // The first is true in all four columns ON PURPOSE: the feed is open to
  // every member, and four ticks says "not gated", which is a thing worth
  // saying on a pricing page. ("Check a business" sat above it until 27 Sep
  // 2026, when the public check screen came off the site.)
  {
    label: "Trust feed — endorsements and verifications as they happen",
    free: true,
    plus: true,
    pro: true,
    enterprise: true,
  },
  // ENFORCED, by `networkOverlap` — and the only row here that gates on the
  // VIEWER's plan rather than the subject's. It is allowed to because it
  // withholds nothing the seller published: it compares the reader's own
  // connections against the business's endorsers, and a stranger has no
  // connections to compare. See the viewer-side gates block in
  // backend/src/lib/entitlements.js before adding a second one.
  {
    label: "See which of their endorsers you already know",
    free: false,
    plus: true,
    pro: true,
    enterprise: true,
  },
  // ENFORCED, by `watchBusinesses`. Pro's second delivered row.
  {
    label: "Watch a business for verification changes",
    free: false,
    plus: false,
    pro: true,
    enterprise: true,
  },
  // ENFORCED, by `checkHistory`.
  {
    label: "Your record of who you checked, and when",
    free: false,
    plus: false,
    pro: true,
    enterprise: true,
  },
  // ENFORCED, by `profileViewers` — and the only row in this table whose Free
  // and Plus columns are a STRING rather than a dash, because they are not
  // nothing. Every plan is told how many businesses opened its profile; what
  // Pro buys is their names. A dash in those columns would be the table
  // under-selling the product again, which is the failure the block above
  // this one describes.
  {
    label: "Who viewed your profile",
    free: "How many",
    plus: "How many",
    pro: "Who",
    enterprise: "Who",
  },
  // Free, and nothing anywhere gates it: PATCH /businesses/me asks only for
  // an approved claim. This row said `false` until Aug 2026, which made the
  // table the only thing in the product claiming otherwise. Editing your own
  // page is table stakes for being listed at all — what Plus buys is the
  // contact block on it being VISIBLE (see the row below), not writable.
  {
    label: "Full editable profile",
    free: true,
    plus: true,
    pro: true,
    enterprise: true,
  },
  // GATED, in the UI only — see FEATURE_MIN_MEMBERSHIP_TIER below and its counterpart
  // in backend/src/lib/entitlements.js. /app/card is not SHUT to Free: it
  // shows them the card artwork with their own details on it, marked as a
  // preview, and withholds the printed card, the status panel and the tap
  // history. The dash in this column is right anyway — what Plus sells is
  // the physical card, and a Free member doesn't get one.
  {
    label: "NFC card",
    free: false,
    plus: "1 card",
    pro: "1 card",
    enterprise: "Per person",
  },
  // ENFORCED. These four values must match ENDORSEMENT_CAP_BY_PLAN in
  // backend/src/lib/endorsementCap.js exactly — it's a rolling 30-day window,
  // not a calendar month.
  //
  // Free is a dash, not "0 / mo". Zero-of-a-quantity invites the reader to
  // treat it as a small allowance that might be topped up; a dash says the
  // feature starts at Plus, which is what the server enforces (`giveEndorsement`).
  {
    label: "Endorsements you can give",
    free: false,
    plus: "20 / mo",
    pro: "40 / mo",
    enterprise: "100 / mo",
  },
  // ENFORCED, by `acceptEndorsement` — and the row that describes the Free tier
  // most honestly, so it sits next to the giving row rather than further
  // down. A Free business still RECEIVES endorsement requests in full: the
  // request lands, the notification fires, the card sits in their queue.
  // What it can't do is publish one. Net effect, and the thing to say out
  // loud rather than let a reader discover: a Free business has no endorsements.
  {
    label: "Accept endorsements onto your profile",
    free: false,
    plus: true,
    pro: true,
    enterprise: true,
  },
  // ENFORCED, by FEATURE_MIN_MEMBERSHIP_TIER in backend/src/lib/entitlements.js —
  // GET /businesses/:id withholds the text itself, not just the UI.
  //
  // Endorsement caps, this row and the contact-details row below are the only
  // ones the SERVER enforces. The NFC card row is shut in the UI but not on
  // the wire (it has no endpoint yet). Every other row is still a promise,
  // and the comment saying so is what keeps this table from quietly becoming
  // fiction — move a row up as it starts being enforced.
  {
    label: "Testimonials shown on your page",
    free: false,
    plus: true,
    pro: true,
    enterprise: true,
  },
  // Every plan, since 11 Oct 2026: phone, WhatsApp and email reach any
  // logged-in member whatever the owner's plan (backend
  // lib/contactVisibility.js). The row stays so Free visibly includes it.
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
  {
    label: "Your contact details visible to members",
    free: true,
    plus: true,
    pro: true,
    enterprise: true,
  },
  // Five rows came off here on 12 Oct 2026 because nothing stood behind
  // them, and every founding member is on Pro and would have gone looking:
  // "Profile view alerts + weekly summary" (no WhatsApp sending yet), "Search
  // ranking" Standard/Higher/Top (directory order ignores the plan),
  // "Referral tracker", "Business card scanner" and "Team accounts". Each one
  // comes back as a row the day it is built — ABRI-feature-checklist.md has
  // them. A row here is a promise to a paying member; add it with the feature.
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
//   constants  — never appear as a delta at all: a row with the same string
//                in all four columns describes something billing does not
//                gate, so no card can imply you're buying it.
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
  ).map((row) => ({
    label: row.label,
    detail: row[t] === true ? null : row[t],
  }));
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
  // The viewer-side gates — see backend/src/lib/entitlements.js. Client copies
  // are UX only; the server answers 402 regardless.
  networkOverlap: "plus",
  watchBusinesses: "pro",
  checkHistory: "pro",
  // The NAMES of the businesses that opened your profile. Read to decide
  // whether the viewers tab renders a list or a count with a price on it —
  // NOT whether the tab renders at all. Every plan sees how many; only Pro
  // sees who. A `false` here must never blank the panel, or a Free member
  // loses the one number that would make them want it.
  profileViewers: "pro",
  testimonials: "plus",
  // Both server-enforced (POST /endorsements and POST /endorsements/:id/accept
  // respectively, which answer 402 with an `requiredMembershipTier` plan). Unlike
  // every other entry here, these two are read to decide whether a button
  // OPENS ITS ACTION OR AN UPGRADE PROMPT — never whether it renders. The
  // affordance staying visible is the whole mechanism: a Free member is
  // meant to reach for the thing and be told what it costs, not to find an
  // app with fewer buttons in it. See components/app/UpgradePrompt.jsx.
  giveEndorsement: "plus",
  // Covers reverting too — see the note on the same feature in
  // backend/src/lib/entitlements.js. Cancel and flag are deliberately
  // ungated on both sides.
  acceptEndorsement: "plus",
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
