// Brings already-imported seed listings in line with a rebuilt
// data/seed/listings.csv: names after the name rules change (see nameVerdict
// in scripts/sources/common.mjs), the map point (lat/lng), and the id.
//
//   node scripts/sync-seed-names.mjs --manifest data/seed/imports/<import>.csv            # dry run
//   node scripts/sync-seed-names.mjs --manifest data/seed/imports/<import>.csv --apply
//
// Refuses to apply when it would delete more than a tenth of the manifest's
// rows (see below); --force overrides.
//
// import-seed.mjs is insert-only, so a better name or a new column never
// reaches a row that is already in. This script does exactly two things, and
// only to rows the given import manifest lists:
//   - UPDATE: the rebuilt CSV has a different name, point or id for the
//     row's sourceId. An id changes only when the CSV's id is free in this
//     database — "pulau-ketam" (from the 26 Sep English-only name) becomes
//     "pulau-ketam-<source id>" once the name is "一品味海鲜火锅 (Pulau
//     Ketam)". Every table that points at a business follows it (all
//     foreign keys are ON UPDATE CASCADE), and the manifest is rewritten
//     with the new ids so the next run still finds the row.
//   - DELETE: the row's sourceId is gone from the CSV because a source's
//     names.csv says its name was dropped ("place", "place-decided",
//     "closed", "empty"), or because its source still lists it but the merge
//     folded it into another row with the same name and locality — a
//     duplicate — or because merge.mjs removed it as not a business
//     (nonBusiness.mjs, reason in data/seed/nonbusiness.csv). A sourceId gone for any other
//     reason is reported and left alone.
// Either way only untouched rows are written — L0, no account — the same rule
// as import-seed.mjs --remove. A listing somebody has claimed keeps whatever
// name it has.
//
// Every applied change is recorded in data/seed/imports/<db>-names-<stamp>.csv
// (id, action, old and new name and point), which is enough to put them back
// by hand.
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
const { readCsv, toCsv, nameKey, REPO_ROOT } = await import("./sources/common.mjs");

const APPLY = process.argv.includes("--apply");
const SEED = path.join(REPO_ROOT, "data", "seed", "listings.csv");
const SOURCES = path.join(REPO_ROOT, "data", "sources");
const DROPPED = new Set(["place", "place-decided", "closed", "empty"]);
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

  const seedRows = readCsv(SEED);
  const seedBySource = new Map(seedRows.map((r) => [r.sourceId, r]));
  // A row a source still lists but the merged CSV doesn't was merged into
  // another row with the same name and locality: a duplicate.
  // A row the source itself folded into a same-named neighbour ("TROIS
  // International Sdn Bhd" beside "TROIS International") is in neither — it
  // is found by name and locality instead.
  const seedByKey = new Map(seedRows.map((r) => [`${nameKey(r.name)}|${r.location}`, r]));
  // Removed by merge.mjs as not a business (nonBusiness.mjs), with a reason.
  const nonBusiness = new Map();
  const nbFile = path.join(REPO_ROOT, "data", "seed", "nonbusiness.csv");
  if (fs.existsSync(nbFile)) for (const r of readCsv(nbFile)) nonBusiness.set(r.sourceId, r.reason);
  const inSources = new Set();
  for (const source of fs.readdirSync(SOURCES)) {
    const file = path.join(SOURCES, source, "listings.csv");
    if (fs.existsSync(file)) for (const r of readCsv(file)) inSources.add(r.sourceId);
  }
  // Every id in the database, so an id change never lands on one a staying
  // row still uses.
  const allIds = (await prisma.business.findMany({ select: { id: true } })).map((b) => b.id);
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
      select: { id: true, name: true, location: true, lat: true, lng: true, verificationLevel: true, _count: { select: { accounts: true } } },
    });
    for (const b of found) current.set(b.id, b);
  }

  const updates = [], deletes = [], unresolved = [];
  const stats = { inManifest: imported.length, notInDb: 0, touchedSkipped: 0, unchanged: 0 };
  for (const { id, sourceId } of imported) {
    const b = current.get(id);
    if (!b) { stats.notInDb++; continue; }
    const seed = seedBySource.get(sourceId);
    const twin = !seed && seedByKey.get(`${nameKey(b.name)}|${b.location}`);
    const notBusiness = !seed && nonBusiness.get(sourceId);
    const duplicate = !seed && !notBusiness && (inSources.has(sourceId) || (twin && twin.sourceId !== sourceId));
    const wanted = seed ? seed.name : DROPPED.has(verdictBySource.get(sourceId)) || duplicate || notBusiness ? null : undefined;
    if (wanted === undefined) { unresolved.push({ id, sourceId, name: b.name }); continue; }
    const lat = seed?.lat ? Number(seed.lat) : null;
    const lng = seed?.lng ? Number(seed.lng) : null;
    const was = { oldName: b.name, oldLat: b.lat ?? "", oldLng: b.lng ?? "" };
    if (wanted === null) {
      if (b.verificationLevel !== "L0" || b._count.accounts) { stats.touchedSkipped++; continue; }
      deletes.push({ id, action: notBusiness ? `delete-not-business (${notBusiness})` : duplicate ? "delete-duplicate" : "delete", ...was });
      continue;
    }
    const data = {};
    if (wanted !== b.name) data.name = wanted;
    if (lat !== b.lat || lng !== b.lng) Object.assign(data, { lat, lng });
    if (seed.id !== id) data.id = seed.id;
    if (!Object.keys(data).length) { stats.unchanged++; continue; }
    if (b.verificationLevel !== "L0" || b._count.accounts) { stats.touchedSkipped++; continue; }
    updates.push({ id, action: "update", data, ...was, newId: data.id ?? "", newName: data.name ?? "", newLat: data.lat ?? "", newLng: data.lng ?? "" });
  }
  // Which id changes can land. Rows that move or are deleted give up their
  // ids, so a mall and the restaurant inside it can trade "klang-parade" in
  // one run; a target held by a row that stays (or wanted by two rows) is
  // skipped and the row keeps its id.
  const leaving = new Set([...updates.filter((u) => u.data.id).map((u) => u.id), ...deletes.map((d) => d.id)]);
  const held = new Set(allIds.filter((id) => !leaving.has(id)));
  const wantedBy = new Map();
  for (const u of updates) if (u.data.id) wantedBy.set(u.data.id, (wantedBy.get(u.data.id) || 0) + 1);
  for (const u of updates) {
    if (u.data.id && (held.has(u.data.id) || wantedBy.get(u.data.id) > 1)) {
      delete u.data.id;
      u.newId = "";
    }
  }
  const pending = updates.filter((u) => Object.keys(u.data).length);
  stats.unchanged += updates.length - pending.length;
  updates.splice(0, updates.length);
  for (const u of pending) updates.push(u);
  console.log({
    ...stats, update: updates.length,
    renamed: updates.filter((u) => "name" in u.data).length,
    pointSet: updates.filter((u) => "lat" in u.data).length,
    idChanged: updates.filter((u) => "id" in u.data).length,
    delete: deletes.length,
    duplicate: deletes.filter((d) => d.action === "delete-duplicate").length,
    notBusiness: deletes.filter((d) => d.action.startsWith("delete-not-business")).length,
    unresolved: unresolved.length,
  });
  for (const u of unresolved.slice(0, 20)) console.log("  unresolved:", u);
  // A mass delete is almost always a broken input — a manifest the CSV
  // reader mangled, the wrong CSV — not a real change. Seen once already: a
  // manifest rewritten with \r\n line endings matched no sourceId, and every
  // row read as a duplicate.
  if (APPLY && deletes.length > imported.length * 0.1 && !process.argv.includes("--force")) {
    console.error(`Refusing: this would delete ${deletes.length} of ${imported.length} rows. Check the inputs, or pass --force.`);
    process.exit(1);
  }
  if (!APPLY) {
    for (const r of [...updates.slice(0, 10), ...deletes.slice(0, 10)]) console.log(`  ${r.action} ${r.id}:`, r.data ?? "");
    console.log("Dry run — nothing written. Re-run with --apply.");
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const log = path.join(REPO_ROOT, "data", "seed", "imports", `${host}-${port}-${dbName}-names-${stamp}.csv`);
  const done = [];
  // One statement per BATCH rows — a point backfill is ~126k rows, too many
  // round trips through the dev tunnel one at a time. The untouched check is
  // in the statement itself: a claim between the read and now wins.
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    const updated = await prisma.$queryRaw`
      UPDATE "Business" b
         SET name = COALESCE(v.name, b.name),
             lat  = CASE WHEN v.setpoint THEN v.lat ELSE b.lat END,
             lng  = CASE WHEN v.setpoint THEN v.lng ELSE b.lng END
        FROM unnest(${batch.map((r) => r.id)}::text[],
                    ${batch.map((r) => r.data.name ?? null)}::text[],
                    ${batch.map((r) => "lat" in r.data)}::boolean[],
                    ${batch.map((r) => r.data.lat ?? null)}::float8[],
                    ${batch.map((r) => r.data.lng ?? null)}::float8[]) AS v(id, name, setpoint, lat, lng)
       WHERE b.id = v.id
         AND b."verificationLevel" = 'L0'
         AND NOT EXISTS (SELECT 1 FROM "Account" a WHERE a."businessId" = b.id)
      RETURNING b.id`;
    const ok = new Set(updated.map((u) => u.id));
    done.push(...batch.filter((r) => ok.has(r.id)));
    process.stdout.write(`\r  updated ${Math.min(i + BATCH, updates.length)}/${updates.length}`);
  }
  for (let i = 0; i < deletes.length; i += BATCH) {
    const batch = deletes.slice(i, i + BATCH);
    const ids = batch.map((r) => r.id);
    const still = new Set((await prisma.business.findMany({ where: { id: { in: ids }, ...UNTOUCHED }, select: { id: true } })).map((b) => b.id));
    try {
      await prisma.business.deleteMany({ where: { id: { in: [...still] }, ...UNTOUCHED } });
    } catch {
      // Something points at one of these (a follow, a watch — most foreign
      // keys are ON DELETE RESTRICT). Go one by one, keep the ones that are
      // blocked, and say which.
      for (const id of [...still]) {
        try {
          await prisma.business.delete({ where: { id } });
        } catch {
          still.delete(id);
          console.log(`  kept ${id}: something still refers to it`);
        }
      }
    }
    done.push(...batch.filter((r) => still.has(r.id)));
  }
  // Ids last, after the deletes have freed theirs, in two steps: every moving
  // row first steps aside to a temporary id, then takes its new one — so two
  // rows can swap. Same untouched guard on the first step; the second only
  // touches rows the first one moved.
  const moves = done.filter((r) => r.data?.id);
  const moved = new Map();
  const TMP = "~sync~";
  for (let i = 0; i < moves.length; i += BATCH) {
    const batch = moves.slice(i, i + BATCH);
    const rows = await prisma.$queryRaw`
      UPDATE "Business" b SET id = ${TMP} || v.oldid
        FROM unnest(${batch.map((r) => r.id)}::text[]) AS v(oldid)
       WHERE b.id = v.oldid
         AND b."verificationLevel" = 'L0'
         AND NOT EXISTS (SELECT 1 FROM "Account" a WHERE a."businessId" = b.id)
      RETURNING v.oldid`;
    for (const r of rows) moved.set(r.oldid, null);
  }
  const stepped = moves.filter((r) => moved.has(r.id));
  for (let i = 0; i < stepped.length; i += BATCH) {
    const batch = stepped.slice(i, i + BATCH);
    const rows = await prisma.$queryRaw`
      UPDATE "Business" b SET id = v.newid
        FROM unnest(${batch.map((r) => TMP + r.id)}::text[], ${batch.map((r) => r.data.id)}::text[]) AS v(tmpid, newid)
       WHERE b.id = v.tmpid
      RETURNING v.tmpid, v.newid`;
    for (const r of rows) moved.set(r.tmpid.slice(TMP.length), r.newid);
  }
  for (const r of moves) if (!moved.get(r.id)) r.newId = "";
  for (const [oldId, newId] of moved) if (!newId) moved.delete(oldId);
  fs.writeFileSync(log, toCsv(done, ["id", "action", "newId", "oldName", "newName", "oldLat", "oldLng", "newLat", "newLng"]));
  // The manifest is how the next run (and import-seed.mjs --remove) finds
  // these rows, so it follows the ids too — and forgets the deleted ones.
  // Otherwise a row that moves onto a deleted row's old id would be read,
  // next run, as that deleted row and removed.
  const deleted = new Set(done.filter((r) => r.action.startsWith("delete")).map((r) => r.id));
  if (moved.size || deleted.size) {
    const rewritten = imported
      .filter((r) => !deleted.has(r.id))
      .map((r) => ({ ...r, id: moved.get(r.id) ?? r.id }));
    fs.writeFileSync(manifestPath, toCsv(rewritten, Object.keys(imported[0])));
  }
  console.log(`\nUpdated ${done.filter((r) => r.action === "update").length} (${moved.size} new ids), deleted ${done.filter((r) => r.action.startsWith("delete")).length}. Business rows now: ${await prisma.business.count()}.`);
  console.log(`Log: ${path.relative(REPO_ROOT, log)}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
