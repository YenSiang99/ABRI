// Fills fields that import-seed.mjs could not, on listings it already put in:
// it is insert-only, so a rule change never reaches a row that is already in.
//
//   node scripts/sync-seed-fields.mjs            # dry run: counts only
//   node scripts/sync-seed-fields.mjs --apply
//
// TWO THINGS, both from the rebuilt data/seed/listings.csv:
//   - CONTACTS: phone, whatsapp and email, written since 3 Oct 2026 when a
//     source has them. Only into a column that is still empty.
//   - LOCALITY: rows filed under Klang whose postcode is Banting's (427xx) or
//     Puncak Alam's (423xx), after the postcode table learned those towns.
//     Rows in Telok Panglima Garang, Jenjarom or Tanjong Sepat (425xx, 426xx,
//     428xx) are now outside the vocab; they are counted, never deleted here.
//
// Rows are matched on id. Only untouched rows are written — L0, no account —
// the same rule as import-seed.mjs --remove: a listing somebody has claimed
// keeps whatever its owner gave it.
//
// Every applied change is recorded in data/seed/imports/<db>-fields-<stamp>.csv
// (id, field, old, new).
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
const BATCH = 1000;
const CONTACTS = ["phone", "whatsapp", "email"];
const NEW_LOCALITY = { 427: "Banting", 423: "Puncak Alam" };
const NOW_OUTSIDE = new Set([425, 426, 428]);

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

const postcodeBlock = (address) => {
  const pc = [...String(address ?? "").matchAll(/\b(4[12]\d{3})\b/g)].pop()?.[1];
  return pc ? Math.floor(Number(pc) / 100) : null;
};

async function main() {
  const label = target(process.env.DATABASE_URL);
  const local = label === localEnvLabel();
  console.log(`Target: ${label}${local ? " (backend/.env)" : ""}${APPLY ? "" : "  (dry run)"}`);
  if (APPLY && !local && process.env.ABRI_IMPORT_CONFIRM !== label) {
    console.error(`Refusing to write to a database other than backend/.env's. Set ABRI_IMPORT_CONFIRM=${label} to confirm.`);
    process.exit(1);
  }

  const seed = new Map(readCsv(SEED).map((r) => [r.id, r]));
  const rows = await prisma.business.findMany({
    where: { verificationLevel: "L0", accounts: { none: {} } },
    select: { id: true, location: true, address: true, phone: true, whatsapp: true, email: true },
  });

  const changes = [];
  const stats = { untouched: rows.length, inSeed: 0, phone: 0, whatsapp: 0, email: 0, locality: 0, nowOutsideVocab: 0 };
  for (const b of rows) {
    const s = seed.get(b.id);
    const block = postcodeBlock(b.address);
    if (b.location === "Klang" && NOW_OUTSIDE.has(block)) stats.nowOutsideVocab++;
    if (!s) continue;
    stats.inSeed++;
    const data = {};
    for (const f of CONTACTS) {
      if (!b[f] && s[f]) { data[f] = s[f]; stats[f]++; changes.push({ id: b.id, field: f, old: "", new: s[f] }); }
    }
    if (b.location === "Klang" && NEW_LOCALITY[block] && s.location === NEW_LOCALITY[block]) {
      data.location = s.location;
      stats.locality++;
      changes.push({ id: b.id, field: "location", old: b.location, new: s.location });
    }
    if (Object.keys(data).length) b._data = data;
  }
  console.log(stats);
  if (!APPLY) {
    console.log("Dry run — nothing written. Re-run with --apply to write.");
    return;
  }

  const todo = rows.filter((b) => b._data);
  let done = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    await prisma.$transaction(todo.slice(i, i + BATCH).map((b) =>
      prisma.business.updateMany({
        where: { id: b.id, verificationLevel: "L0", accounts: { none: {} } },
        data: b._data,
      })));
    done += Math.min(BATCH, todo.length - i);
    process.stdout.write(`  updated ${done}/${todo.length}`);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const log = path.join(REPO_ROOT, "data", "seed", "imports", `${label.replace(/[:/]/g, "-")}-fields-${stamp}.csv`);
  fs.writeFileSync(log, toCsv(changes, ["id", "field", "old", "new"]));
  console.log(`\nDone. Change log: ${path.relative(REPO_ROOT, log)}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
