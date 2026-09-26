// Maps DBKL's list of licensed business premises in Kuala Lumpur onto the
// intake sheet.
//
//   node scripts/sources/dbkl.mjs
//
// SOURCE. "Senarai Lokasi Aktiviti Perniagaan Berlesen Di Kuala Lumpur",
// published by Dewan Bandaraya Kuala Lumpur on archive.data.gov.my under
// CC-BY 4.0: 55,530 trade licences, 36,589 companies, 427 licensed activity
// types, each with the company's name and premises address.
//
// TWO THINGS TO KNOW ABOUT IT:
//
// 1. IT IS FROM 2019. Some of these businesses closed in 2020–21 and never
//    reopened. Every row carries sourceYear 2019 so the merge step can mark
//    the ones another source confirms still exist.
//
// 2. NAMES ARE LEGAL NAMES, not trading names ("GERBANG ALAF RESTAURANTS SDN
//    BHD", not "McDonald's"). That is exactly right for matching an SSM
//    record at claim time, and less friendly on a directory card. When the
//    merge finds the same business in Overture or OSM, their trading name
//    wins.
//
// No xlsx dependency: the file is fetched once and parsed with the unzip +
// XML reader below, which is all a single-sheet export needs.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  outDir, blankListing, locationFromPostcode, rejectReasons, assignIds,
  writeOutputs, titleCase, nameKey,
} from "./common.mjs";

const DIR = outDir("dbkl");
const XLSX = path.join(DIR, "raw", "dbkl-licensed-premises-2019.xlsx");
const DATASET_TITLE = "Senarai Lokasi Aktiviti Perniagaan Berlesen Di Kuala Lumpur";

async function download() {
  if (fs.existsSync(XLSX)) return;
  const q = encodeURIComponent(`title:"${DATASET_TITLE}"`);
  const res = await fetch(`https://archive.data.gov.my/data/api/3/action/package_search?rows=1&q=${q}`);
  const pkg = (await res.json()).result.results[0];
  const file = pkg.resources.find((r) => r.format.toUpperCase() === "XLSX");
  console.log(`Downloading ${pkg.title} (${pkg.license_title}) …`);
  const buf = Buffer.from(await (await fetch(file.url)).arrayBuffer());
  fs.writeFileSync(XLSX, buf);
}

// Minimal single-sheet xlsx reader: shared strings + sheet1 cells.
function readXlsx(file) {
  const unzip = (member) => execFileSync("unzip", ["-p", file, member], { maxBuffer: 1 << 30 }).toString("utf8");
  const decode = (s) => s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  const strings = [...unzip("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map((m) => decode([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
  const rows = [];
  for (const rm of unzip("xl/worksheets/sheet1.xml").matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cm of rm[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const col = cm[1].split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
      const v = /<v>([\s\S]*?)<\/v>/.exec(cm[3] || "")?.[1];
      const inline = /<t[^>]*>([\s\S]*?)<\/t>/.exec(cm[3] || "")?.[1];
      row[col] = /t="s"/.test(cm[2]) ? strings[Number(v)] : decode(inline ?? v ?? "");
    }
    rows.push(row);
  }
  return rows;
}

// ── Category ──────────────────────────────────────────────────────────────
//
// DBKL's 427 licence activities, matched by keyword in order — the first
// rule that matches wins, so the specific rules sit above the general ones
// ("MENGILANG UBAT" is a factory before "UBAT" makes it a pharmacy).
// null → overflow with the activity as "what they do"; SKIP → dropped.

const SKIP = Symbol("not a listing");

const RULES = [
  // Not a business the directory lists, or not one that fits any category.
  [/^PEJABAT URUSAN/, null],             // "business office": no stated trade
  [/GUDANG|STOR (?!ROTAN)|MENYIMPAN (DIESEL|BESI|BERAS|KAYU|DAN MEMPROSES GETAH|GAS)/, null],
  [/BANK|PERKHIDMATAN WANG|PEMINJAM WANG|PAJAK GADAI|INSURANS/, null],
  [/HOTEL|RUMAH SEWA|^DEWAN|AUDITORIUM|RUANG LEGAR/, null],
  [/KARAOKE|PERJUDIAN|NOMBOR RAMALAN|TOTALISATOR|PANGGUNG|CINEPLEX|BILLARD|BOLING|PUSAT PERMAINAN|TAMAN PERMAINAN|PUSAT HIBURAN|FUTSAL|MEMANAH|PLAYSTATION|JOKI|DEWAN TARI/, null],
  [/TILIK NASIB|KERANDA|MAYAT|SENJATA|MERCUN|TATOO|TATU|SEMBELIHAN|ROKOK|SHISHA|TEMBAKAU/, null],
  [/AGENSI PELANCONGAN|AGENSI PEKERJAAN|TIKET|MESIN LAYAN DIRI|PERKHIDMATAN UTILITI|SEWA|PUSAT SIBER/, null],
  // Automotive (before laundries: "MENCUCI … KENDERAAN" is a car wash)
  [/KENDERAAN|KERETA|MOTORSIKAL|TAYAR|BENGKEL|BATERI|MENYEMBUR CAT|GARAJ/, "Automotive"],
  [/DOBI|MENCUCI (DAN|\/)/, null],

  // School canteens are food businesses, whatever "SEKOLAH" says.
  [/KANTIN/, "Food & Beverage"],

  // Education / Professional Training
  [/PUSAT LATIHAN KEMAHIRAN|PUSAT LATIHAN KECANTIKAN/, "Professional Training"],
  [/TADIKA|TUISYEN|SEKOLAH|KOLEJ|IPT|KELAS KESENIAN|PUSAT JAGAAN \(|PUSAT JAGAAN$/, "Education"],

  // Marketing & Media
  [/PERCETAKAN|PAPAN TANDA IKLAN|VISUAL IKLAN|FOTOKOPI|MENJILID|STUDIO RAKAMAN|RAKAMAN AUDIO|MEDIA DIGITAL|FOTOGRAFI|MENGUKIR FOTO/, "Marketing & Media"],

  // Construction & Trades (before Health: "KEJURUTERAAN" contains "URUT")
  [/KEJURUTERAAN|KIMPALAN|WELDING|TUKANG KUNCI|TUKANG BESI|TUKANG KAYU|PERTUKANGAN|MEMOTONG KACA|HAWA DINGIN|PENCEGAH KEBAKARAN|KANOPI|^BAHAN BINAAN|MENGISAR SIMEN|LANDSKAP/, "Construction & Trades"],

  // Manufacturing (before food and pharmacy, which share keywords)
  [/KILANG|MENGILANG|PENGILANGAN|MEMPROSES|MENGETIN|MEMBOTOL|MEMBUAT|MEMBUNGKUS (TEH|DAN MENJUAL MAKANAN RINGAN)|MENCELUP|POTTERY|SADUR|MELEBUR|VERMICILLE|MENJERUK/, "Manufacturing"],

  // Health & Wellness
  [/KLINIK|HOSPITAL|FARMASI|UBAT|UJIAN MAKMAL|JAGAAN SELEPAS BERSALIN|ANGGOTA BADAN PALSU|TIRUAN ANGGOTA/, "Health & Wellness"],
  [/RAWATAN|(^|[ (\/])(URUT|MENGURUT)|URUTAN|SPA|SAUNA|JAKUZI|REFLEKSOLOGI|MANDI HERBA|AROMATERAPI|GIMNASIUM|AEROBIK|KECERGASAN|SENAMAN|MELANGSING|KESIHATAN/, "Health & Wellness"],
  [/SALUN|RAMBUT|KUKU|KECANTIKAN|ANDAMAN|SOLEKAN|BULU MUKA|OPTIK|CERMIN MATA/, "Health & Wellness"],

  // Logistics
  [/KURIER|PENGHANTARAN|MENYETOR BARANG/, "Logistics"],

  // Shops whose activity mentions food but that don't sell it to eat:
  // pet shops ("MAKANAN HAIWAN"), non-food suppliers, clothes stalls.
  [/HAIWAN|AKUARIUM|BUKAN MAKANAN|PAKAIAN|TEKSTIL/, "Retail"],

  // Food & Beverage
  [/RESTORAN|KEDAI MAKAN|KAFE|KEDAI KOPI|GERAI|^BAR( |$)|^PUB( |$)|LOUNGE|MEDAN SELERA|FOOD COURT|KATERING|ROTI|KEK|KUIH|AIS KRIM|BLOK AIS|MEMANGGANG|MAKANAN|MINUMAN/, "Food & Beverage"],

  // Retail — everything that sells goods and matched nothing above
  [/KEDAI|MENJUAL|JUAL|BARANG|BUTIK|RUNCIT|SERBANEKA|PASAR|TELEFON|TELEKOMUNIKASI|KOSMETIK|BAGASI|BEG|JAM|KASUT|PERABOT|PERABUT|CENDERAMATA|ALAT|GALERI|BUNGA|PERMAIDANI|PERALATAN|KOMPUTER|BASIKAL|MUZIK|BUKU|EMAS|PERMATA|ANTIK|HIASAN|MENJAHIT|TUKANG JAHIT|MENYULAM|FABRIK|KULIT|PLASTIK|LOGAM|KACA|CAT|PAPAN|KERTAS|GETAH|MESIN|PAM|STESEN MINYAK|STESYEN MINYAK|STESEN MENGISI|STESEN GAS|PETROLIUM|BAHAN|BAJA|KIMIA|ROTAN|TIRAI|KUSYEN|BINGKAI|PENIMBANG|CAKERA|PITA VIDEO|REKOD|SEMBAHYANG|BAYI|PRODUK/, "Retail"],
];

function categoryOf(activity) {
  for (const [re, cat] of RULES) if (re.test(activity)) return cat;
  return null;
}

// A company holding licences at this many distinct KL premises is a chain
// (7-Eleven, a bank, a franchise operator). Same rule as dropping OSM's
// brand-tagged branches: they bury the SMEs and will never claim.
const CHAIN_PREMISES = 5;

async function main() {
  await download();
  const rows = readXlsx(XLSX);
  const header = rows.findIndex((r) => r?.[2] === "NAMA SYARIKAT");
  const data = rows.slice(header + 1).filter((r) => r?.[2]);

  const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim().replace(/[,.]$/, "");
  const premises = new Map(); // company -> Set(address)
  for (const r of data) {
    // Grouped on nameKey so "AEON BIG (M) SDN.BHD" and "AEON BIG (M) SDN BHD"
    // count as one company's premises.
    const co = nameKey(clean(r[2]));
    if (!premises.has(co)) premises.set(co, new Set());
    premises.get(co).add(`${clean(r[3])}|${clean(r[6])}`);
  }

  const stats = { raw: data.length, companies: premises.size, chain: 0, skipped: 0, duplicate: 0, byBasis: {} };
  const candidates = [];
  const overflow = [];
  // One company can hold several licences at one premises (restaurant + bar).
  // The first one that maps to a category decides; later ones only fill in.
  const seenPremises = new Set();
  const seenOverflow = new Set();

  for (const r of data) {
    const co = clean(r[2]);
    const activity = clean(r[1]).toUpperCase().replace(/\s+/g, " ");
    const postcode = clean(r[6]);
    const premKey = `${co.toUpperCase()}|${clean(r[3])}|${postcode}`;

    if (premises.get(nameKey(co)).size >= CHAIN_PREMISES) { stats.chain++; continue; }
    const category = categoryOf(activity);
    if (category === SKIP) { stats.skipped++; continue; }

    let location = null;
    let basis = null;
    let outside = null;
    const fromPc = locationFromPostcode(postcode);
    if (typeof fromPc === "string") { location = fromPc; basis = "postcode"; }
    else if (fromPc?.outside) outside = fromPc.outside;
    // DBKL only licenses premises inside the Federal Territory, so a missing
    // or odd postcode is still Kuala Lumpur — never Bangsar, which needs the
    // postcode to tell apart.
    if (!location && !outside) { location = "Kuala Lumpur"; basis = "dbkl-territory"; }
    // 68000 and 68100 straddle the KL border (Batu 5 Jalan Ipoh and parts of
    // Ampang use them), and DBKL only licenses premises inside KL — so here
    // they mean Kuala Lumpur, not Ampang or Selayang.
    if (postcode === "68000" || postcode === "68100") { location = "Kuala Lumpur"; basis = "dbkl-territory"; }
    // Any other KL licence with a Selangor postcode is a typo or a
    // head-office address — either way the locality can't be trusted.
    if (location && location !== "Kuala Lumpur" && location !== "Bangsar") {
      outside = `postcode ${postcode} outside DBKL territory`;
      location = null;
    }

    const name = titleCase(co);
    const reasons = rejectReasons({ category, location, outside, what: activity });
    if (reasons.length) {
      if (!seenOverflow.has(premKey)) {
        seenOverflow.add(premKey);
        overflow.push({
          name,
          "what they do": activity,
          "locality (as found)": outside || location || postcode,
          "website or domain": "",
          "why it doesn't fit": reasons.join("; "),
          source: "DBKL licensed premises (data.gov.my)",
          sourceId: `dbkl:${premKey}`,
        });
      }
      continue;
    }
    if (seenPremises.has(premKey)) continue;
    seenPremises.add(premKey);

    const street = [r[3], r[4], r[5]].map(clean)
      .filter((part) => part && !/^(W\.?P\.? )?KUALA LUMPUR$/i.test(part))
      .map(titleCase)
      .join(", ");
    candidates.push({
      ...blankListing(),
      name, category, location,
      address: street ? `${street}${postcode ? `, ${postcode}` : ""} Kuala Lumpur` : "",
      source: "DBKL licensed premises (data.gov.my)",
      sourceId: `dbkl:${premKey}`,
      sourceYear: "2019",
      locationBasis: basis,
      sourceType: activity,
    });
    stats.byBasis[basis] = (stats.byBasis[basis] || 0) + 1;
  }

  const listings = assignIds(candidates, stats);
  writeOutputs(DIR, listings, overflow, stats);
  console.log("Data: Dewan Bandaraya Kuala Lumpur via data.gov.my, CC-BY 4.0 — attribute before publishing.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
