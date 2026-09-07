// Turning one typed string into a query about businesses. THE search engine —
// both GET /businesses (browse the directory) and GET /businesses/lookup
// (check one business) build their `where` here.
//
// SHARED, AND IT DID NOT START THAT WAY. This file was written arguing the
// opposite: that the directory is BROWSE and the lookup is IDENTIFY, and that
// widening the directory's OR clause would change what browsing means in
// order to answer a different question. That held while they were two
// products for two audiences.
//
// It stopped holding when a logged-in member ended up with two search boxes —
// /app/directory and /app/check — doing the same job in the same session with
// nothing to tell them apart. A member's one box has to answer both "who is
// out there?" and "is this them?", so sharing the clause is now the point
// rather than the hazard.
//
// What still differs is the CONTRACT, not the matching:
//
//                    GET /businesses        GET /businesses/lookup
//   job              browse + act           identify one
//   category match   yes (includeCategory)  no
//   paging           page + cap             fixed cap of 8
//   rate limited     no                     yes
//   ranked           only for identifiers   always
//
// Category matching is the one real asymmetry, and it is what the two jobs
// disagree about: "Accounting" is a browse word that should return every
// accountant, and is noise on a screen asking whether one specific company is
// real.
//
// THE RULE THIS FILE EXISTS TO PROTECT: ABRI has no SSM registry access. A
// miss means "we have no record of them" and NOTHING ELSE. Not "unregistered",
// not "suspicious". The blueprint's founding principle #8 is "lead with
// credibility and status, never fear", and its own words for this screen are
// "honest flag: Not yet verified ON ABRI". Every caller of this module is
// answering a question about ABRI's membership, never about the real world.
import { UNCLAIMED } from "./verificationLevels.js";

// How many matches a single lookup returns.
//
// Small on purpose. This is not a browse surface — a member pasting a company
// name wants to recognise one row, and a lookup that returns forty is a
// directory search wearing the wrong label. It also bounds what a scripted
// caller gets per request, which matters more here than on the directory
// because this route is the one being advertised publicly.
const LOOKUP_LIMIT = 8;

// The shortest query worth running. One character matches most of the
// directory and teaches the reader nothing.
const MIN_QUERY_LENGTH = 2;

// SSM registration numbers arrive in at least three shapes, and they are all
// the same number:
//
//   "202301234567 (1234567-A)"   as printed on a letterhead
//   "2023 0123 4567"             as typed by a human
//   "1234567-A"                  the pre-2016 format
//
// Stripping to alphanumerics and upper-casing collapses the punctuation
// differences without trying to parse the format — deliberately, because
// Business.ssm has NO format contract anywhere in this codebase (nothing has
// ever validated it and nothing has ever written one), so a parser here would
// be inventing a rule the stored data has never had to obey.
//
// The match is then "does either normalized value contain the other", which
// catches the letterhead form against a stored bare number and vice versa.
function normalizeSsm(value) {
  return String(value ?? "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

// A pasted URL or email domain down to a bare host.
//
//   "https://www.meridianaccounting.my/about"  -> "meridianaccounting.my"
//   "HELLO@Meridianaccounting.MY"              -> "meridianaccounting.my"
//
// Business.domain is stored bare ("meridianaccounting.my") and Business
// .website with a scheme ("https://meridianaccounting.my"), so normalizing the
// INPUT to the bare form lets one value be compared against both — the
// website match is a `contains` for exactly that reason.
//
// Not a URL parser: `new URL()` throws on the bare hosts people actually
// paste, and the failure mode of a regex here is a query that finds nothing,
// which the miss state already handles honestly.
function normalizeDomain(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "") // scheme
    .replace(/^[^@/]*@/, "") // an email's local part
    .replace(/^www\./, "")
    .split(/[/?#]/)[0]
    .replace(/:\d+$/, ""); // port
}

// Whether a string could be a domain at all. Keeps the domain clause off
// queries like "Meridian Accounting", where it would only add noise.
function looksLikeDomain(value) {
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(value);
}

// The separate pieces of a pasted registration number, normalized.
//
// A letterhead carries BOTH numbers — "202301234567 (1234567-A)" — so a
// member who copies the whole line submits a string longer than either stored
// value. Normalizing the whole thing gives "2023012345671234567A", which
// `contains` will never find, and the reverse test (does the QUERY contain the
// stored value) is not expressible in a Prisma `where` at all.
//
// Splitting on the separators first is what closes that: each piece is tried
// as a whole key, so the letterhead form finds a business stored under either
// of its two numbers. Pieces shorter than four characters are dropped — "A"
// off the end of an old-format number would otherwise match every row whose
// key contains an A.
function ssmTokens(value) {
  return [
    ...new Set(
      String(value ?? "")
        .split(/[^a-zA-Z0-9]+/)
        .map(normalizeSsm)
        .filter((token) => token.length >= 4),
    ),
  ];
}

// The Prisma `where` for a search, on either route.
//
// Clauses OR'd together, each targeting a different thing the member might
// have typed. The ssm and domain clauses are omitted entirely when the input
// cannot be one, rather than run against an impossible value — fewer clauses
// is a faster query, and both callers are public.
//
// includeCategory is the directory's half. "Accounting" must return every
// accountant when somebody is browsing, and must NOT widen a check on one
// company into a list of everyone in their trade — see the header.
//
// PHONE IS DELIBERATELY ABSENT. `phone` is stored as "03-7955 1234" and
// `whatsapp` as bare "60123451234", so matching a pasted number needs the
// COLUMN normalized too, which Prisma cannot express — it would take raw SQL
// (this codebase has exactly one such query, and treats it as notable) or a
// stored normalized column plus a migration. Only 8 of 34 rows carry a phone
// today. Worth doing when phone capture is consistent; not worth a
// regexp_replace now. This comment is the reason, so the next reader doesn't
// assume it was forgotten.
function lookupWhere(query, { includeCategory = false } = {}) {
  const raw = String(query ?? "").trim();
  const ssm = normalizeSsm(raw);
  const domain = normalizeDomain(raw);

  const clauses = [{ name: { contains: raw, mode: "insensitive" } }];
  if (includeCategory) clauses.push({ category: { contains: raw, mode: "insensitive" } });

  // Against ssmNormalized, never against `ssm` — the raw column keeps the
  // punctuation the member typed, so "1234567-A" there would not match a
  // query normalized to "1234567A".
  //
  // Two shapes, because a number can be pasted long or short. `contains`
  // catches a stored key that is longer than what was typed (a bare number
  // found inside a stored letterhead); the token equalities catch the reverse,
  // which SQL cannot express as a substring test in this direction.
  if (ssm.length >= MIN_QUERY_LENGTH) {
    clauses.push({ ssmNormalized: { contains: ssm } });
    for (const token of ssmTokens(raw)) {
      if (token !== ssm) clauses.push({ ssmNormalized: token });
    }
  }

  if (looksLikeDomain(domain)) {
    clauses.push({ domain: { equals: domain, mode: "insensitive" } });
    // `contains`, not `equals` — website carries a scheme and may carry a
    // path, so the bare host is a substring of it rather than equal to it.
    clauses.push({ website: { contains: domain, mode: "insensitive" } });
  }

  return { OR: clauses };
}

// Why a given row came back, and how confident that is.
//
// Returned to the client rather than kept server-side, because the answer
// changes what the card should say: "this is the registration number you
// pasted" is a different statement from "this name looks similar", and a
// lookup that presents both identically is the one that gets misread as
// confirmation.
//
//   "ssm"    — the registration number matched. The strongest signal here:
//              a company number is unique and nobody types one by accident.
//   "domain" — the website or email domain matched.
//   "name"   — the name contained the query. The weakest: substring matching
//              means "Tan" finds every Tan.
function matchReasonFor(business, query) {
  const raw = String(query ?? "").trim();
  const ssm = normalizeSsm(raw);
  const domain = normalizeDomain(raw);

  // Reads the stored NORMALIZED key, so this agrees with what the `where`
  // actually matched on. Both directions plus the token set, mirroring the
  // three clauses lookupWhere builds — if these two ever disagree, a row comes
  // back labelled "name" while the reason it was found was its number.
  const storedSsm = business.ssmNormalized ?? normalizeSsm(business.ssm);
  if (
    ssm.length >= MIN_QUERY_LENGTH &&
    storedSsm &&
    (storedSsm.includes(ssm) || ssm.includes(storedSsm) || ssmTokens(raw).includes(storedSsm))
  ) {
    return "ssm";
  }

  if (looksLikeDomain(domain)) {
    const storedDomain = normalizeDomain(business.domain);
    const storedWebsite = normalizeDomain(business.website);
    if (storedDomain === domain || storedWebsite === domain) return "domain";
  }

  return "name";
}

const REASON_RANK = { ssm: 0, domain: 1, name: 2 };

// Identifier matches first, then alphabetical inside each band.
//
// Sorted here rather than in the query because the ranking is derived from
// the same normalization the `where` used, and Postgres has no view of that.
// At LOOKUP_LIMIT rows the cost is nil.
function rankMatches(businesses, query) {
  return [...businesses]
    .map((business) => ({ business, reason: matchReasonFor(business, query) }))
    .sort(
      (a, b) =>
        REASON_RANK[a.reason] - REASON_RANK[b.reason] ||
        a.business.name.localeCompare(b.business.name),
    );
}

// What the reader is being told, in one word, so the client renders one panel
// per state instead of inferring three from a business object.
//
// "unclaimed" is split out from "listed" because the two are genuinely
// different answers and the existing product already treats them so: an L0
// row has no owner, no tabs on its profile, and a claim CTA. Telling a member
// "they're on ABRI" about a listing nobody has ever claimed would be the
// same overstatement the miss state exists to avoid.
function standingFor(business) {
  return business.verificationLevel === UNCLAIMED ? "unclaimed" : "listed";
}

export {
  LOOKUP_LIMIT,
  MIN_QUERY_LENGTH,
  normalizeSsm,
  normalizeDomain,
  looksLikeDomain,
  ssmTokens,
  lookupWhere,
  matchReasonFor,
  rankMatches,
  standingFor,
};
