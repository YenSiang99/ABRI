// Maps the government registers crawled by crawl/*.mjs onto the intake sheet,
// one data/sources/<source>/listings.csv each, for merge.mjs to pick up.
//
//   node scripts/sources/registers.mjs
//
// SOURCES (raw files from crawl/; see ABRI-ssm-data-sites.md):
//   halal      JAKIM halal directory: one record per company and certificate
//              category, with the company's address
//   motac      MOTAC licence registers: spas and wellness premises
//   datagovmy  MOH pharmaceutical wholesalers, importers and manufacturers,
//              and cosmetics manufacturers (data.gov.my, CC-BY 4.0)
//   myprocurement  every company that won a federal tender or quotation,
//              with its SSM/ROB number and address
//   mdec       Malaysia Digital status companies, with SSM numbers
//   cidb       CIDB's register of currently registered contractors, with
//              address, phone and email (no SSM number)
//
// Same rules as the other extractors (common.mjs): firms only; phone, WhatsApp,
// email and SSM number copied when the register has them; locality from the
// postcode the register printed (or, failing that, a single Klang Valley town
// named in the address); a business whose address is outside the Klang Valley
// goes to overflow with a reason. A business with NO address at all (MDEC
// gives none) is still listed, with address and locality empty, unless its
// SSM number finds an address in another register.
//
// LEFT OUT ON PURPOSE:
//   - JAKIM abattoirs (DBKL skips slaughterhouses too) and "International"
//     certificates (foreign companies).
//   - PriceCatcher premises: supermarket branches and wet markets.

import fs from "node:fs";
import path from "node:path";
import {
  outDir, blankListing, locationFromPostcode, rejectReasons, assignIds,
  writeOutputs, titleCase, capitalise, readCsv,
} from "./common.mjs";
import { BUSINESS_LOCATIONS } from "../../src/lib/businessVocab.js";

const name = (s) => capitalise(titleCase(String(s ?? "").replace(/\s+/g, " ").replace(/\s+\./g, ".").trim()));
const lastPostcode = (s) => [...String(s ?? "").matchAll(/\b(\d{5})\b/g)].pop()?.[1] ?? "";

function* jsonl(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) if (line) yield JSON.parse(line);
}

// A Klang Valley locality named in an address, when exactly one is. Longest
// names first, so "Petaling Jaya" is not also read as a bare "Jaya".
const TOWNS = [...BUSINESS_LOCATIONS].sort((a, b) => b.length - a.length)
  .map((t) => [t, new RegExp(`\\b${t.replace(/[()]/g, "").replace(/\\s+/g, "\\s+")}\\b`, "i")]);
function townIn(address) {
  let s = String(address ?? "");
  const found = [];
  for (const [t, re] of TOWNS) if (re.test(s)) { found.push(t); s = s.replace(re, " "); }
  return found.length === 1 ? found[0] : null;
}

const ssmKey = (v) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// One register row → a listing or an overflow row.
function place(rows, overflow, stats, { name: n, category, postcode, address, source, sourceId, what, phone = "", email = "", whatsapp = "", ssm = "", website = "" }) {
  let location = null, outside = null, basis = "postcode";
  if (!address) {
    location = ""; basis = "no address";
  } else {
    const fromPc = locationFromPostcode(postcode);
    if (typeof fromPc === "string") location = fromPc;
    else if (fromPc?.outside) outside = fromPc.outside;
    else if (postcode) outside = `postcode ${postcode}`;
    else if ((location = townIn(address))) basis = "town in address";
  }
  const reasons = location === "" ? rejectReasons({ category, location: "Kuala Lumpur", what }) : rejectReasons({ category, location, outside, what });
  if (reasons.length) {
    overflow.push({
      name: n, "what they do": what, "locality (as found)": outside || location || "",
      "website or domain": website, "why it doesn't fit": reasons.join("; "), source, sourceId,
    });
    stats.overflow = (stats.overflow || 0) + 1;
    return;
  }
  rows.push({
    ...blankListing(), name: n, category, location, address, source, sourceId,
    phone: String(phone ?? "").trim(), email: String(email ?? "").trim().toLowerCase(),
    whatsapp, ssm, website,
    sourceYear: "2026", locationBasis: basis, sourceType: what,
  });
  stats.byBasis = stats.byBasis || {};
  stats.byBasis[basis] = (stats.byBasis[basis] || 0) + 1;
}

// ── JAKIM halal ─────────────────────────────────────────────────────────────
// The certificate category says what the company does with halal food.
const HALAL_CATEGORY = {
  PE: "Food & Beverage", // food premises: restaurants, cafes, caterers
  PR: "Manufacturing",   // food and drink products
  OEM: "Manufacturing",
  BG: "Manufacturing",   // consumer goods
  FM: "Manufacturing",   // pharmaceuticals
  KO: "Manufacturing",   // cosmetics and personal care
  MD: "Manufacturing",   // medical devices
  PL: "Logistics",
};

function halal() {
  const dir = outDir("halal");
  const rows = [], overflow = [], stats = { raw: 0 };
  // A company certified in several categories is one business: the first
  // category in this order decides (a restaurant that also makes sauces is a
  // restaurant).
  const order = Object.keys(HALAL_CATEGORY);
  const byCode = new Map();
  for (const r of jsonl(path.join(dir, "raw", "companies.jsonl"))) {
    stats.raw++;
    if (!(r.category in HALAL_CATEGORY)) continue;
    const prev = byCode.get(r.code);
    if (!prev || order.indexOf(r.category) < order.indexOf(prev.category)) byCode.set(r.code, r);
  }
  for (const r of byCode.values()) {
    const lines = r.address.split("\n");
    place(rows, overflow, stats, {
      name: name(r.name),
      category: HALAL_CATEGORY[r.category],
      postcode: lines.find((l) => /^\d{5}$/.test(l.trim())) ?? lastPostcode(r.address),
      address: lines.map((l) => titleCase(l.replace(/[,\s]+$/, "").trim())).filter(Boolean).join(", "),
      source: "JAKIM halal directory",
      sourceId: `halal:${r.code}`,
      what: `halal certificate: ${r.categoryName}`,
    });
  }
  writeOutputs(dir, assignIds(rows, stats), overflow, stats);
}

// ── MOTAC ───────────────────────────────────────────────────────────────────
const MOTAC_CATEGORY = {
  "agensi-pelancongan-tobtab": "Travel & Hospitality",
  "agensi-pelancongan-umrah": "Travel & Hospitality",
  "syarikat-mm2h-berlesen": "Travel & Hospitality",
  "hotel-berdaftar": "Travel & Hospitality",
  "penggredan-hotel": "Travel & Hospitality",
  "penggredan-green-hotel": "Travel & Hospitality",
  "malaysia-tourism-quality-assurancesmytqa": "Travel & Hospitality",
  "penggredan-spa": "Health & Wellness",
  "premis-kesejahteraan-urutan-pku": "Health & Wellness",
};

function motac() {
  const dir = outDir("motac");
  const rows = [], overflow = [], stats = { raw: 0 };
  for (const r of jsonl(path.join(dir, "raw", "registers.jsonl"))) {
    stats.raw++;
    place(rows, overflow, stats, {
      name: name(r.name),
      category: MOTAC_CATEGORY[r.register] ?? null,
      postcode: lastPostcode(r.address),
      address: titleCase(r.address ?? ""),
      phone: String(r.phone ?? "").split(/\s*\/\s*/)[0],
      source: "MOTAC licence registers",
      sourceId: `motac:${r.register}:${r.lesen || r.num}:${r.name}`,
      what: `MOTAC ${r.register}`,
    });
  }
  writeOutputs(dir, assignIds(rows, stats), overflow, stats);
}

// ── data.gov.my ─────────────────────────────────────────────────────────────
const DATAGOVMY = {
  pharmaceutical_wholesalers: "Health & Wellness",
  pharmaceutical_importers: "Health & Wellness",
  pharmaceutical_manufacturers: "Manufacturing",
  cosmetics_manufacturers: "Manufacturing",
};

function datagovmy() {
  const dir = outDir("datagovmy");
  const rows = [], overflow = [], stats = { raw: 0 };
  for (const [dataset, category] of Object.entries(DATAGOVMY)) {
    const file = path.join(dir, "raw", `${dataset}.csv`);
    if (!fs.existsSync(file)) continue;
    readCsv(file).forEach((r, i) => {
      stats.raw++;
      const street = titleCase(String(r.address ?? "").replace(/[,\s]+$/, ""));
      place(rows, overflow, stats, {
        name: name(r.company),
        category,
        postcode: r.postcode,
        address: [street, r.postcode].filter(Boolean).join(", "),
        phone: r.phone ?? "",
        source: "data.gov.my (MOH, KKM)",
        sourceId: `datagovmy:${dataset}:${r.license_no || i}`,
        what: dataset.replace(/_/g, " "),
      });
    });
  }
  writeOutputs(dir, assignIds(rows, stats), overflow, stats);
}

// ── myProcurement ───────────────────────────────────────────────────────────
// One listing per winning company (keyed on its SSM/ROB number), in the
// category of what it mostly won.
const PROCUREMENT_CATEGORY = {
  "Bekalan": "Wholesale & Distribution",
  "Bekalan Dan Perkhidmatan Bukan Perunding": "Wholesale & Distribution",
  "Kerja": "Construction & Trades",
  "Perkhidmatan Bukan Perunding": "Business Services",
  "Perkhidmatan Perunding": "Business Services",
};

function procurementWinners() {
  const byKey = new Map();
  for (const d of jsonl(path.join(outDir("myprocurement"), "raw", "details.jsonl"))) {
    for (const w of d.winners) {
      const winner = w["Nama Petender Berjaya"];
      if (!winner) continue;
      const reg = w["No. Pendaftaran ROB/ROS/ROC"] ?? "";
      const key = ssmKey(reg) || ssmKey(winner);
      const e = byKey.get(key) ?? { name: winner, reg, address: "", kinds: {}, awards: 0 };
      if (!e.address && w["Alamat Petender Berjaya"]) e.address = w["Alamat Petender Berjaya"];
      const kind = w["Kategori Perolehan"] ?? d.award?.["Kategori Perolehan"] ?? "";
      e.kinds[kind] = (e.kinds[kind] || 0) + 1;
      e.awards++;
      byKey.set(key, e);
    }
  }
  return byKey;
}

function myprocurement(winners) {
  const dir = outDir("myprocurement");
  const rows = [], overflow = [], stats = { raw: winners.size };
  for (const [key, e] of winners) {
    const kind = Object.entries(e.kinds).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    place(rows, overflow, stats, {
      name: name(e.name),
      category: PROCUREMENT_CATEGORY[kind] ?? null,
      postcode: lastPostcode(e.address),
      address: titleCase(e.address),
      ssm: e.reg,
      source: "myProcurement (MOF) award results",
      sourceId: `myprocurement:${key}`,
      what: `government ${kind.toLowerCase()} (${e.awards} award${e.awards > 1 ? "s" : ""})`,
    });
  }
  writeOutputs(dir, assignIds(rows, stats), overflow, stats);
}

// ── CIDB ────────────────────────────────────────────────────────────────────
// Every contractor with a current CIDB registration. The register prints no
// SSM number (it can be searched by one, not read), so none is copied. The
// registered address ends "<postcode> <district>\n<state>".
const blank = (v) => (/^[\s-]*$/.test(String(v ?? "")) ? "" : String(v).trim());

function cidb() {
  const dir = outDir("cidb");
  const rows = [], overflow = [], stats = { raw: 0 };
  for (const r of jsonl(path.join(dir, "raw", "details.jsonl"))) {
    stats.raw++;
    const address = String(r["Registered Address"] ?? "");
    const lines = address.split("\n").map((l) => l.replace(/[,\s]+$/, "").trim()).filter(Boolean);
    place(rows, overflow, stats, {
      name: name(r.Name),
      category: "Construction & Trades",
      postcode: lastPostcode(lines.at(-2) ?? "") || lastPostcode(address),
      address: lines.map(titleCase).join(", "),
      phone: blank(r["Tel No"]),
      email: blank(r.Email),
      source: "CIDB contractor register",
      sourceId: `cidb:${r.id}`,
      what: `CIDB contractor ${[...new Set((r.grades ?? []).map((g) => g.grade))].join("/")} ${[...new Set((r.grades ?? []).map((g) => g.category.split(" - ")[0]))].join("/")}`.trim(),
    });
  }
  writeOutputs(dir, assignIds(rows, stats), overflow, stats);
}

// ── MDEC ────────────────────────────────────────────────────────────────────
// Name, website and SSM number only. An address comes from myProcurement when
// the same SSM number won a government contract; otherwise none.
function mdec(winners) {
  const dir = outDir("mdec");
  const rows = [], overflow = [], stats = { raw: 0, addressFromProcurement: 0 };
  const byReg = new Map();
  for (const e of winners.values()) for (const part of String(e.reg).split(/[()\s]+/)) if (ssmKey(part).length >= 6) byReg.set(ssmKey(part), e);
  const file = fs.readdirSync(path.join(dir, "raw")).filter((f) => f.endsWith(".csv")).sort().pop();
  for (const r of readCsv(path.join(dir, "raw", file))) {
    stats.raw++;
    const company = r.Companyname ?? r["\ufeffCompanyname"];
    if (!company) continue;
    const reg = String(r.ROCNo ?? "").trim();
    const match = reg.split(/[()\s]+/).map(ssmKey).filter((k) => k.length >= 6).map((k) => byReg.get(k)).find(Boolean);
    if (match) stats.addressFromProcurement++;
    const url = String(r.URL ?? "").trim();
    place(rows, overflow, stats, {
      name: name(company),
      category: "IT Consulting",
      postcode: match ? lastPostcode(match.address) : "",
      address: match ? titleCase(match.address) : "",
      ssm: reg,
      website: /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(url) ? (url.startsWith("http") ? url : `https://${url}`) : "",
      source: "MDEC Malaysia Digital status companies",
      sourceId: `mdec:${ssmKey(reg) || ssmKey(company)}`,
      what: `Malaysia Digital status (${r.Year})`,
    });
  }
  writeOutputs(dir, assignIds(rows, stats), overflow, stats);
}

halal();
motac();
datagovmy();
const winners = procurementWinners();
myprocurement(winners);
mdec(winners);
cidb();
console.log("Data: JAKIM, MOTAC, MOH via data.gov.my (CC-BY 4.0), MOF myProcurement, MDEC, CIDB — attribute before publishing.");
