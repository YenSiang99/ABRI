// Shared by every seeding-source extractor in this folder. Each extractor
// turns one free source into the shape of ABRI-listing-intake.xlsx, and they
// all need the same four things: a slug, a locality from a postcode, the
// vocab check, and CSV out. See ABRI-data-sources.md for the sources.
//
// THE RULES EVERY EXTRACTOR FOLLOWS (why each one exists is in
// ABRI-data-sources.md → "Rules for imported data"):
//   - firms only; never a person's name, mobile or personal email
//   - phone, whatsapp, email always empty
//   - domain only from a regulator's own record of the firm — never from a
//     POI dataset or a licence list (lib/domainVerification.js auto-approves
//     claims against it)
//   - a wrong locality is worse than a missing one: unsure → overflow
//   - every row carries source, sourceId, sourceYear

import fs from "node:fs";
import path from "node:path";
import {
  BUSINESS_LOCATIONS,
  isValidCategory,
  isValidLocation,
} from "../../src/lib/businessVocab.js";

export const REPO_ROOT = new URL("../../../", import.meta.url).pathname;

export function outDir(source) {
  const dir = path.join(REPO_ROOT, "data", "sources", source);
  fs.mkdirSync(path.join(dir, "raw"), { recursive: true });
  return dir;
}

// slug.js imports the Prisma client at module load, which would make these
// scripts need a database they never use. This is the same function, copied.
export function slugify(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export const LISTING_COLUMNS = [
  "id", "name", "category", "location", "domain", "description", "services",
  "ssm", "phone", "whatsapp", "email", "website", "address", "openingHours",
  // The source's own point, for the profile map. Never geocoded.
  "lat", "lng",
  // Provenance — not in the intake sheet. Kept so every row can be
  // attributed, audited, or removed by source later.
  "source", "sourceId", "sourceYear", "locationBasis", "sourceType",
];
export const OVERFLOW_COLUMNS = [
  "name", "what they do", "locality (as found)", "website or domain",
  "why it doesn't fit", "source", "sourceId",
];

export function toCsv(rows, columns) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(","), ...rows.map((r) => columns.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
}

// Malaysian postcodes are the most reliable locality signal any source
// carries: they are what the business itself wrote on its signboard. Returns
// a vocab value, { outside: "<name>" } for a known locality not in the
// vocab, or null.
export function locationFromPostcode(pc) {
  pc = String(pc ?? "").trim();
  if (!/^\d{5}$/.test(pc)) return null;
  const n = Number(pc);
  const p3 = Math.floor(n / 100);
  // Bangsar before Kuala Lumpur: it is inside KL and its own postcodes.
  if (p3 === 591 || p3 === 592) return "Bangsar";
  if (n >= 50000 && n <= 60000) return "Kuala Lumpur";
  if (n >= 46000 && n <= 46999) return "Petaling Jaya";
  if ([473, 474, 478].includes(p3)) return "Petaling Jaya";
  if ([475, 476].includes(p3)) return "Subang Jaya";
  if (n >= 47100 && n <= 47199) return "Puchong";
  if (n >= 40000 && n <= 40999) return "Shah Alam";
  if (n === 68000) return "Ampang";
  const outside = [
    [41000, 42999, "Klang"],
    [43000, 43099, "Kajang"],
    [43200, 43299, "Cheras (Selangor)"],
    [43300, 43399, "Seri Kembangan"],
    [43400, 43499, "Serdang"],
    [43500, 43599, "Semenyih"],
    [43600, 43699, "Bangi"],
    [43800, 43899, "Dengkil"],
    [47000, 47099, "Sungai Buloh"],
    [47200, 47299, "Subang"],
    [48000, 48099, "Rawang"],
    [62000, 62999, "Putrajaya"],
    [63000, 63999, "Cyberjaya"],
    [64000, 64099, "Sepang"],
    [68100, 68199, "Selayang"],
  ];
  // Localities added to the vocab come back as values; the rest stay
  // { outside } so they land in overflow with a name.
  for (const [lo, hi, name] of outside) {
    if (n >= lo && n <= hi) return isValidLocation(name) ? name : { outside: name };
  }
  return null;
}

// Why a row can't be a listing, or [] if it can.
export function rejectReasons({ category, location, outside, what }) {
  const reasons = [];
  if (!category) reasons.push(`no category for ${what || "untyped"}`);
  else if (!isValidCategory(category)) reasons.push(`invalid category ${category}`);
  if (!location) reasons.push(outside ? `locality not in vocab: ${outside}` : "locality unclear");
  else if (!isValidLocation(location)) reasons.push(`invalid location ${location}`);
  return reasons;
}

// Collapses a name to what dedupe should compare: case, punctuation and the
// legal-form suffixes that one source writes and another drops.
export function nameKey(name) {
  return slugify(
    name
      .toLowerCase()
      .replace(/\b(sdn\.?\s*bhd\.?|bhd\.?|berhad|enterprise|ent\.?|plt|trading|\(m\)|\(malaysia\)|malaysia)\b/g, " "),
  );
}

// Assigns unique slug ids and drops same-name-same-locality repeats (extra
// branches of one business). Mutates rows; returns the ones kept.
export function assignIds(rows, stats) {
  const ids = new Set();
  const seen = new Set();
  const kept = [];
  for (const row of rows) {
    const key = `${nameKey(row.name)}|${row.location}`;
    if (seen.has(key)) { stats.duplicate = (stats.duplicate || 0) + 1; continue; }
    seen.add(key);
    const base = slugify(row.name);
    let id = base;
    if (ids.has(id)) id = `${base}-${slugify(row.location)}`;
    let k = 2;
    while (ids.has(id)) id = `${base}-${slugify(row.location)}-${k++}`;
    ids.add(id);
    row.id = id;
    kept.push(row);
  }
  return kept;
}

export function blankListing() {
  return {
    domain: "", description: "", services: "", ssm: "",
    phone: "", whatsapp: "", email: "",
    website: "", address: "", openingHours: "",
    lat: "", lng: "",
  };
}

// The same Klang Valley box overture_fetch.py pulls. A point outside it is a
// source error (a page pinned to 0,0, a swapped lat/lon), and no pin beats a
// pin in the sea. Rounded to 6 places — about 10 cm, far past what any
// source here is accurate to.
const KV_BOX = { west: 101.35, east: 101.85, south: 2.75, north: 3.35 };
export function point(lat, lng) {
  const y = Number(lat), x = Number(lng);
  if (lat == null || lng == null || !Number.isFinite(y) || !Number.isFinite(x)) return { lat: "", lng: "" };
  if (y < KV_BOX.south || y > KV_BOX.north || x < KV_BOX.west || x > KV_BOX.east) return { lat: "", lng: "" };
  return { lat: String(+y.toFixed(6)), lng: String(+x.toFixed(6)) };
}

// Writes listings.csv, overflow.csv and stats.json for one source, and fills
// the per-category / per-locality counts every source reports.
// "unsure" names a person has ruled on: name-decisions.json → drop is
// sourceId → original name, for stripped names that turned out to be only a
// place ("Taman Megah", "Plaza Arkadia").
const NAME_DECISIONS = JSON.parse(fs.readFileSync(new URL("./name-decisions.json", import.meta.url), "utf8"));

// Every name cleanName changed, with why — the audit trail for the drops
// and fallbacks. Pass the result as writeOutputs' `names`. note() applies
// name-decisions.json and returns the verdict to use.
export function nameLog() {
  const rows = [];
  return {
    rows,
    note(stats, sourceId, original, result) {
      if (NAME_DECISIONS.drop[sourceId] !== undefined) result = { name: "", verdict: "place-decided" };
      const { name, verdict } = result;
      stats.names = stats.names || {};
      stats.names[verdict] = (stats.names[verdict] || 0) + 1;
      if (verdict !== "kept" || name !== String(original ?? "").trim()) rows.push({ sourceId, original, name, verdict });
      return result;
    },
  };
}

export function writeOutputs(dir, listings, overflow, stats, names) {
  listings.sort((a, b) =>
    a.category.localeCompare(b.category) ||
    a.location.localeCompare(b.location) ||
    a.id.localeCompare(b.id));
  stats.listings = listings.length;
  stats.overflow = overflow.length;
  stats.byCategory = {};
  stats.byLocation = {};
  stats.withWebsite = 0;
  stats.withAddress = 0;
  for (const r of listings) {
    stats.byCategory[r.category] = (stats.byCategory[r.category] || 0) + 1;
    stats.byLocation[r.location] = (stats.byLocation[r.location] || 0) + 1;
    if (r.website) stats.withWebsite++;
    if (r.address) stats.withAddress++;
  }
  fs.writeFileSync(path.join(dir, "listings.csv"), toCsv(listings, LISTING_COLUMNS));
  fs.writeFileSync(path.join(dir, "overflow.csv"), toCsv(overflow, OVERFLOW_COLUMNS));
  if (names) fs.writeFileSync(path.join(dir, "names.csv"), toCsv(names.rows, ["sourceId", "original", "name", "verdict"]));
  fs.writeFileSync(path.join(dir, "stats.json"), JSON.stringify(stats, null, 2));
  console.log(JSON.stringify(stats, null, 2));
  console.log(`\nWrote ${path.relative(REPO_ROOT, dir)}/listings.csv and overflow.csv`);
}

// ALL-CAPS register names → "Jelas Sepakat Sdn Bhd". Leaves mixed-case
// names alone: somebody chose that casing.
export function titleCase(name) {
  const s = name.replace(/\s+/g, " ").trim();
  if (/[a-z]/.test(s)) return s;
  const KEEP = new Set(["PLT", "LLP", "(M)", "KL", "PJ", "USJ", "SS", "IT", "ICT", "UK", "USA", "KLCC", "II", "III", "IV"]);
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => {
      if (KEEP.has(w.toUpperCase())) return w.toUpperCase();
      if (w === "sdn") return "Sdn";
      if (w === "bhd" || w === "bhd.") return "Bhd";
      return w.replace(/(^|[-/(&.'])([a-z])/g, (_, p, c) => p + c.toUpperCase());
    })
    .join(" ");
}

// Reads a CSV written by toCsv (RFC 4180 quoting) back into objects.
export function readCsv(file) {
  const text = fs.readFileSync(file, "utf8");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

// Drops the non-Latin half of a bilingual name: "Qh Auto 汽车零件" →
// "Qh Auto", "مدرسة العراق … The Iraq Private School" → "The Iraq Private
// School". Signboards in the corridor routinely carry both, and the Latin
// half is the one the rest of the directory is written in. Left as-is it
// also sorts first, so page one of the directory opened on Arabic school
// names.
//
// When fewer than 2 Latin letters survive ("59G菜饭之家"), the name was never
// really a Latin one, and this returns "" — the same outcome as a name with
// no Latin at all, which every source already skips.
// Also strips the decoration that travels with them: CJK and Arabic
// punctuation, the katakana long mark, fullwidth forms, and pictographic
// symbols (☆ ↭ ⑩ ²⁰¹⁶) that only render as noise on a directory card.
const NON_LATIN = /[[\p{L}\p{M}\p{Nl}]--[\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]]+|[　-〿ー＀-￯،؛؟٫٬⁰-₟←-⇿∣①-⓿☀-➿\p{Extended_Pictographic}]+/gv;

export function cleanName(name) {
  return nameVerdict(name).name;
}

// cleanName with its reasoning, for the sources' stats and the review report.
// verdict is one of:
//   "kept"       no non-Latin text; tidied only
//   "stripped"   non-Latin half dropped, the Latin half is a real name
//   "fallback"   the Latin half is only a descriptor ("Mixed Rice", "OUG
//                Branch") — the name was the non-Latin part, so keep the
//                original, tidied
//   "separators" under 2 Latin letters left → name is ""
//   "place"      the Latin half is only where the business is ("@ Jinjang",
//                "· · · ·Old Klang Road") → name is ""
//   "unsure"     stripped, but the Latin half looks like a place ("Taman
//                Minang") — kept, and listed in names.csv for a person
// The last two are dropped rather than falling back: agreed 26 Sep 2026, a
// directory card should not open on a Chinese or Arabic name unless there is
// no other name at all.
export function nameVerdict(name) {
  // Fullwidth brackets sit inside NON_LATIN's fullwidth range; make them
  // ASCII first or "Sdn. Bhd.（Hino)" loses its "(".
  const original = String(name ?? "").trim().replace(/（/g, " (").replace(/）/g, ") ");
  NON_LATIN.lastIndex = 0;
  if (!NON_LATIN.test(original)) return { name: tidyName(original), verdict: "kept" };
  NON_LATIN.lastIndex = 0;
  let s = original.replace(NON_LATIN, " ");
  for (let i = 0; i < 3; i++) {
    s = s
      .replace(/\(\s*[-–—/|,.:;\s]*\)|\[\s*\]/g, " ")   // brackets left empty
      .replace(/\(\s+/g, "(").replace(/\s+\)/g, ")")
      .replace(/\s+([,.;:])/g, "$1")
      .replace(/\s*([-–—/|])\s*(?=[-–—/|]|$)/g, " ")  // separators left dangling
      .replace(/^[\s\-–—/|,.:;&+]+|[\s\-–—/|,:;&+]+$/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  if ((s.match(/\p{Script=Latin}/gu) || []).length < 2) return { name: "", verdict: "separators" };
  const introducedByAt = /^[\s•·・∙|~\-–—]*@/.test(s);
  const t = tidyName(s);
  const place = placeScore(t);
  // "某某 @ Jinjang": what follows an "@" is where, not who.
  if (place === "certain" || (introducedByAt && !BUSINESS_WORD.test(t))) return { name: "", verdict: "place" };
  if (isDescriptorOnly(t)) return { name: tidyName(original), verdict: "fallback" };
  // Probably a place, but a real name can look like one ("SS2 Oloiya"):
  // kept, and listed for a person to decide.
  if (place === "likely") return { name: t, verdict: "unsure" };
  return { name: t, verdict: "stripped" };
}

// Words that make a string a business rather than a place.
const BUSINESS_WORD = /\b(restaurant|restoran|resto|cafe|caf[eé]|kafe|coffee|kopi|kopitiam|tea|bistro|bar|pub|kitchen|dapur|food|makanan|noodles?|mee|mian|rice|nasi|steamboat|hot ?pot|bbq|grill|bakery|dessert|seafood|dim sum|kedai|shop|store|mart|trading|enterprise|sdn|bhd|plt|clinic|klinik|dental|pharmacy|farmasi|salon|spa|beauty|studio|hotel|auto|motor|garage|tyres?|tayar|services?|servis|school|sekolah|sjk[ct]?|tuition|academy|college|kolej|tadika|gym|florist|hardware|optical|laundry|printing|stall|gerai|warung|canteen|kantin|tuisyen|tuition|fisioterap\w*|physio\w*|ortopedik|akupunktur|acupuncture|pajak|pawn|nails?|sushi|porridge|eatery|pasar|market|hawker|medan selera|foods?|kway|teh|bak|laksa|durian|fruits?|bkt)\b/i;

// Words a place name is built from. Localities, plus the pieces Malaysian
// addresses and landmarks are made of.
const PLACE_STRUCTURE = new Set(("taman tmn jalan jln lorong lrg kampung kampong kg desa bandar bdr seksyen sek sec section " +
  "sg sungai bukit bkt persiaran lebuh lebuhraya road rd street st mall megamall plaza parade avenue city square " +
  "tol pusat perindustrian industrial park").split(" "));
const PLACE_FILLER = new Set(("sri seri baru jaya indah utama perdana permai raya lama tengah selatan utara timur barat " +
  "south north new old kl pj malaysia the at @ of").split(" "));
const LOCALITIES = ["KL", "PJ", "Kepong", "Cheras", "Jinjang", "Setapak", "Wangsa Maju", "Sri Petaling", "Bukit Jalil",
  "OUG", "Old Klang Road", "Kuchai Lama", "Sentul", "Segambut", "Damansara", "Kota Damansara", "Mont Kiara",
  "Bukit Bintang", "Chow Kit", "Pudu", "Brickfields", "Titiwangsa", "Setiawangsa", "Sunway", "Kelana Jaya",
  "Ara Damansara", "Bandar Utama", "Puchong Jaya", "Taman Desa", "Sri Hartamas", "Desa Parkcity", "Balakong",
  "Jenjarom", "Meru", "Kapar", "Pandamaran", "Port Klang", "Batu Caves", "Gombak", "Melawati", "Keramat",
  "Bangsar South", "Mid Valley", "Sungai Besi", "Sg Long", "Pandan Indah", "Pandan Jaya", "Maluri", "Salak South",
  "Desa Petaling", "Petaling", "Imbi", "Alor", "Ipoh", "Yulek", "Usj", "Taipan", "Subang", "Selangor",
  "Kuala", "Lumpur", "Velocity", "Botanic", "1 Utama", "One Utama", "IOI", "Rivercity", "Paradigm"];
const LOCALITY_WORDS = new Set([...BUSINESS_LOCATIONS, ...LOCALITIES]
  .flatMap((l) => l.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/)).filter(Boolean));

// "certain": every word is a place word — "Jinjang", "Old Klang Road",
//   "Taman Muda", "SS2", "B1-07".
// "likely": a place word plus one or two words that could be either —
//   "Taman Minang", "Jalan Imbi", "SS2 Oloiya".
// null: anything else.
function placeScore(name) {
  if (BUSINESS_WORD.test(name)) return null;
  if (/^[A-Z]?\d+[A-Z]?-\d+/i.test(name)) return "certain";   // unit number
  const words = name.toLowerCase().replace(/[^a-z0-9@ ]+/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  let structure = 0, unknown = 0;
  for (const w of words) {
    if (PLACE_STRUCTURE.has(w) || /^(ss|usj|pju|pjs|u)\d+[a-z]?$/.test(w)) structure++;
    else if (LOCALITY_WORDS.has(w) || PLACE_FILLER.has(w) || /^\d+[a-z]?$/.test(w)) continue;
    else unknown++;
  }
  if (!unknown) return "certain";
  if (structure && unknown <= 2 && words.length <= 4) return "likely";
  return null;
}

// The Latin half names nothing that is this business rather than any other:
// only menu words ("Mixed Rice", "Roast Duck", "Kopitiam"), or an area plus
// a branch word ("OUG Branch"). "Restoran Kapar Kopitiam" is not this — an
// area and a menu word together are how many real names are made.
const DESCRIPTOR = new Set(("mixed rice chicken duck roast roasted pork char siu siew noodle noodles mee pan " +
  "restaurant restoran branch kopitiam cafe hot pot hotpot steamboat seafood dessert desserts bak kut teh food " +
  "court centre kitchen bbq dim sum economy fish head beef curry laksa soup porridge congee dumpling dumplings " +
  "tea house stall the and &").split(" "));
const BRANCH = new Set(["branch", "outlet", "hq", "cawangan"]);

function isDescriptorOnly(name) {
  const words = name.toLowerCase().replace(/[^a-z0-9& ]+/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return false;
  if (words.every((w) => DESCRIPTOR.has(w))) return true;
  return words.some((w) => BRANCH.has(w)) &&
    words.every((w) => DESCRIPTOR.has(w) || BRANCH.has(w) || LOCALITY_WORDS.has(w));
}

// Page-name decoration that survives on its own or is left behind once the
// non-Latin half goes: "· · · ·Old Klang Road", "• Mixed Rice •",
// "BuYaoWen..", "Restaurant 3T (", "Restoran X, Kampung Y, 51000, Gombak,".
// Bullets between words become spaces ("Cha Cha • Kota Damansara"); pipes
// and dashes stay — owners use those on purpose. A single trailing "."
// stays: "Sdn. Bhd.", "Co." are real.
const EDGE_LEAD = /^[\s•·・∙*#@~_=|\-–—/\\,:;&+.…]+/;
const EDGE_TRAIL = /(?:[\s•·・∙*#@~_=|\-–—/\\,:;&+(]|\.{2,}|…)+$/;

function balanceBrackets(s) {
  // Drops a ")" with no "(" before it, closes a "(" left open, and removes a
  // pair holding nothing but decoration ("My Flavour (· · ·)").
  let out = "", depth = 0;
  for (const ch of s) {
    if (ch === "(") { depth++; out += ch; }
    else if (ch === ")") { if (depth) { depth--; out += ch; } }
    else out += ch;
  }
  out = out.replace(/\s*\(\s*$/, "").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");
  depth = (out.match(/\(/g) || []).length - (out.match(/\)/g) || []).length;
  if (depth > 0) out = out.trimEnd() + ")".repeat(depth);
  return out.replace(/\s*\([^\p{L}\p{N}]*\)/gu, "");
}

export function tidyName(name) {
  let s = String(name ?? "");
  // An address pasted in after the name: cut at the first comma whose tail
  // carries a postcode.
  const comma = s.search(/,(?=[^,]*,?.*\b\d{5}\b)/);
  if (comma > 0 && /\b\d{5}\b/.test(s.slice(comma))) s = s.slice(0, comma);
  s = s
    .replace(/（/g, " (").replace(/）/g, ") ")   // fullwidth brackets
    .replace(/\s*(?:\.{2,}|…)\s*/g, " ")          // "Hello..Vet" → "Hello Vet"
    .replace(/\s*[•·・∙]+\s*/g, " ")                // bullets → space
    .replace(/\|(?:\s*\|)+/g, "|")                 // "||" → "|"
    .replace(/\s{2,}/g, " ");
  for (let i = 0; i < 3; i++) {
    s = balanceBrackets(s);
    s = s.replace(EDGE_LEAD, "").replace(EDGE_TRAIL, "").replace(/\s{2,}/g, " ").trim();
  }
  return s;
}
