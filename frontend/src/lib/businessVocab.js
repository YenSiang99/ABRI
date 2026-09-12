// Mirrors backend/src/lib/businessVocab.js.
//
// The server is the authority — POST /businesses/claim rejects anything that
// isn't in these lists. This copy exists so the register form can render the
// options rather than asking someone to guess them, which is the whole reason
// location used to arrive as free text.
//
// Kept as two flat arrays for the same reason lib/membershipTiers.js keeps its mirror
// flat: the moment this file grows logic of its own it stops being a mirror
// and starts being a second source of truth that can disagree with the server.

const BUSINESS_CATEGORIES = [
  "Corporate Secretarial",
  "Accounting & Tax",
  "Law",
  "IT Consulting",
  // See the backend copy for why this fifth one exists: a member had already
  // registered under it before the vocabularies gated new writes.
  "Design",
];

const BUSINESS_LOCATIONS = [
  "Kuala Lumpur",
  "Petaling Jaya",
  "Subang Jaya",
  "Shah Alam",
  "Puchong",
  "Bangsar",
  "Ampang",
];

export { BUSINESS_CATEGORIES, BUSINESS_LOCATIONS };
