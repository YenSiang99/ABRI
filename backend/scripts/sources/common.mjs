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
//
// Letters of every script count: "Restoran 春景" and "Restoran 龙门" are two
// businesses, and a name in Chinese only must not collapse to "".
export function nameKey(name) {
  return name
    .toLowerCase()
    .replace(/\b(sdn\.?\s*bhd\.?|bhd\.?|berhad|enterprise|ent\.?|plt|trading|\(m\)|\(malaysia\)|malaysia)\b/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/(^-|-$)/g, "");
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
    // A name with letters in another script slugs to its Latin part only —
    // "海记海鲜饭档 @ Jinjang" to "jinjang", which names a place, not this
    // business. Those get the source's own id appended ("jinjang-5e4c5ae1"),
    // and one with no Latin at all is just "biz-5e4c5ae1". Stable across
    // rebuilds, because the source id is.
    // Overture ids are UUIDs, so 8 hex characters are enough; OSM ids are
    // sequential numbers ("way/758662055") and need all their digits.
    const tail = String(row.sourceId).split(":").pop();
    const short = /^[0-9a-f]{8}-/.test(tail) ? tail.slice(0, 8) : slugify(tail);
    const latin = slugify(row.name);
    const base = !OTHER_SCRIPT_LETTER.test(row.name) ? latin : latin ? `${latin}-${short}` : `biz-${short}`;
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
// Names a person has ruled on one by one: name-decisions.json → drop is
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

// NAMES ARE KEPT AS THE SOURCE WROTE THEM — decided 27 Sep 2026, reversing
// the 26 Sep cleanup that stripped the non-Latin half. A Chinese, Arabic or
// Tamil signboard name is the business's real name, and stripping it left
// "(Pulau Ketam)" where "一品味海鲜火锅（Pulau Ketam）" had been. What still
// happens, each one a ruling on real examples:
//
//   - maths-bold/italic and fullwidth LETTERS become plain ones, same case
//     ("𝐅𝐓 𝐈𝐓 𝐒𝐎𝐋𝐔𝐓𝐈𝐎𝐍" → "FT IT SOLUTION"). Symbols like ™ ® ＆ stay.
//   - text in a script the corridor's signboards don't use (Burmese, Bengali)
//     is removed; the listing stays on its other name.
//   - page decoration is tidied: symbols stuck to either end ("#kkbsteak",
//     "czking_"), extra spaces, trailing dots/commas, "..", broken or
//     fullwidth brackets, and an address pasted after the name. Bullets
//     BETWEEN words stay — "Dink Arena • USJ" reads as name • branch.
//   - a name that is only a place ("Taman Asa Jaya", "Lorong Keramat 12") or
//     says the business is closed is dropped: the directory lists businesses.
//
// verdict, for stats and names.csv:
//   "kept"    unchanged          "tidied"   decoration/letters fixed
//   "script"  uncommon script removed
//   "place"   dropped — only a place      "closed"  dropped — says closed
//   "empty"   nothing left → dropped

// Scripts Klang Valley signboards actually use. Anything else is removed.
const UNCOMMON_SCRIPT = /[[\p{L}\p{M}\p{N}]--[\p{sc=Latin}\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}\p{sc=Bopomofo}\p{sc=Tamil}\p{sc=Arabic}\p{sc=Thai}\p{sc=Greek}\p{sc=Common}\p{sc=Inherited}]]+/gv;
// Any letter that isn't Latin — a name with one of these has a real name in
// another script, so it is never "only a place".
const OTHER_SCRIPT_LETTER = /[\p{L}--[\p{sc=Latin}\p{sc=Common}\p{sc=Inherited}]]/v;
// Maths alphanumerics (U+1D400–1D7FF) and fullwidth letters/digits: NFKC
// turns these into plain ones. Only these — NFKC would also turn ™ into "TM".
const FANCY_LETTERS = /[\u{1D400}-\u{1D7FF}０-９Ａ-Ｚａ-ｚ]/gu;
const CLOSED = /\b(closed( down)?|tutup|ditutup|shut down|no longer operating)\b/i;

export function cleanName(name) {
  return nameVerdict(name).name;
}

export function nameVerdict(name) {
  const original = String(name ?? "").trim();
  let s = original.replace(FANCY_LETTERS, (ch) => ch.normalize("NFKC"));
  let verdict = "kept";
  UNCOMMON_SCRIPT.lastIndex = 0;
  if (UNCOMMON_SCRIPT.test(s)) {
    UNCOMMON_SCRIPT.lastIndex = 0;
    s = s.replace(UNCOMMON_SCRIPT, " ");
    verdict = "script";
  }
  s = tidyName(s);
  if (!/[\p{L}\p{N}]/u.test(s)) return { name: "", verdict: "empty" };
  if (CLOSED.test(s)) return { name: "", verdict: "closed" };
  // Malls stay even though their names are places ("Subang Parade",
  // "Setia Walk Mall") — ruled 27 Sep 2026. A toll plaza is not a mall.
  const mall = MALL_WORD.test(s) && !/\btol\b/i.test(s);
  const place = placeScore(s);
  if (place === "certain" && !mall) return { name: "", verdict: "place" };
  // Borderline, ruled on 27 Sep 2026 over 1,242 real examples: a name that
  // STARTS like an address ("Taman Wangi", "Kampung Tauhid", "Unit Dialisis")
  // goes; one that only ENDS in a place word ("SS2 Fatty Duck", "Park
  // Lounge") stays.
  if (place === "likely" && ADDRESS_FIRST_WORD.test(s) && !mall) return { name: "", verdict: "place" };
  if (verdict === "kept" && s !== original) verdict = "tidied";
  return { name: s, verdict };
}

const ADDRESS_FIRST_WORD = /^(taman|tmn|kampung|kampong|kg\.?|desa|bandar|bdr|bukit|bkt|jalan|jln|lorong|lrg|seksyen|section|sek|sg\.?|sungai|pulau|blok|block|lot|unit|no|persiaran|batu|plaza tol)\b/i;
const MALL_WORD = /\b(mall|megamall|plaza|parade|square|pavilion|galleria)\b/i;

// Words that make a string a business rather than a place.
const BUSINESS_WORD = /\b(restaurant|restoran|resto|cafe|caf[eé]|kafe|coffee|kopi|kopitiam|tea|bistro|bar|pub|kitchen|dapur|food|makanan|noodles?|mee|mian|rice|nasi|steamboat|hot ?pot|bbq|grill|bakery|dessert|seafood|dim sum|kedai|shop|store|mart|trading|enterprise|sdn|bhd|plt|clinic|klinik|dental|pharmacy|farmasi|salon|spa|beauty|studio|hotel|auto|motor|garage|tyres?|tayar|services?|servis|school|sekolah|sjk[ct]?|tuition|academy|college|kolej|tadika|gym|florist|hardware|optical|laundry|printing|stall|gerai|warung|canteen|kantin|tuisyen|fisioterap\w*|physio\w*|ortopedik|akupunktur|acupuncture|pajak|pawn|nails?|sushi|porridge|eatery|pasar|market|hawker|medan selera|foods?|kway|teh|bak|laksa|durian|fruits?|car ?wash|wash|workshop|bengkel|centre|center|pusat|agency|consult\w*|solutions?|house|corner|court|group|company|co|resort|condo\w*|residen\w*|apartment|suites?|homes?|properties|property|realty|office|factory|kilang|farm|ladang|nursery|sk|smk|sra|sjk|sekolah|kindergarten|tailor|grocer|snooker|uniform|parcel\w*|courier|7-?11|7-?eleven|care|caterers?|catering)\b/i;

// Words a place name is built from. Localities, plus the pieces Malaysian
// addresses and landmarks are made of.
const PLACE_STRUCTURE = new Set(("taman tmn jalan jln lorong lrg kampung kampong kg desa bandar bdr seksyen sek sec section " +
  "sg sungai bukit bkt persiaran lebuh lebuhraya road rd street st mall megamall plaza parade avenue city square " +
  "tol perindustrian industrial park pulau batu block blok lot unit no").split(" "));
const PLACE_FILLER = new Set(("sri seri baru jaya indah utama perdana permai raya lama tengah selatan utara timur barat " +
  "south north new old kl pj malaysia the at @ of off").split(" "));
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

// "certain": every word is a place word — "Jinjang", "Taman Asa Jaya",
//   "Lorong Keramat 12", "B1-07". Dropped.
// "likely": a place word plus one or two words that could be either —
//   "Taman Minang", "Jalan Imbi". Kept and listed for a person.
// null: anything else, including any name with a non-Latin name in it.
function placeScore(name) {
  if (BUSINESS_WORD.test(name) || OTHER_SCRIPT_LETTER.test(name)) return null;
  if (/^[A-Z]?\d+[A-Z]?-\d+/i.test(name)) return "certain";   // unit number
  const words = name.toLowerCase().replace(/[^a-z0-9@ ]+/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const isStructure = (w) => PLACE_STRUCTURE.has(w) || /^(ss|usj|pju|pjs|u)\d+[a-z]?$/.test(w);
  let structure = 0, locality = 0, unknown = 0;
  for (const w of words) {
    if (isStructure(w)) structure++;
    else if (LOCALITY_WORDS.has(w)) locality++;
    else if (!PLACE_FILLER.has(w) && !/^\d+[a-z]?$/.test(w)) unknown++;
  }
  // Only filler ("Timur Raya", "Utara") is too little to call it a place.
  if (!unknown) return structure || locality ? "certain" : "likely";
  // A place word FIRST is how estates and roads are named ("Taman Minang",
  // "Kampung Idaman"); a short name ENDING in one is a development ("Harmony
  // Park"). A brand followed by where it is ("Mixue Taman Sri Bintang") is
  // neither, and is a business.
  if (unknown <= 2 && words.length <= 4 && (isStructure(words[0]) || (words.length <= 3 && isStructure(words.at(-1))))) return "likely";
  return null;
}

// Symbols stuck to either end: "#kkbsteak", "@PPDHL", "czking_", "Vincci+",
// "•The Cutlorizt•", a trailing " |" or ",". A single trailing "." stays —
// "Sdn. Bhd.", "Co." are real.
const EDGE_LEAD = /^[\s•·・∙*#@~_=|\-–—/\\,:;&+.…]+/;
const EDGE_TRAIL = /(?:[\s•·・∙*#@~_=|\-–—/\\,:;&+(]|\.{2,}|…)+$/;

// The start of an address pasted after a name: a street or unit word, or a
// comma. Only used when the name also carries a postcode, so "Restoran Jalan
// Alor" is never cut. "Char Kwey Teow Republik Lorong G1 Kampung Pandan
// Dalam, 55100 Ampang" → "Char Kwey Teow Republik".
const ADDRESS_START = /,|\s(?=(?:lorong|lrg|jalan|jln|persiaran|lebuh|no\.?\s*\d+|lot\s*\d+|block|blok|unit|tingkat|level|ground floor|\d+(?:st|nd|rd|th)\s+floor|\d+[a-z]?\s*(?:,|jalan|jln|lorong))\b)/i;

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
  if (/\b\d{5}\b/.test(s)) {
    const m = ADDRESS_START.exec(s);
    if (m && m.index > 0) s = s.slice(0, m.index);
  }
  s = s
    .replace(/（/g, " (").replace(/）/g, ") ")   // fullwidth brackets
    .replace(/\s*(?:\.{2,}|…)\s*(?=[^\s.…])/g, " ")  // "Hello..Vet" → "Hello Vet"
    .replace(/\s{2,}/g, " ");
  for (let i = 0; i < 3; i++) {
    s = balanceBrackets(s);
    s = s.replace(EDGE_LEAD, "").replace(EDGE_TRAIL, "").replace(/\s{2,}/g, " ").trim();
  }
  return s;
}
