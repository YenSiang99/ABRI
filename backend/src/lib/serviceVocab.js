import { BUSINESS_CATEGORIES } from "./businessVocab.js";

// What a business actually DOES, one rung below its category.
//
// THE SAME ARGUMENT businessVocab.js MAKES, one field along. That file closed
// category and location because the Asks board joins on them by equality, and
// a business that typed "PJ" is one no ask will ever reach — silently. Services
// are where that bug still lives: `Business.services` has been free text
// entered as a comma-separated string, so "SSM filings", "SSM filing" and
// "Filing with SSM" are three unrelated values, and nothing can match on any of
// them. That is why the board can only route on category today.
//
// HYBRID, NOT CLOSED, and that is the one place this departs from
// businessVocab.js. Google Business Profile — the model asked for — closes its
// CATEGORY taxonomy and leaves services open with suggestions, and it is right
// to: a closed service list is a promise that we can name every professional
// service in the Klang Valley, which we cannot. So:
//
//   CANONICAL services come from the catalogue below. They are the ones that
//     can ever be matched on, because two businesses picking the same one have
//     provably picked the same thing.
//   CUSTOM services are anything else the owner types. They render on the
//     profile and are searchable as text, and they are deliberately NOT part
//     of any join. "B2B Specialist" is a real service one seeded business
//     offers and a string no second business will ever type identically.
//
// That split is what lets this ship without a backfill. Of the 24 seeded
// businesses, every service value is either in this catalogue or becomes a
// custom one; nothing is dropped and nothing needs rewriting.
//
// GROWING THE CATALOGUE IS CHEAP AND SAFE. Adding an entry can only turn a
// string that was custom into one that is canonical, which can only add
// matches. Removing one is the dangerous direction — it silently demotes every
// business that had picked it — so prefer leaving a retired service in place.
const SERVICES_BY_CATEGORY = {
  "Corporate Secretarial": [
    "Company incorporation",
    "Statutory filings",
    "Compliance advisory",
    "Company secretary retainer",
    "Registered office address",
    "Share transfers & allotments",
    "Board & AGM support",
    "Striking off & winding up",
    "Nominee director services",
    "CTC document certification",
  ],
  "Accounting & Tax": [
    "SSM filings",
    "Tax advisory",
    "Bookkeeping",
    "Payroll",
    "Audit support",
    "SST advisory",
    "LHDN e-Invoice readiness",
    "Management accounts",
    "EPF & SOCSO submissions",
    "Transfer pricing documentation",
    "Tax appeals & disputes",
    "Cash flow & budgeting",
  ],
  Law: [
    "Contracts",
    "Corporate structuring",
    "Dispute resolution",
    "Employment law",
    "Mergers & acquisitions",
    "Intellectual property",
    "Conveyancing",
    "Debt recovery",
    "Data protection & PDPA",
    "Litigation",
    "Shareholder agreements",
    "Licensing & regulatory",
  ],
  "IT Consulting": [
    "Cloud migration",
    "Systems integration",
    "IT infrastructure",
    "Cybersecurity assessment",
    "Managed IT support",
    "Software development",
    "Data & analytics",
    "ERP implementation",
    "Network setup",
    "Backup & disaster recovery",
    "IT policy & compliance",
  ],
};

// Every canonical service across every category, for the membership test. A
// business is not restricted to its own category's list: an Accounting firm
// that genuinely does payroll software integration should be able to say so,
// and a cross-category pick is still a canonical value that matches cleanly.
const ALL_CANONICAL_SERVICES = Object.values(SERVICES_BY_CATEGORY).flat();

// Lower-cased -> canonical spelling. The match is case- and space-insensitive
// so an owner who types "ssm filings" gets the canonical row rather than a
// custom one that looks identical on screen and matches nothing. This is the
// single most likely way a canonical service would be missed.
const CANONICAL_BY_KEY = new Map(
  ALL_CANONICAL_SERVICES.map((s) => [s.toLowerCase().replace(/\s+/g, " ").trim(), s]),
);

// The catalogue to offer an owner in `category`, most relevant first: their own
// category's services, then everything else. Returns two lists rather than one
// concatenated one — the picker shows the first as checked-by-default options
// and the second behind "other categories", and a caller that got one flat
// array would have to re-derive that split.
function serviceCatalogueFor(category) {
  const own = SERVICES_BY_CATEGORY[category] ?? [];
  const ownSet = new Set(own);
  const others = BUSINESS_CATEGORIES.filter((c) => c !== category).map((c) => ({
    category: c,
    services: (SERVICES_BY_CATEGORY[c] ?? []).filter((s) => !ownSet.has(s)),
  }));
  return { category, services: own, others };
}

// The canonical spelling of `value`, or null if it is a custom service.
function canonicalService(value) {
  if (typeof value !== "string") return null;
  return CANONICAL_BY_KEY.get(value.toLowerCase().replace(/\s+/g, " ").trim()) ?? null;
}

function isCanonicalService(value) {
  return canonicalService(value) !== null;
}

// Splits a stored services array into the half that can be matched on and the
// half that can only be read. Both halves keep the owner's order.
function splitServices(services = []) {
  const canonical = [];
  const custom = [];
  for (const raw of services) {
    const hit = canonicalService(raw);
    if (hit) canonical.push(hit);
    else if (typeof raw === "string" && raw.trim()) custom.push(raw.trim());
  }
  return { canonical, custom };
}

export {
  SERVICES_BY_CATEGORY,
  ALL_CANONICAL_SERVICES,
  serviceCatalogueFor,
  canonicalService,
  isCanonicalService,
  splitServices,
};
