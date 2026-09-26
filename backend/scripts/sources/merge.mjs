// Combines every source's listings.csv into one seed file.
//
//   node scripts/sources/merge.mjs
//
// Reads data/sources/<source>/listings.csv for every source that has one,
// writes data/seed/listings.csv + stats.json.
//
// THE SAME BUSINESS APPEARS IN SEVERAL SOURCES, and a directory that lists
// it twice looks broken. Rows are matched on normalised name + locality
// (nameKey in common.mjs strips Sdn Bhd, Enterprise, PLT and punctuation).
// Within a match:
//   - the highest-priority source supplies the name and category: a
//     register's record of a firm beats a map's, and a map's trading name
//     beats DBKL's legal name
//   - empty fields (website, address, openingHours) are filled from the rest
//   - `alsoIn` lists the other sources, and `confirmed` is "yes" when two or
//     more independent sources agree the business exists — which matters most
//     for the 2019 DBKL rows, some of whose businesses have since closed
//
// Matching is deliberately exact on the normalised key. Fuzzy matching would
// merge "Lim & Co" into "Lim & Co Properties", and a wrong merge is worse
// than a missed one: a duplicate can be cleaned up later, two different
// businesses glued together cannot be seen at all.

import fs from "node:fs";
import path from "node:path";
import {
  REPO_ROOT, LISTING_COLUMNS, readCsv, nameKey, assignIds, writeOutputs,
} from "./common.mjs";

// Lower number wins. Anything not listed (future register scrapers) is
// treated as a register — the most authoritative kind of source.
const PRIORITY = { overture: 2, osm: 3, dbkl: 4 };
const priorityOf = (source) => PRIORITY[source] ?? 1;

const FILL = ["website", "address", "openingHours", "domain", "ssm", "description", "services"];

function main() {
  const sourcesDir = path.join(REPO_ROOT, "data", "sources");
  const sources = fs.readdirSync(sourcesDir)
    .filter((s) => fs.existsSync(path.join(sourcesDir, s, "listings.csv")))
    .sort((a, b) => priorityOf(a) - priorityOf(b));

  const groups = new Map();
  const perSource = {};
  for (const source of sources) {
    const rows = readCsv(path.join(sourcesDir, source, "listings.csv"));
    perSource[source] = rows.length;
    for (const row of rows) {
      const key = `${nameKey(row.name)}|${row.location}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ ...row, _source: source });
    }
  }

  const merged = [];
  for (const rows of groups.values()) {
    // Already sorted by source priority, because sources were read in order.
    const [best, ...rest] = rows;
    const row = { ...best };
    for (const other of rest) {
      for (const f of FILL) if (!row[f] && other[f]) row[f] = other[f];
    }
    const distinct = [...new Set(rows.map((r) => r._source))];
    row.alsoIn = distinct.slice(1).join("+");
    row.confirmed = distinct.length >= 2 ? "yes" : "";
    row.primarySource = best._source;
    delete row._source;
    delete row.id;
    merged.push(row);
  }

  const stats = { sources: perSource, duplicate: 0 };
  const listings = assignIds(merged, stats);
  const dir = path.join(REPO_ROOT, "data", "seed");
  fs.mkdirSync(dir, { recursive: true });

  stats.confirmed = listings.filter((r) => r.confirmed).length;
  stats.bySourceCategory = {};
  for (const r of listings) {
    const c = (stats.bySourceCategory[r.category] ||= { total: 0, confirmed: 0 });
    c.total++;
    c[r.primarySource] = (c[r.primarySource] || 0) + 1;
    if (r.confirmed) c.confirmed++;
  }
  stats.dbklOnly = listings.filter((r) => r.primarySource === "dbkl" && !r.confirmed).length;

  // writeOutputs writes the standard columns; merged rows carry three more.
  const columns = [...LISTING_COLUMNS, "primarySource", "alsoIn", "confirmed"];
  LISTING_COLUMNS.splice(0, LISTING_COLUMNS.length, ...columns);
  writeOutputs(dir, listings, [], stats);
}

main();
