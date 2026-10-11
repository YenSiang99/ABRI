// Writes SourceRecord rows — what each public source says about each listing —
// from data/seed/sources.csv (built by scripts/sources/merge.mjs).
//
//   node scripts/sync-source-records.mjs            # dry run: counts only
//   node scripts/sync-source-records.mjs --apply
//
// Run after import-seed.mjs. One row per (source, sourceId); a row that
// already exists is updated to what the source says now. Only listings that
// exist in this database get records, claimed ones included: a SourceRecord
// is the register's word about the business, not a change to anything its
// owner controls.
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
const { readCsv, nameKey, REPO_ROOT } = await import("./sources/common.mjs");

const APPLY = process.argv.includes("--apply");
const FILE = path.join(REPO_ROOT, "data", "seed", "sources.csv");
const BATCH = 500;

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

// A seed row → SourceRecord data. The source's own id loses the
// "<source>:" prefix the extractors give it.
function record(r) {
  const prefix = `${r.source}:`;
  const sourceId = r.sourceId.startsWith(prefix) ? r.sourceId.slice(prefix.length) : r.sourceId;
  const ssm = r.ssm?.trim() || null;
  return {
    businessId: r.id,
    source: r.source,
    sourceId,
    ssm,
    ssmNormalized: ssm ? normalizeSsm(ssm) : null,
    name: r.name || null,
    category: r.category || null,
    address: r.address || null,
    phone: r.phone || null,
    whatsapp: r.whatsapp || null,
    email: r.email || null,
    website: r.website || null,
    detail: r.sourceType ? { type: r.sourceType } : undefined,
    sourceYear: r.sourceYear || null,
  };
}

async function main() {
  const label = target(process.env.DATABASE_URL);
  const local = label === localEnvLabel();
  console.log(`Target: ${label}${local ? " (backend/.env)" : ""}${APPLY ? "" : "  (dry run)"}`);
  if (APPLY && !local && process.env.ABRI_IMPORT_CONFIRM !== label) {
    console.error(`Refusing to write to a database other than backend/.env's. Set ABRI_IMPORT_CONFIRM=${label} to confirm.`);
    process.exit(1);
  }
  if (!fs.existsSync(FILE)) {
    console.error("No data/seed/sources.csv — run scripts/sources/merge.mjs first.");
    process.exit(1);
  }

  // A seed row whose id is not in the database may still be here under
  // another id: import-seed.mjs skips a row when a business with the same
  // name and locality exists. Matched the same way, and only when exactly one
  // business has that name and locality.
  const businesses = await prisma.business.findMany({ select: { id: true, name: true, location: true } });
  const ids = new Set(businesses.map((b) => b.id));
  const byNameLoc = new Map();
  for (const b of businesses) {
    const k = `${nameKey(b.name)}|${b.location}`;
    byNameLoc.set(k, byNameLoc.has(k) ? null : b.id);
  }
  const seedById = new Map(readCsv(path.join(REPO_ROOT, "data", "seed", "listings.csv")).map((r) => [r.id, r]));
  const existing = new Set(
    (await prisma.sourceRecord.findMany({ select: { source: true, sourceId: true } })).map((r) => `${r.source}|${r.sourceId}`),
  );
  const rows = readCsv(FILE).map(record);
  const stats = { inFile: rows.length, noListing: 0, toCreate: 0, toUpdate: 0, withSsm: 0, bySource: {} };
  const create = [], update = [];
  for (const r of rows) {
    if (!ids.has(r.businessId)) {
      const seed = seedById.get(r.businessId);
      const other = seed && byNameLoc.get(`${nameKey(seed.name)}|${seed.location}`);
      if (!other) { stats.noListing++; continue; }
      r.businessId = other;
      stats.matchedByName = (stats.matchedByName || 0) + 1;
    }
    stats.bySource[r.source] = (stats.bySource[r.source] || 0) + 1;
    if (r.ssm) stats.withSsm++;
    (existing.has(`${r.source}|${r.sourceId}`) ? update : create).push(r);
  }
  stats.toCreate = create.length;
  stats.toUpdate = update.length;
  console.log(stats);
  if (!APPLY) {
    console.log("Dry run — nothing written. Re-run with --apply to write.");
    return;
  }

  for (let i = 0; i < create.length; i += BATCH) {
    await prisma.sourceRecord.createMany({ data: create.slice(i, i + BATCH), skipDuplicates: true });
    process.stdout.write(`\r  created ${Math.min(i + BATCH, create.length)}/${create.length}`);
  }
  for (let i = 0; i < update.length; i += BATCH) {
    await prisma.$transaction(update.slice(i, i + BATCH).map(({ source, sourceId, ...data }) =>
      prisma.sourceRecord.update({ where: { source_sourceId: { source, sourceId } }, data })));
    process.stdout.write(`\r  updated ${Math.min(i + BATCH, update.length)}/${update.length}`);
  }
  console.log(`\nDone. SourceRecord rows now: ${await prisma.sourceRecord.count()}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
