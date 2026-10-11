// Adds businesses and what you know about them, by hand, from one CSV —
// so nobody has to write to Business and SourceRecord separately.
//
//   node scripts/add-source-records.mjs path/to/entries.csv            # dry run
//   node scripts/add-source-records.mjs path/to/entries.csv --apply
//
// Start from scripts/templates/source-records.csv. One row per business:
//
//   businessId  optional — the listing to attach to (its URL slug). Empty:
//               found by name + location, or created if there is none.
//   name, category, location
//               required when creating; category and location from
//               lib/businessVocab.js. location may be empty only when the
//               address is too.
//   address, phone, whatsapp, email, website, ssm
//               what you know. Each becomes part of the SourceRecord, and fills
//               the listing's own field when that is still empty and nobody
//               has claimed it (ssm excepted: Business.ssm is the owner's
//               submitted number, so a hand-entered one stays on the record).
//   source      where you got it; defaults to "manual".
//   sourceRef   what identifies it there: a URL, a document, a note. One
//               record per (source, sourceRef), so re-running updates it.
//   note        anything else, kept in the record's detail.
//
// ANY DATABASE OTHER THAN backend/.env's needs ABRI_IMPORT_CONFIRM, exactly as
// in import-seed.mjs.

import fs from "node:fs";
import path from "node:path";

if (!process.env.DATABASE_URL) {
  const envPath = new URL("../.env", import.meta.url);
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = /^\s*(DATABASE_URL|DIRECT_URL)\s*=\s*"?([^"\n]*)"?/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}

const { prisma } = await import("../src/prisma.js");
const { normalizeSsm } = await import("../src/lib/businessLookup.js");
const { isValidCategory, isValidLocation } = await import("../src/lib/businessVocab.js");
const { readCsv, nameKey, slugify } = await import("./sources/common.mjs");

const APPLY = process.argv.includes("--apply");
const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
const FILLABLE = ["address", "phone", "whatsapp", "email", "website"];

function target(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}/${u.pathname.replace(/^\//, "")}`;
  } catch {
    return "unknown";
  }
}

function localEnvLabel() {
  const envPath = new URL("../.env", import.meta.url);
  if (!fs.existsSync(envPath)) return null;
  const m = /^\s*DATABASE_URL\s*=\s*"?([^"\n]*)"?/m.exec(fs.readFileSync(envPath, "utf8"));
  return m ? target(m[1]) : null;
}

async function main() {
  const label = target(process.env.DATABASE_URL);
  const local = label === localEnvLabel();
  console.log(`Target: ${label}${local ? " (backend/.env)" : ""}${APPLY ? "" : "  (dry run)"}`);
  if (APPLY && !local && process.env.ABRI_IMPORT_CONFIRM !== label) {
    console.error(`Refusing to write to a database other than backend/.env's. Set ABRI_IMPORT_CONFIRM=${label} to confirm.`);
    process.exit(1);
  }
  if (!file || !fs.existsSync(file)) {
    console.error("Usage: node scripts/add-source-records.mjs <entries.csv> [--apply]");
    process.exit(1);
  }

  const businesses = await prisma.business.findMany({
    select: { id: true, name: true, location: true, verificationLevel: true, _count: { select: { accounts: true } }, ...Object.fromEntries(FILLABLE.map((f) => [f, true])) },
  });
  const byId = new Map(businesses.map((b) => [b.id, b]));
  const byNameLoc = new Map();
  for (const b of businesses) {
    const k = `${nameKey(b.name)}|${b.location}`;
    byNameLoc.set(k, byNameLoc.has(k) ? null : b);
  }

  const results = [];
  for (const [i, r] of readCsv(file).entries()) {
    const line = i + 2;
    const name = (r.name ?? "").trim();
    const location = (r.location ?? "").trim();
    const address = (r.address ?? "").trim();
    let business = r.businessId ? byId.get(r.businessId.trim()) : byNameLoc.get(`${nameKey(name)}|${location}`);
    if (r.businessId && !business) { results.push({ line, error: `no listing with id ${r.businessId}` }); continue; }
    let action = "attach";
    if (!business) {
      if (!name) { results.push({ line, error: "name is required to create a listing" }); continue; }
      if (!isValidCategory(r.category)) { results.push({ line, error: `category "${r.category}" is not in businessVocab.js` }); continue; }
      if (!(isValidLocation(location) || (location === "" && !address))) {
        results.push({ line, error: `location "${location}" is not in businessVocab.js (empty only when address is too)` });
        continue;
      }
      let id = slugify(name) || `biz-${Date.now().toString(36)}`;
      if (byId.has(id)) id = `${id}-${slugify(location) || Date.now().toString(36)}`;
      business = { id, name, location, verificationLevel: "L0", _count: { accounts: 0 }, _new: { name, category: r.category, location } };
      byId.set(id, business);
      byNameLoc.set(`${nameKey(name)}|${location}`, business);
      action = "create";
    }
    const untouched = business.verificationLevel === "L0" && business._count.accounts === 0;
    const fill = {};
    for (const f of FILLABLE) {
      const v = (f === "address" ? address : (r[f] ?? "").trim()) || "";
      if (v && untouched && !business[f]) fill[f] = f === "email" ? v.toLowerCase() : v;
    }
    const ssm = (r.ssm ?? "").trim() || null;
    const source = (r.source ?? "").trim() || "manual";
    const sourceId = (r.sourceRef ?? "").trim() || `${business.id}:${new Date().toISOString().slice(0, 10)}`;
    results.push({
      line, action, id: business.id, fill: Object.keys(fill),
      _business: business, _fill: fill,
      _record: {
        businessId: business.id, source, sourceId, ssm, ssmNormalized: ssm ? normalizeSsm(ssm) : null,
        name: name || null, category: r.category || null, address: address || null,
        phone: r.phone?.trim() || null, whatsapp: r.whatsapp?.trim() || null,
        email: r.email?.trim().toLowerCase() || null, website: r.website?.trim() || null,
        detail: r.note?.trim() ? { note: r.note.trim() } : undefined,
      },
    });
  }

  for (const r of results) {
    console.log(r.error ? `line ${r.line}: ✗ ${r.error}` : `line ${r.line}: ${r.action} ${r.id}${r.fill.length ? ` (fills ${r.fill.join(", ")})` : ""}`);
  }
  if (!APPLY) {
    console.log("Dry run — nothing written. Re-run with --apply to write.");
    return;
  }
  for (const r of results.filter((x) => !x.error)) {
    if (r._business._new) {
      await prisma.business.create({ data: { id: r.id, ...r._business._new, ...r._fill } });
    } else if (Object.keys(r._fill).length) {
      await prisma.business.updateMany({ where: { id: r.id, verificationLevel: "L0", accounts: { none: {} } }, data: r._fill });
    }
    const { source, sourceId, ...data } = r._record;
    await prisma.sourceRecord.upsert({
      where: { source_sourceId: { source, sourceId } },
      create: { source, sourceId, ...data },
      update: data,
    });
  }
  console.log(`Done: ${results.filter((x) => !x.error).length} written, ${results.filter((x) => x.error).length} skipped.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
