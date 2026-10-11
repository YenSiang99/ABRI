// Crawls the Ministry of Finance's published results of federal tenders and
// quotations: who won what, from which agency, for how much.
//
//   node scripts/sources/crawl/myprocurement.mjs          # list, then details
//   node scripts/sources/crawl/myprocurement.mjs list
//   node scripts/sources/crawl/myprocurement.mjs details
//
// SOURCE. myprocurement.treasury.gov.my, public; robots.txt allows everything.
// About 158k awards across four lists (current and archived, tenders and
// quotations).
//
// TWO PASSES:
// 1. List: /procurements/fetch, 100 awards a request. Gives title, number,
//    ministry, agency, category, dates, and each winner's name and price.
// 2. Details: the award page adds each winner's address and SSM/ROB/ROS
//    number. A company that wins 50 contracts only needs looking up once, so
//    we fetch an award only while it has a winner we have not resolved yet.

import { JsonlStore, log, politeFetcher, stateFile, text } from "./kit.mjs";

const SOURCE = "myprocurement";
const BASE = "https://myprocurement.treasury.gov.my";
const LISTS = [
  { type: "results", category: "tender" },
  { type: "results", category: "quotation" },
  { type: "archive", category: "results-tender" },
  { type: "archive", category: "results-quotation" },
];
const PER_PAGE = 100;

const phase = process.argv[2] ?? "all";
const get = politeFetcher({ gapMs: 1000 });
const awards = new JsonlStore(SOURCE, "awards.jsonl", (r) => r.url);
const details = new JsonlStore(SOURCE, "details.jsonl", (r) => r.url);
const state = stateFile(SOURCE);

const norm = (name) => text(name).toUpperCase().replace(/\s+/g, " ").trim();

// "<label>: value" pairs in a list item.
function field(block, label) {
  const m = block.match(new RegExp(`${label}:</div>\\s*<div[^>]*>([\\s\\S]*?)</div>`));
  return m ? text(m[1]) : "";
}

function parseListItem(block) {
  const link = block.match(/<a href="(https:\/\/myprocurement\.treasury\.gov\.my\/[^"]+\/[0-9a-f]{32})">([\s\S]*?)<\/a>/);
  if (!link) return null;
  const table = block.match(/<table[\s\S]*?<\/table>/)?.[0] ?? "";
  const winners = [...table.matchAll(/<tr>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/g)]
    .map((m) => ({ name: text(m[2]), price: text(m[3]) }));
  return {
    url: link[1],
    title: text(link[2]),
    number: text(block.match(/<span class="font-bold">(No\. [^<]+)<\/span>:\s*([^<]*)/)?.[2] ?? ""),
    displayed: text(block.match(/Tarikh Paparan Keputusan:\s*([^<]*)/)?.[1] ?? ""),
    ministry: field(block, "Kementerian"),
    agency: field(block, "Agensi"),
    category: field(block, "Kategori Perolehan"),
    decided: field(block, "Tarikh Keputusan"),
    winners,
  };
}

async function crawlList() {
  const s = state.load();
  for (const { type, category } of LISTS) {
    const key = `${type}/${category}`;
    let page = (s[key]?.page ?? 0) + 1;
    let lastPage = s[key]?.lastPage ?? Infinity;
    while (page <= lastPage) {
      const url = `${BASE}/procurements/fetch?type=${type}&category=${category}&itemsPerPage=${PER_PAGE}&page=${page}`;
      const body = JSON.parse(await get(url, { headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" } }));
      lastPage = body.lastPage ?? lastPage;
      const blocks = body.html.split(/x-data="\{ selected: false/).slice(1);
      let n = 0;
      for (const b of blocks) {
        const rec = parseListItem(b);
        if (rec) awards.add({ list: key, ...rec }) && n++;
      }
      if (!blocks.length) break;
      s[key] = { page, lastPage };
      state.save({ ...state.load(), ...s });
      if (page % 25 === 0 || page === lastPage) log(SOURCE, `${key} page ${page}/${lastPage}: ${awards.size} awards saved`);
      page++;
    }
  }
}

function parseDetails(url, html) {
  const pairs = (fragment) => {
    const out = {};
    for (const m of fragment.matchAll(/<h3 class="font-bold">([^<]+)<\/h3>\s*([\s\S]*?)<\/div>/g)) {
      const label = text(m[1]).replace(/:$/, "");
      if (!(label in out)) out[label] = text(m[2]);
    }
    return out;
  };
  const parts = html.split(/x-data="\{ active: true \}"/);
  return {
    url,
    award: pairs(parts[0]),
    winners: parts.slice(1).map((p) => pairs(p.split(/<div\s+x-data=/)[0])),
  };
}

async function crawlDetails() {
  const resolved = new Set();
  for (const d of details.records()) for (const w of d.winners) resolved.add(norm(w["Nama Petender Berjaya"] ?? ""));
  // Two streaming passes over awards.jsonl rather than loading all 158k
  // awards: the crawl server has a 250 MB cap.
  const pending = new Set();
  for (const a of awards.records()) {
    for (const w of a.winners) {
      const name = norm(w.name);
      if (name && !resolved.has(name)) pending.add(name);
    }
  }
  log(SOURCE, `details: ${resolved.size} winners resolved, ${pending.size} to go`);
  let n = 0;
  for (const a of awards.records()) {
    if (!a.winners.some((w) => pending.has(norm(w.name))) || details.has(a.url)) continue;
    const d = parseDetails(a.url, await get(a.url));
    details.add(d);
    for (const w of [...d.winners.map((x) => x["Nama Petender Berjaya"]), ...a.winners.map((x) => x.name)]) {
      pending.delete(norm(w ?? ""));
    }
    if (++n % 500 === 0) log(SOURCE, `details: ${n} fetched, ${pending.size} winners to go`);
  }
  log(SOURCE, `details done: ${details.size} award pages, ${pending.size} winners unresolved`);
}

if (phase === "all" || phase === "list") await crawlList();
if (phase === "all" || phase === "details") await crawlDetails();
