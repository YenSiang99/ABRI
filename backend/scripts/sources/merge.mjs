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
  REPO_ROOT, LISTING_COLUMNS, readCsv, toCsv, nameKey, assignIds, writeOutputs,
} from "./common.mjs";
import { nonBusinessReason } from "./nonBusiness.mjs";
import { pickContacts, whatsappFromWebsite } from "./websiteContacts.mjs";

// Lower number wins. Anything not listed (future register scrapers) is
// treated as a register — the most authoritative kind of source.
const PRIORITY = { overture: 2, osm: 3, dbkl: 4 };
const priorityOf = (source) => PRIORITY[source] ?? 1;

// data/seed/sources.csv: one row per (listing, contributing source row).
const SOURCE_COLUMNS = [
  "id", "source", "sourceId", "name", "category", "location", "address", "phone",
  "whatsapp", "email", "website", "ssm", "sourceYear", "sourceType",
];

const FILL = ["website", "address", "openingHours", "domain", "ssm", "description", "services", "phone", "whatsapp", "email"];

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

  // A row with no locality (a register that gives no address, like MDEC's)
  // has nothing to match on but its name. It joins the one located listing
  // with the same name when there is exactly one, and stands alone otherwise:
  // two "Ace Trading"s in two towns are no reason to pick either.
  const byName = new Map();
  for (const [key, rows] of groups) {
    if (!rows[0].location) continue;
    const name = key.slice(0, key.lastIndexOf("|"));
    byName.set(name, byName.has(name) ? null : key);
  }
  for (const [key, rows] of [...groups]) {
    if (rows[0].location) continue;
    const target = byName.get(key.slice(0, key.lastIndexOf("|")));
    if (!target) continue;
    groups.get(target).push(...rows.map((r) => ({ ...r, location: groups.get(target)[0].location })));
    groups.get(target).sort((a, b) => priorityOf(a._source) - priorityOf(b._source));
    groups.delete(key);
  }

  const merged = [];
  for (const rows of groups.values()) {
    // Already sorted by source priority, because sources were read in order.
    const [best, ...rest] = rows;
    const row = { ...best };
    for (const other of rest) {
      for (const f of FILL) if (!row[f] && other[f]) row[f] = other[f];
      // A point is a pair: take both from one source or neither.
      if (!row.lat && other.lat && other.lng) { row.lat = other.lat; row.lng = other.lng; }
    }
    const distinct = [...new Set(rows.map((r) => r._source))];
    row.alsoIn = distinct.slice(1).join("+");
    row.confirmed = distinct.length >= 2 ? "yes" : "";
    row.primarySource = best._source;
    // Every source row behind this listing, for SourceRecord (see
    // scripts/sync-source-records.mjs): written to data/seed/sources.csv once
    // ids are assigned.
    row._contributors = rows.map((r) => ({ ...r, source: r._source }));
    delete row._source;
    delete row.id;
    merged.push(row);
  }

  // Not businesses — see nonBusiness.mjs. Recorded, not silently dropped.
  const removed = [];
  const businesses = merged.filter((row) => {
    const reason = nonBusinessReason(row);
    if (reason) removed.push({ reason, name: row.name, category: row.category, location: row.location, address: row.address, website: row.website, sourceType: row.sourceType, sourceId: row.sourceId });
    return !reason;
  });

  const stats = { sources: perSource, duplicate: 0, nonBusiness: {} };
  stats.fromWebsites = fillFromWebsites(businesses, sourcesDir);
  for (const r of removed) stats.nonBusiness[r.reason] = (stats.nonBusiness[r.reason] || 0) + 1;
  const listings = assignIds(businesses, stats);
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
  const contributors = [];
  for (const r of listings) {
    for (const c of r._contributors) contributors.push({ ...c, id: r.id });
    delete r._contributors;
  }
  writeOutputs(dir, listings, [], stats);
  fs.writeFileSync(path.join(dir, "sources.csv"), toCsv(contributors, SOURCE_COLUMNS));
  fs.writeFileSync(path.join(dir, "nonbusiness.csv"), toCsv(removed, ["reason", "name", "category", "location", "address", "website", "sourceType", "sourceId"]));
}

// Phone, WhatsApp and email read off the listing's own website by
// crawl/websites.mjs, into fields no source filled. Only for a website that
// belongs to one listing: a site two listings share could be either's. The
// site becomes a contributor ("website", keyed on its URL), so SourceRecord
// shows where the contact came from. A website that is only a WhatsApp link
// gives the WhatsApp number without a crawl.
function fillFromWebsites(rows, sourcesDir) {
  const counts = { phone: 0, whatsapp: 0, email: 0, listings: 0 };
  const file = path.join(sourcesDir, "websites", "raw", "sites.jsonl");
  const crawled = new Map();
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) if (line) { const r = JSON.parse(line); crawled.set(r.url, r); }
  }
  const uses = new Map();
  for (const r of rows) if (r.website) uses.set(r.website, (uses.get(r.website) ?? 0) + 1);
  for (const row of rows) {
    if (!row.website || uses.get(row.website) !== 1) continue;
    const found = crawled.has(row.website)
      ? pickContacts(crawled.get(row.website))
      : { phone: "", email: "", whatsapp: whatsappFromWebsite(row.website) };
    const filled = {};
    for (const f of ["phone", "whatsapp", "email"]) {
      if (!row[f] && found[f]) { row[f] = filled[f] = found[f]; counts[f]++; }
    }
    if (!Object.keys(filled).length) continue;
    counts.listings++;
    row._contributors.push({
      source: "website", sourceId: row.website, name: row.name, category: row.category,
      location: row.location, address: "", website: row.website, ssm: "", sourceYear: "", sourceType: "website",
      phone: found.phone, whatsapp: found.whatsapp, email: found.email,
    });
  }
  return counts;
}

main();
