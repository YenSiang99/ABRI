// Looks up SSM numbers for businesses ABRI already lists, using
// companieshouse.my's free name search. Needs the site's permission on record
// in permissions.json (see kit.mjs).
//
//   node scripts/sources/crawl/companieshouse.mjs [names.csv]
//
// SOURCE. companieshouse.my resells SSM records. Its search matches the start
// of a name and returns name, SSM number and entity type (company or
// sole proprietor/partnership) for free. It cannot be listed in full, and
// trying to would mean millions of searches, so this is a lookup tool: one
// search per name in data/seed/listings.csv (or the CSV given, which needs a
// "name" column).
//
// Every candidate the search returns is kept, with `exact` marking the ones
// whose name matches ours once "Sdn Bhd", punctuation and case are ignored.
// Choosing between several candidates is left to the matching step.

import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../common.mjs";
import { commercialFetcher, JsonlStore, log, text } from "./kit.mjs";

const SOURCE = "companieshouse";
const ORIGIN = "https://companieshouse.my";
const input = process.argv[2] ?? path.join(REPO_ROOT, "data", "seed", "listings.csv");

const SUFFIX = /\b(sdn\.?\s*bhd|sendirian berhad|berhad|bhd|plt|enterprise|ent|trading|co)\b\.?/g;
const core = (s) => s.toLowerCase().replace(/&/g, " and ").replace(SUFFIX, " ").replace(/[^a-z0-9]+/g, " ").trim();

function readNames(file) {
  const [header, ...lines] = fs.readFileSync(file, "utf8").split("\n");
  const cols = header.split(",");
  const at = cols.indexOf("name");
  const names = new Set();
  for (const line of lines) {
    // Tolerates quoted fields; only the name column is needed.
    const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"'));
    const name = cells?.[at]?.trim();
    // Latin-script names only: the SSM register is in Latin script.
    if (name && /[a-z]/i.test(name)) names.add(name);
  }
  return [...names];
}

function parseResults(html) {
  // A result row: the name (shown truncated; the hover tooltip has it in
  // full), the SSM number, and the entity type. The link's slug ends in the
  // old-format number.
  const rows = [];
  for (const tr of html.split(/<tr\b/).slice(1)) {
    const slug = tr.match(/data-company-id="([^"]+)"/)?.[1];
    if (!slug) continue;
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    rows.push({
      name: text(tr.match(/pointer-events-none[^>]*>([^<]+)<\/span>/)?.[1] ?? cells[0]),
      ssm: text(cells[1]),
      oldSsm: slug.match(/-([A-Z]{0,2}\d{5,9}-[A-Z])$/)?.[1],
      type: text(cells[2]),
      slug,
    });
  }
  return rows;
}

const { get } = await commercialFetcher(SOURCE, ORIGIN);
const store = new JsonlStore(SOURCE, "lookups.jsonl", (r) => r.query);
const names = readNames(input).filter((n) => !store.has(n));
log(SOURCE, `${store.size} names looked up, ${names.length} to go`);

let n = 0;
for (const query of names) {
  const html = await get(`${ORIGIN}/search?term=${encodeURIComponent(query)}`);
  const candidates = html ? parseResults(html) : [];
  store.add({ query, candidates: candidates.map((c) => ({ ...c, exact: core(c.name) === core(query) })) });
  if (++n % 500 === 0) log(SOURCE, `${n} looked up, ${names.length - n} to go`);
}
log(SOURCE, `done: ${store.size} names`);
