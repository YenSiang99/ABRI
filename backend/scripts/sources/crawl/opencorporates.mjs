// Pulls Malaysian companies from OpenCorporates' official API.
//
//   OPENCORPORATES_API_TOKEN=… node scripts/sources/crawl/opencorporates.mjs [fromYear] [toYear]
//
// SOURCE. api.opencorporates.com, about 1.28M Malaysian companies (name, SSM
// number, status, type, incorporation date, registered address). Their data
// is under the Open Database Licence: attribution, and share-alike for a
// database built from it. Needs a token; the free tier allows 50 requests a
// day, so a full pull needs a paid or public-benefit plan.
//
// HOW. A search returns at most 100 pages of 100. So we search one month of
// incorporation dates at a time (SSM registers a few thousand companies a
// month), and split a month in half if it still has more than 10,000.

import { JsonlStore, log, politeFetcher, stateFile } from "./kit.mjs";

const SOURCE = "opencorporates";
const TOKEN = process.env.OPENCORPORATES_API_TOKEN;
if (!TOKEN) {
  console.error("Set OPENCORPORATES_API_TOKEN (from opencorporates.com/api_accounts).");
  process.exit(1);
}
const fromYear = Number(process.argv[2] ?? 1900);
const toYear = Number(process.argv[3] ?? new Date().getFullYear());
const MAX = 100 * 100;

const get = politeFetcher({ gapMs: Number(process.env.OPENCORPORATES_GAP_MS ?? 1000) });
const store = new JsonlStore(SOURCE, "companies.jsonl", (r) => r.company_number);
const state = stateFile(SOURCE);
const done = state.load();

const iso = (d) => d.toISOString().slice(0, 10);

async function search(from, to, page) {
  const url = new URL("https://api.opencorporates.com/v0.4/companies/search");
  url.search = new URLSearchParams({
    q: "*", jurisdiction_code: "my", incorporation_date: `${from}:${to}`,
    per_page: "100", page: String(page), api_token: TOKEN,
  });
  return JSON.parse(await get(url.toString())).results;
}

async function window(from, to) {
  const key = `${from}:${to}`;
  if (done[key]) return;
  const first = await search(from, to, 1);
  if (first.total_count > MAX && from !== to) {
    const a = new Date(from), b = new Date(to);
    const mid = new Date((a.getTime() + b.getTime()) / 2);
    await window(from, iso(mid));
    await window(iso(new Date(mid.getTime() + 86_400_000)), to);
    return;
  }
  for (let page = 1; page <= Math.min(first.total_pages, 100); page++) {
    const res = page === 1 ? first : await search(from, to, page);
    for (const { company } of res.companies) store.add(company);
  }
  done[key] = first.total_count;
  state.save(done);
  log(SOURCE, `${key}: ${first.total_count} companies, ${store.size} saved`);
}

for (let y = fromYear; y <= toYear; y++) {
  for (let m = 0; m < 12; m++) {
    const start = new Date(Date.UTC(y, m, 1));
    const end = new Date(Date.UTC(y, m + 1, 0));
    if (start > new Date()) break;
    await window(iso(start), iso(end));
  }
}
log(SOURCE, `done: ${store.size} companies`);
