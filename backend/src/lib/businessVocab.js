// The closed vocabularies a Business is described by, and the one place both
// unions are enforced.
//
// Both columns are plain String at the DB level (see schema.prisma, which has
// no Prisma enums anywhere), so this module is what actually constrains them —
// the same role CONNECTION_SOURCES plays in lib/connections.js.
//
// Why they have to be closed, when they were free text until now: anything
// that groups or matches businesses does so by comparing these two columns on
// equality. A business that typed "PJ", "Petaling jaya" or "petaling  jaya"
// is a business nothing will ever match, and it fails silently — they simply
// never appear where they should. Category was already a <select> on the
// register form; location was an <input> with a placeholder, which is the
// whole bug.
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
];

// The six localities the seeded corridor covers.
//
// This list GROWS, and that is planned rather than a smell: the corridor SSM
// import will land 15-30 real Klang Valley localities. When it does, the thing
// to add alongside them is a locality -> region grouping, so a match can mean
// "same region" as well as "same locality" — six values make an exact
// category+location match plausible, thirty do not.
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
