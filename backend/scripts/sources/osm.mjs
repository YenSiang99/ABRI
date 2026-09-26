// Pulls every named business in the Klang Valley out of OpenStreetMap and
// writes it in the shape of ABRI-listing-intake.xlsx, so seeding starts from
// a real corridor instead of hand-written fixtures.
//
//   node scripts/sources/osm.mjs              # whole Klang Valley, cached
//   node scripts/sources/osm.mjs --refresh    # re-download from Overpass
//
// Writes, under <repo>/data/sources/osm/ (gitignored):
//   listings.csv  — the Listings sheet's 14 columns, then provenance columns
//   overflow.csv  — the Overflow sheet's 5 columns: real businesses whose
//                   category or locality is not in businessVocab.js yet
//   raw/          — Overpass responses, so a re-run costs Overpass nothing
//
// IT WRITES CSV ONLY. Nothing here touches the database — there is no
// importer yet, and a human should look at these rows before one exists.
//
// WHY OSM. It is the only free, bulk, explicitly reusable source of Malaysian
// business listings (ODbL). SSM sells per lookup and has no bulk tier; Google
// Places and the Yellow Pages-style directories forbid storing their data.
// See ABRI-data-sources.md for the full comparison.
//
// FOUR RULES THIS SCRIPT ENFORCES, and why:
//
// 1. `domain` IS ALWAYS EMPTY. lib/domainVerification.js auto-approves a
//    claim whose email domain matches it — no admin review. An OSM website
//    tag is volunteer-entered and can be stale or plain wrong, and a wrong
//    domain hands a stranger somebody else's listing. OSM's URL goes to
//    `website`, which is harmless; `domain` waits for a higher-trust source.
//
// 2. `phone`, `whatsapp` and `email` ARE ALWAYS EMPTY, even where OSM has
//    them. lib/contactVisibility.js puts those behind the paid tier, so
//    bulk-loading them would sell unconsented contact data — the blueprint's
//    "no scraping personal data" line.
//
// 3. CHAIN BRANCHES ARE DROPPED. Anything carrying a `brand` tag is a
//    McDonald's, a 7-Eleven or a bank branch; four hundred of them would bury
//    the SMEs the directory is for, and none of them will ever claim.
//
// 4. A WRONG LOCALITY IS WORSE THAN A MISSING ONE (the intake sheet's rule).
//    Location comes from the postcode first (what the business wrote on its
//    own signboard), then from which OSM council boundary the point is in,
//    then from addr:city. Anything none of them settles is overflow. The
//    `locationBasis` column records which of the three decided each row.

import fs from "node:fs";
import path from "node:path";
import {
  outDir, blankListing, locationFromPostcode, rejectReasons, assignIds,
  writeOutputs, cleanName,
} from "./common.mjs";
import { isValidLocation } from "../../src/lib/businessVocab.js";

const OUT_DIR = outDir("osm");
const RAW_DIR = path.join(OUT_DIR, "raw");
const REFRESH = process.argv.includes("--refresh");

// Klang Valley: Rawang to Semenyih, Klang to Ampang. Split into tiles because
// the public Overpass instance 504s on one query this size.
const KV = { south: 2.75, west: 101.35, north: 3.35, east: 101.85 };
const TILE = 0.15;

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const USER_AGENT = "ABRI-seeding/0.1 (+https://abri.asia)";

// Every selector is written once and applied either to a bounding box
// ("(s,w,n,e)") or to a boundary area ("(area.a)").
function selectors(f) {
  return `
  nwr["name"]["office"]${f};
  nwr["name"]["shop"]${f};
  nwr["name"]["craft"]${f};
  nwr["name"]["healthcare"]${f};
  nwr["name"]["amenity"~"^(restaurant|cafe|fast_food|food_court|bar|pub|ice_cream|clinic|dentist|doctors|hospital|pharmacy|veterinary|school|college|kindergarten|language_school|driving_school|music_school|training|university|childcare)$"]${f};
  nwr["name"]["leisure"~"^(fitness_centre|sports_centre)$"]${f};
  nwr["name"]["man_made"="works"]${f};`;
}

function tileQuery(s, w, n, e) {
  return `[out:json][timeout:180];(${selectors(`(${s},${w},${n},${e})`)}
);
out center tags;`;
}

// Ids only: which of the tile elements fall inside one boundary. Overpass
// does the point-in-polygon, so no geometry is shipped or parsed here.
function boundaryQuery(relationId) {
  return `[out:json][timeout:180];area(id:${3600000000 + relationId})->.a;(${selectors("(area.a)")}
);
out ids;`;
}

async function fetchCached(key, query) {
  const file = path.join(RAW_DIR, `${key}.json`);
  if (!REFRESH && fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const endpoint = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "User-Agent": USER_AGENT,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ data: query }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      fs.writeFileSync(file, JSON.stringify(json));
      return json;
    } catch (err) {
      console.warn(`  tile ${key}: ${endpoint} failed (${err.message}), retrying`);
      await sleep(10_000 * (attempt + 1));
    }
  }
  throw new Error(`tile ${key}: every attempt failed`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Category ──────────────────────────────────────────────────────────────
//
// OSM tag -> one of the 15 categories. Anything not listed returns null and
// goes to overflow; a guessed category is the same silent-miss bug a wrong
// locality is. `office=company`, `office=yes` and `office=consulting` are
// deliberately absent — they say nothing about what the business does.

const OFFICE = {
  accountant: "Accounting & Tax",
  tax_advisor: "Accounting & Tax",
  lawyer: "Law",
  notary: "Law",
  it: "IT Consulting",
  architect: "Design",
  design: "Design",
  graphic_design: "Design",
  interior_design: "Design",
  estate_agent: "Property",
  property_management: "Property",
  advertising_agency: "Marketing & Media",
  marketing: "Marketing & Media",
  newspaper: "Marketing & Media",
  media: "Marketing & Media",
  logistics: "Logistics",
  moving_company: "Logistics",
  courier: "Logistics",
  construction_company: "Construction & Trades",
  construction: "Construction & Trades",
  engineer: "Construction & Trades",
  educational_institution: "Education",
  tutoring: "Education",
  training: "Professional Training",
};

const AMENITY = {
  restaurant: "Food & Beverage",
  cafe: "Food & Beverage",
  fast_food: "Food & Beverage",
  food_court: "Food & Beverage",
  bar: "Food & Beverage",
  pub: "Food & Beverage",
  ice_cream: "Food & Beverage",
  clinic: "Health & Wellness",
  dentist: "Health & Wellness",
  doctors: "Health & Wellness",
  hospital: "Health & Wellness",
  pharmacy: "Health & Wellness",
  veterinary: "Health & Wellness",
  school: "Education",
  college: "Education",
  kindergarten: "Education",
  language_school: "Education",
  driving_school: "Education",
  music_school: "Education",
  university: "Education",
  childcare: "Education",
  training: "Professional Training",
};

const SHOP_FOOD = new Set([
  "bakery", "pastry", "confectionery", "beverages", "coffee", "tea", "deli",
  "chocolate", "cheese", "wine", "alcohol",
]);
const SHOP_HEALTH = new Set([
  "chemist", "optician", "medical_supply", "massage", "beauty", "herbalist",
  "nutrition_supplements", "hearing_aids",
]);
const SHOP_SKIP = new Set(["vacant", "no", "disused"]);
const SHOP_AUTO = new Set([
  "car", "car_repair", "car_parts", "tyres", "motorcycle", "motorcycle_repair",
  "car_wash",
]);

const CRAFT_TRADES = new Set([
  "builder", "electrician", "plumber", "carpenter", "painter", "roofer",
  "tiler", "hvac", "glaziery", "metal_construction", "window_construction",
  "plasterer", "floorer", "stonemason", "insulation", "scaffolder",
  "welder", "locksmith",
]);
const CRAFT_MANUFACTURING = new Set([
  "brewery", "distillery", "winery", "furniture", "sawmill", "joiner",
  "print", "printmaker", "textile", "tailor", "upholsterer", "shoemaker",
  "jeweller", "bakery", "confectionery", "food_processing",
]);

function categoryOf(t) {
  if (t.office && OFFICE[t.office]) return OFFICE[t.office];
  if (t.amenity && AMENITY[t.amenity]) return AMENITY[t.amenity];
  if (t.healthcare) return "Health & Wellness";
  if (t.leisure === "fitness_centre" || t.leisure === "sports_centre") {
    return "Health & Wellness";
  }
  if (t.craft) {
    if (CRAFT_TRADES.has(t.craft)) return "Construction & Trades";
    if (CRAFT_MANUFACTURING.has(t.craft)) return "Manufacturing";
    if (t.craft === "photographer") return "Marketing & Media";
  }
  if (t.man_made === "works") return "Manufacturing";
  if (t.shop && SHOP_AUTO.has(t.shop)) return "Automotive";
  if (t.amenity === "car_wash") return "Automotive";
  if (t.shop && !SHOP_SKIP.has(t.shop)) {
    if (SHOP_FOOD.has(t.shop)) return "Food & Beverage";
    if (SHOP_HEALTH.has(t.shop)) return "Health & Wellness";
    return "Retail";
  }
  return null;
}

function whatTheyDo(t) {
  for (const k of ["office", "amenity", "shop", "craft", "healthcare", "leisure", "man_made"]) {
    if (t[k]) return `${k}=${t[k]}`;
  }
  return "";
}

// ── Location ──────────────────────────────────────────────────────────────
//
const CITY_ALIASES = [
  [/^(kuala lumpur|kl|wilayah persekutuan kuala lumpur)$/, "Kuala Lumpur"],
  [/^(petaling jaya|pj)$/, "Petaling Jaya"],
  [/^(subang jaya|usj)$/, "Subang Jaya"],
  [/^shah alam$/, "Shah Alam"],
  [/^puchong$/, "Puchong"],
  [/^bangsar( south)?$/, "Bangsar"],
  [/^ampang( jaya)?$/, "Ampang"],
];

function locationFromCity(t) {
  for (const key of ["addr:city", "addr:suburb", "addr:town"]) {
    const v = (t[key] || "").toLowerCase().trim();
    if (!v) continue;
    for (const [re, loc] of CITY_ALIASES) if (re.test(v)) return loc;
  }
  return null;
}

// Boundary fallback, for the ~70% of OSM points with no postcode or city.
// These are OSM's own council boundaries, so membership is exact rather than
// guessed. Three councils need splitting further, because the vocab is finer
// than the council map:
//
//   KL      — Bangsar is a neighbourhood, not a council. Carved out by a
//             tight circle; everything else in the Federal Territory is KL.
//   MBSJ    — Subang Jaya City Council also governs Puchong and Seri
//             Kembangan. Split by nearest centre, which is sound here only
//             because the point is already known to be inside MBSJ.
//   MPAJ    — Ampang Jaya council; all of it maps to "Ampang".
const BOUNDARIES = [
  // [OSM relation id, vocab value or { outside }]
  [2939672, "Kuala Lumpur"],
  [8347386, "Petaling Jaya"],
  [8347577, "Shah Alam"],
  [10743361, "MBSJ"],
  [10743276, "Ampang"],
  [10715532, { outside: "Klang" }],
  [10743339, { outside: "Kajang" }],
  [10715467, { outside: "Selayang" }],
  [10043206, { outside: "Cyberjaya" }],
  [4443881, { outside: "Putrajaya" }],
];

const BANGSAR = [3.1300, 101.6710, 1.5];
const MBSJ_CENTRES = [
  ["Subang Jaya", 3.0500, 101.5850],
  ["Puchong", 3.0250, 101.6200],
  [{ outside: "Seri Kembangan" }, 3.0250, 101.7050],
];

function km(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const x = (lon2 - lon1) * r * Math.cos(((lat1 + lat2) / 2) * r);
  const y = (lat2 - lat1) * r;
  return Math.sqrt(x * x + y * y) * 6371;
}

function locationFromBoundary(boundary, lat, lon) {
  if (boundary === "Kuala Lumpur" && lat != null &&
      km(lat, lon, BANGSAR[0], BANGSAR[1]) <= BANGSAR[2]) return "Bangsar";
  if (boundary === "MBSJ") {
    if (lat == null) return null;
    let best = null;
    for (const [loc, clat, clon] of MBSJ_CENTRES) {
      const d = km(lat, lon, clat, clon);
      if (!best || d < best.d) best = { loc, d };
    }
    return best.loc;
  }
  return boundary;
}

// ── Row building ──────────────────────────────────────────────────────────

function displayName(t) {
  // A name with no Latin letters slugs to "", so prefer an English or Malay
  // name tag when the primary one is Chinese- or Tamil-only.
  for (const k of ["name", "name:en", "name:ms"]) {
    if (t[k] && /[a-z]/i.test(t[k])) return cleanName(t[k]);
  }
  return null;
}

function address(t) {
  const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
  const parts = [
    t["addr:unit"] || t["addr:floor"] ? [t["addr:unit"], t["addr:floor"]].filter(Boolean).join(", ") : null,
    street || null,
    t["addr:suburb"],
    [t["addr:postcode"], t["addr:city"]].filter(Boolean).join(" ") || null,
    t["addr:state"],
  ].filter(Boolean);
  // A bare postcode or city is not an address; leave the cell empty.
  return street ? parts.join(", ") : "";
}

function website(t) {
  let w = (t.website || t["contact:website"] || "").trim().split(";")[0];
  if (!w) return "";
  if (!/^https?:\/\//i.test(w)) w = `https://${w}`;
  try {
    const u = new URL(w);
    // Social pages are not the business's website.
    if (/(facebook|instagram|wa\.me|whatsapp|linktr\.ee)\./i.test(u.hostname)) return "";
    return u.href.replace(/\/$/, "");
  } catch {
    return "";
  }
}

async function main() {
  const elements = new Map();
  let tiles = 0;
  for (let s = KV.south; s < KV.north - 1e-9; s += TILE) {
    for (let w = KV.west; w < KV.east - 1e-9; w += TILE) {
      const n = Math.min(s + TILE, KV.north);
      const e = Math.min(w + TILE, KV.east);
      const key = `${s.toFixed(2)}_${w.toFixed(2)}`;
      const cached = !REFRESH && fs.existsSync(path.join(RAW_DIR, `${key}.json`));
      const json = await fetchCached(key, tileQuery(s, w, n, e));
      for (const el of json.elements) elements.set(`${el.type}/${el.id}`, el);
      tiles++;
      console.log(`tile ${key}: ${json.elements.length} elements${cached ? " (cached)" : ""}`);
      if (!cached) await sleep(3000);
    }
  }

  // element key -> BOUNDARIES value
  const boundaryOf = new Map();
  for (const [rel, value] of BOUNDARIES) {
    const key = `boundary_${rel}`;
    const cached = !REFRESH && fs.existsSync(path.join(RAW_DIR, `${key}.json`));
    const json = await fetchCached(key, boundaryQuery(rel));
    for (const el of json.elements) boundaryOf.set(`${el.type}/${el.id}`, value);
    console.log(`boundary ${rel}: ${json.elements.length} elements${cached ? " (cached)" : ""}`);
    if (!cached) await sleep(3000);
  }

  const stats = {
    tiles, raw: elements.size, branded: 0, noLatinName: 0, duplicate: 0,
    byBasis: {},
  };
  const candidates = [];
  const overflow = [];

  for (const [sourceId, el] of elements) {
    const t = el.tags || {};
    if (t.brand || t["brand:wikidata"]) { stats.branded++; continue; }
    const name = displayName(t);
    if (!name) { stats.noLatinName++; continue; }

    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;

    let location = null;
    let basis = null;
    let outside = null;
    const fromPc = locationFromPostcode(t["addr:postcode"]);
    if (typeof fromPc === "string") { location = fromPc; basis = "postcode"; }
    else if (fromPc?.outside) outside = fromPc.outside;
    if (!location && !outside && boundaryOf.has(sourceId)) {
      const fromB = locationFromBoundary(boundaryOf.get(sourceId), lat, lon);
      if (typeof fromB === "string") { location = fromB; basis = "boundary"; }
      else if (fromB?.outside && isValidLocation(fromB.outside)) { location = fromB.outside; basis = "boundary"; }
      else if (fromB?.outside) outside = fromB.outside;
    }
    if (!location && !outside) {
      const fromCity = locationFromCity(t);
      if (fromCity) { location = fromCity; basis = "city"; }
    }

    const category = categoryOf(t);
    const site = website(t);
    const what = whatTheyDo(t);

    const reasons = rejectReasons({ category, location, outside, what });
    if (reasons.length) {
      overflow.push({
        name,
        "what they do": what,
        "locality (as found)": outside || location || t["addr:city"] || t["addr:postcode"] || (lat != null ? `${lat.toFixed(4)},${lon.toFixed(4)}` : ""),
        "website or domain": site,
        "why it doesn't fit": reasons.join("; "),
        source: "OpenStreetMap",
        sourceId: `osm:${sourceId}`,
      });
      continue;
    }

    candidates.push({
      ...blankListing(),
      name, category, location,
      website: site,
      address: address(t),
      openingHours: (t.opening_hours || "").trim(),
      source: "OpenStreetMap",
      sourceId: `osm:${sourceId}`,
      sourceYear: (t["check_date"] || t["survey:date"] || "").slice(0, 4),
      locationBasis: basis,
      sourceType: what,
    });
    stats.byBasis[basis] = (stats.byBasis[basis] || 0) + 1;
  }

  // Same name, same locality: a second branch of one business. Keep one.
  const listings = assignIds(candidates, stats);
  writeOutputs(OUT_DIR, listings, overflow, stats);
  console.log("Data © OpenStreetMap contributors, ODbL — attribute before publishing.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
