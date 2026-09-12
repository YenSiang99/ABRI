// The closed vocabularies a Business is described by, and the one place both
// unions are enforced.
//
// Both columns are plain String at the DB level (see schema.prisma, which has
// no Prisma enums anywhere), so this module is what actually constrains them —
// the same role CONNECTION_SOURCES plays in lib/connections.js.
//
// Why they have to be closed, when they were free text until now: the Asks
// board routes an ask to the businesses who can answer it by joining
// Ask.matchCategory/matchLocation against these two columns on equality. A
// business that typed "PJ", "Petaling jaya" or "petaling  jaya" is a business
// no ask will ever reach, and it fails silently — they simply never hear about
// work they could have done. Category was already a <select> on the register
// form; location was an <input> with a placeholder, which is the whole bug.
//
// No backfill was needed to introduce this: all 22 seeded rows already used
// exactly these values. It gates new writes only.

// The four professional-services categories of the Klang Valley corridor the
// blueprint says to reach real density in before opening a second one. This is
// the same list frontend/src/pages/auth/Register.jsx has rendered from since
// the beginning; it moved here so the server stops trusting the client's copy.
const BUSINESS_CATEGORIES = [
  "Corporate Secretarial",
  "Accounting & Tax",
  "Law",
  "IT Consulting",
  // ADDED BECAUSE A REAL BUSINESS WAS ALREADY IN IT. This list gates new
  // writes only, and one member registered under "Design" before that gate
  // existed — which left them matchable by no ask and findable by no service
  // filter, silently, which is the exact failure this file was written to
  // stop. Recategorising somebody's own description of their business would
  // have been the wrong fix.
  //
  // The four above are still the go-to-market focus (see the note there);
  // this is a fifth the network already contains, not a widening of it. The
  // value matches the stored column exactly, so no migration was needed.
  "Design",
];

// The six localities the seeded corridor covers.
//
// This list GROWS, and that is planned rather than a smell: the corridor SSM
// import will land 15-30 real Klang Valley localities. When it does, the thing
// to add alongside them is a locality -> region grouping, so matchTierFor in
// lib/asks.js can match "same region" between "same locality" and "same trade"
// — six values make an exact category+location match plausible, thirty do not.
//
// What must NOT happen instead is loosening the join to substring or fuzzy
// matching. That converts a closed list back into free text by the back door
// and takes the silent-miss bug with it.
const BUSINESS_LOCATIONS = [
  "Kuala Lumpur",
  "Petaling Jaya",
  "Subang Jaya",
  "Shah Alam",
  "Puchong",
  "Bangsar",
  // Same story as "Design" above: a member had already registered here before
  // the gate existed. This list was always going to grow — see the note above
  // about the corridor SSM import — so this is the planned direction arriving
  // one locality early rather than an exception to it.
  "Ampang",
];

const BUSINESS_CATEGORY_SET = new Set(BUSINESS_CATEGORIES);
const BUSINESS_LOCATION_SET = new Set(BUSINESS_LOCATIONS);

function isValidCategory(value) {
  return BUSINESS_CATEGORY_SET.has(value);
}

function isValidLocation(value) {
  return BUSINESS_LOCATION_SET.has(value);
}

export {
  BUSINESS_CATEGORIES,
  BUSINESS_LOCATIONS,
  isValidCategory,
  isValidLocation,
};
