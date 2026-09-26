// Brings already-imported seed listings in line with a rebuilt
// data/seed/listings.csv after the name rules change (see nameVerdict in
// scripts/sources/common.mjs).
//
//   node scripts/sync-seed-names.mjs --manifest data/seed/imports/<import>.csv            # dry run
//   node scripts/sync-seed-names.mjs --manifest data/seed/imports/<import>.csv --apply
//
// import-seed.mjs is insert-only, so a better name never reaches a row that is
// already in. This script does exactly two things, and only to rows the given
// import manifest lists:
//   - RENAME: the rebuilt CSV has a different name for the row's sourceId.
//     The id stays — it is the listing's URL.
//   - DELETE: the row's sourceId is gone from the CSV because a source's
//     names.csv says its name was dropped ("separators", "place",
//     "place-decided"). A sourceId gone for any other reason is reported and
//     left alone.
// Either way only untouched rows are written — L0, no account — the same rule
// as import-seed.mjs --remove. A listing somebody has claimed keeps whatever
// name it has.
//
// Every applied change is recorded in data/seed/imports/<db>-names-<stamp>.csv
// (id, action, old name, new name), which is enough to put names back by hand.
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
const { readCsv, toCsv, REPO_ROOT } = await import("./sources/common.mjs");

const APPLY = process.argv.includes("--apply");
const SEED = path.join(REPO_ROOT, "data", "seed", "listings.csv");
const SOURCES = path.join(REPO_ROOT, "data", "sources");
const DROPPED = new Set(["separators", "place", "place-decided"]);
const BATCH = 1000;
const UNTOUCHED = { verificationLevel: "L0", accounts: { none: {} } };

// Same guard as import-seed.mjs.
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
  const mIdx = process.argv.indexOf("--manifest");
  const manifestPath = mIdx > -1 ? process.argv[mIdx + 1] : null;
  if (!manifestPath || !fs.existsSync(manifestPath)) {
    console.error("Pass --manifest data/seed/imports/<the import into this database>.csv");
    process.exit(1);
  }

  const seedBySource = new Map(readCsv(SEED).map((r) => [r.sourceId, r]));
  const verdictBySource = new Map();
  for (const source of fs.readdirSync(SOURCES)) {
    const file = path.join(SOURCES, source, "names.csv");
    if (fs.existsSync(file)) for (const r of readCsv(file)) verdictBySource.set(r.sourceId, r.verdict);
  }

  const imported = readCsv(manifestPath);
  const current = new Map();
  for (let i = 0; i < imported.length; i += BATCH) {
    const found = await prisma.business.findMany({
      where: { id: { in: imported.slice(i, i + BATCH).map((r) => r.id) } },
      select: { id: true, name: true, verificationLevel: true, _count: { select: { accounts: true } } },
    });
    for (const b of found) current.set(b.id, b);
  }

  const renames = [], deletes = [], unresolved = [];
  const stats = { inManifest: imported.length, notInDb: 0, touchedSkipped: 0, unchanged: 0 };
  for (const { id, sourceId } of imported) {
    const b = current.get(id);
    if (!b) { stats.notInDb++; continue; }
    const seed = seedBySource.get(sourceId);
    const wanted = seed ? seed.name : DROPPED.has(verdictBySource.get(sourceId)) ? null : undefined;
    if (wanted === undefined) { unresolved.push({ id, sourceId, name: b.name }); continue; }
    if (wanted === b.name) { stats.unchanged++; continue; }
    if (b.verificationLevel !== "L0" || b._count.accounts) { stats.touchedSkipped++; continue; }
    if (wanted === null) deletes.push({ id, action: "delete", oldName: b.name, newName: "" });
    else renames.push({ id, action: "rename", oldName: b.name, newName: wanted });
  }
  console.log({ ...stats, rename: renames.length, delete: deletes.length, unresolved: unresolved.length });
  for (const u of unresolved.slice(0, 20)) console.log("  unresolved:", u);
  if (!APPLY) {
    for (const r of [...renames.slice(0, 15), ...deletes.slice(0, 15)]) console.log(`  ${r.action}: ${JSON.stringify(r.oldName)} → ${JSON.stringify(r.newName)}`);
    console.log("Dry run — nothing written. Re-run with --apply.");
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const log = path.join(REPO_ROOT, "data", "seed", "imports", `${host}-${port}-${dbName}-names-${stamp}.csv`);
  const done = [];
  for (const r of renames) {
    // Re-checked in the write itself: a claim between the read and now wins.
    const { count } = await prisma.business.updateMany({ where: { id: r.id, ...UNTOUCHED }, data: { name: r.newName } });
    if (count) done.push(r);
  }
  for (let i = 0; i < deletes.length; i += BATCH) {
    const batch = deletes.slice(i, i + BATCH);
    const ids = batch.map((r) => r.id);
    const still = new Set((await prisma.business.findMany({ where: { id: { in: ids }, ...UNTOUCHED }, select: { id: true } })).map((b) => b.id));
    await prisma.business.deleteMany({ where: { id: { in: [...still] }, ...UNTOUCHED } });
    done.push(...batch.filter((r) => still.has(r.id)));
  }
  fs.writeFileSync(log, toCsv(done, ["id", "action", "oldName", "newName"]));
  console.log(`Renamed ${done.filter((r) => r.action === "rename").length}, deleted ${done.filter((r) => r.action === "delete").length}. Business rows now: ${await prisma.business.count()}.`);
  console.log(`Log: ${path.relative(REPO_ROOT, log)}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
