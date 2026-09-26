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
  };
}

// Writes listings.csv, overflow.csv and stats.json for one source, and fills
// the per-category / per-locality counts every source reports.
export function writeOutputs(dir, listings, overflow, stats) {
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
  const original = String(name ?? "").trim();
  if (!NON_LATIN.test(original)) return original;
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
  return (s.match(/\p{Script=Latin}/gu) || []).length >= 2 ? s : "";
}
