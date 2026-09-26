// The closed vocabularies a Business is described by, and the one place both
// unions are enforced.
//
// Both columns are plain String at the DB level (see schema.prisma, which has
// no Prisma enums anywhere), so this module is what actually constrains them —
// the same role CONNECTION_SOURCES plays in lib/connections.js.
//
// Why they have to be closed, when they were free text until now: the
// directory and the service browse both filter on these two columns by
// equality. A business that typed "PJ", "Petaling jaya" or "petaling  jaya" is
// a business no filter will ever return, and it fails silently — they simply
// never appear in a search they should have won. Category was already a
// <select> on the register form; location was an <input> with a placeholder,
// which is the whole bug.
//
// The asks board was the original reason these were closed, and it is gone.
// THEY MUST STAY CLOSED ANYWAY — browsing is now the only way anyone is found
// at all, so an unmatchable value costs more than it did before, not less.
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
  // existed — which left them findable by no category and no service filter,
  // silently, which is the exact failure this file was written to stop.
  // Recategorising somebody's own description of their business would have
  // been the wrong fix.
  //
  // The four above are still the go-to-market focus (see the note there);
  // this is a fifth the network already contains, not a widening of it. The
  // value matches the stored column exactly, so no migration was needed.
  "Design",
  // ── The everyday SMEs, added Sept 2026 ────────────────────────────────
  //
  // THE FIVE ABOVE ARE SUPPLIERS OF PROFESSIONAL SERVICES; THESE ARE THE ONES
  // WHO BUY THEM, and the network does not work without both halves. A
  // directory holding only accountants, lawyers and company secretaries is a
  // directory where everybody sells the same thing to nobody, and the most
  // common real transaction in the corridor (a bakery needs an accountant)
  // cannot be expressed at all — neither party is even in the list.
  //
  // This does NOT widen the go-to-market. The blueprint's corridor focus is
  // about where the PAID members come from, and that is still the five above:
  // an accountant sells to many SMEs, so the supply side is where density and
  // revenue are. What these add is the demand side that makes a portfolio
  // entry mean something: work logged between two halves of a real trade.
  //
  // Widening a closed list is the SAFE direction, the same argument
  // serviceVocab.js makes about growing its catalogue: adding a value can only
  // turn a business that was unregisterable into one that matches. Removing
  // one is the dangerous direction — it silently orphans every row that held
  // it — so prefer leaving a retired category in place.
  "Food & Beverage",
  "Retail",
  "Manufacturing",
  "Construction & Trades",
  "Logistics",
  "Property",
  "Education",
  "Health & Wellness",
  "Marketing & Media",
  "Professional Training",
  // Added Sept 2026 from the seeding pull (ABRI-data-sources.md): workshops,
  // dealers, tyre and parts shops were the largest group of real corridor
  // businesses with no category to go in — about 6,000 of them. Another
  // buyer-side SME, and a heavy user of accountants and insurers.
  "Automotive",
];

// The localities of the Klang Valley corridor.
//
// This list GROWS, and that is planned rather than a smell. The first seven
// were the seeded corridor; the rest arrived in Sept 2026 with the free-data
// seeding pull (ABRI-data-sources.md), which found tens of thousands of real
// businesses in them that had nowhere to go — Klang alone about 10,800.
//
// Twenty-odd values is where the note that used to be here said a
// locality -> region grouping should come in, so the directory can offer
// "same region" between "same locality" and everything. Nothing filters on
// location yet, so there is nothing for a grouping to serve; add it with the
// first filter that does.
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
  // the gate existed.
  "Ampang",
  // ── Added Sept 2026 from the seeding pull, largest first ──────────────
  "Klang",
  "Kajang",
  "Selayang",           // includes Batu Caves and Gombak (postcodes 681xx)
  "Seri Kembangan",
  "Cheras (Selangor)",  // Batu 9 / Balakong side; Cheras inside KL is "Kuala Lumpur"
  "Bangi",
  "Rawang",
  "Sungai Buloh",
  "Nilai",              // Negeri Sembilan, but part of the same commuter belt
  "Putrajaya",
  "Cyberjaya",
  "Semenyih",
  "Dengkil",
  "Sepang",
  "Hulu Langat",
  "Serdang",
  "Banting",
  "Puncak Alam",
  "Ijok",
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
