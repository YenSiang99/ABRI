// Loads data/seed/listings.csv (built by scripts/sources/merge.mjs) into the
// Business table as unclaimed L0 listings.
//
//   node scripts/import-seed.mjs            # dry run: counts only, writes nothing
//   node scripts/import-seed.mjs --apply    # insert
//   node scripts/import-seed.mjs --remove data/seed/imports/<manifest>.csv [--apply]
//                                           # undo one import (see below)
//
// INSERT-ONLY, AND THAT IS THE WHOLE SAFETY STORY. A row is skipped — never
// updated — when either:
//   - its id already exists (a hand-seeded fixture, a real member, an earlier
//     import), or
//   - a business with the same normalised name already exists in the same
//     locality (a member who registered before the import under their own
//     slug). Importing them again would put a second, unclaimable copy of a
//     real member in the directory.
// So re-running is safe, and nothing a member has claimed, edited or
// verified can be touched by this script. Removing imported rows is done
// from the manifest below, never by guessing.
//
// WHAT IS WRITTEN: id, name, category, location, website, address,
// openingHours. Everything else stays at its default — L0, free tier, no
// services. `domain`, phone, whatsapp and email are never written even if
// the CSV had them: see ABRI-data-sources.md → "Rules for imported data".
//
// THE MANIFEST. The Business table has no source column, and the licences
// need one (OSM's ODbL may require separating OSM-derived rows later). Every
// run with --apply writes data/seed/imports/<db>-<timestamp>.csv listing each
// inserted id with its source, which is how those rows are found again.
//
// UNDOING AN IMPORT. --remove deletes the ids a manifest lists, and only
// those still untouched: L0, no account attached. A listing somebody has
// started claiming since the import is theirs now and stays.
//
// ANY DATABASE OTHER THAN backend/.env's needs ABRI_IMPORT_CONFIRM set to
// "<host>:<port>/<dbname>" — the same idea as seed-demo.mjs's guard. It is
// keyed to the whole target, not the hostname, because dev is reached
// through an SSH tunnel: the host is "localhost" and only the port and
// database name say it isn't this machine's database.

import fs from "node:fs";
import path from "node:path";

// DATABASE_URL, resolved file-relative, like seed-demo.mjs — src/prisma.js
// constructs a bare PrismaClient and nothing here loads dotenv.
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
const { isValidCategory, isValidLocation } = await import("../src/lib/businessVocab.js");
const { readCsv, nameKey, REPO_ROOT } = await import("./sources/common.mjs");

const APPLY = process.argv.includes("--apply");
const SEED = path.join(REPO_ROOT, "data", "seed", "listings.csv");
const BATCH = 1000;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function target(url) {
  try {
    const u = new URL(url);
    return { host: u.hostname, port: u.port || "5432", name: u.pathname.replace(/^\//, "") };
  } catch {
    return { host: "unknown", port: "", name: "unknown" };
  }
}

function localEnvUrl() {
  const envPath = new URL("../.env", import.meta.url);
  if (!fs.existsSync(envPath)) return null;
  const m = /^\s*DATABASE_URL\s*=\s*"?([^"\n]*)"?/m.exec(fs.readFileSync(envPath, "utf8"));
  return m ? m[1] : null;
}

async function removeImport(manifestPath) {
  const ids = readCsv(manifestPath).map((r) => r.id);
  const removable = [];
  for (let i = 0; i < ids.length; i += BATCH) {
    const found = await prisma.business.findMany({
      where: { id: { in: ids.slice(i, i + BATCH) }, verificationLevel: "L0", accounts: { none: {} } },
      select: { id: true },
    });
    removable.push(...found.map((b) => b.id));
  }
  console.log({ inManifest: ids.length, removable: removable.length, keptBecauseTouched: ids.length - removable.length });
  if (!APPLY) {
    console.log("Dry run — nothing deleted. Re-run with --apply to delete.");
    return;
  }
  let deleted = 0;
  for (let i = 0; i < removable.length; i += BATCH) {
    const { count } = await prisma.business.deleteMany({
      where: { id: { in: removable.slice(i, i + BATCH) }, verificationLevel: "L0", accounts: { none: {} } },
    });
    deleted += count;
  }
  console.log(`Deleted ${deleted}. Business rows now: ${await prisma.business.count()}.`);
}

async function main() {
  const { host, port, name: dbName } = target(process.env.DATABASE_URL);
  const label = `${host}:${port}/${dbName}`;
  const localUrl = localEnvUrl();
  const local = localUrl && label === (({ host: h, port: p, name: n }) => `${h}:${p}/${n}`)(target(localUrl));
  console.log(`Target: ${label}${local ? " (backend/.env)" : ""}${APPLY ? "" : "  (dry run)"}`);
  if (APPLY && !local && process.env.ABRI_IMPORT_CONFIRM !== label) {
    console.error(`Refusing to write to a database other than backend/.env's. Set ABRI_IMPORT_CONFIRM=${label} to confirm.`);
    process.exit(1);
  }
  const removeIdx = process.argv.indexOf("--remove");
  if (removeIdx > -1) return removeImport(process.argv[removeIdx + 1]);
  if (!fs.existsSync(SEED)) {
    console.error("No data/seed/listings.csv — run scripts/sources/merge.mjs first.");
    process.exit(1);
  }

  const rows = readCsv(SEED);
  const existing = await prisma.business.findMany({ select: { id: true, name: true, location: true } });
  const existingIds = new Set(existing.map((b) => b.id));
  const existingNames = new Set(existing.map((b) => `${nameKey(b.name)}|${b.location}`));

  const stats = { inFile: rows.length, existingBefore: existing.length, invalid: 0, idExists: 0, nameExists: 0, toInsert: 0 };
  const toInsert = [];
  for (const r of rows) {
    if (!SLUG.test(r.id) || !r.name || !isValidCategory(r.category) || !isValidLocation(r.location)) {
      stats.invalid++;
      continue;
    }
    if (existingIds.has(r.id)) { stats.idExists++; continue; }
    if (existingNames.has(`${nameKey(r.name)}|${r.location}`)) { stats.nameExists++; continue; }
    toInsert.push(r);
  }
  stats.toInsert = toInsert.length;
  console.log(stats);
  if (!APPLY) {
    console.log("Dry run — nothing written. Re-run with --apply to insert.");
    return;
  }
  if (!toInsert.length) {
    console.log("Nothing new to insert.");
    return;
  }

  const manifestDir = path.join(REPO_ROOT, "data", "seed", "imports");
  fs.mkdirSync(manifestDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const manifest = path.join(manifestDir, `${host}-${port}-${dbName}-${stamp}.csv`);
  fs.writeFileSync(manifest, "id,primarySource,alsoIn,sourceId\n");

  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    const { count } = await prisma.business.createMany({
      data: batch.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        location: r.location,
        website: r.website || null,
        address: r.address || null,
        openingHours: r.openingHours || null,
      })),
      // A row that appeared between the read above and this write (a member
      // registering mid-import) is skipped, not overwritten.
      skipDuplicates: true,
    });
    inserted += count;
    fs.appendFileSync(
      manifest,
      batch.map((r) => [r.id, r.primarySource, r.alsoIn, r.sourceId].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n") + "\n",
    );
    process.stdout.write(`\r  inserted ${inserted}/${toInsert.length}`);
  }
  const after = await prisma.business.count();
  console.log(`\nDone. Inserted ${inserted}. Business rows now: ${after}.`);
  console.log(`Manifest: ${path.relative(REPO_ROOT, manifest)}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
