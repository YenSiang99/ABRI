// Crawls BusinessList.my company profiles. Needs the site's permission on
// record in permissions.json (see kit.mjs).
//
//   node scripts/sources/crawl/businesslist.mjs [fromId] [toId]
//
// SOURCE. businesslist.my, about 284k Malaysian listings. Profiles live at
// /company/<id>/<slug>; /company/<id> alone redirects to the right slug, and
// an id with no listing answers 404, so we walk the id range (1 to ~386k).
//
// RATE. robots.txt asks for 40 seconds between requests: the whole range
// would take about 6 months. A licence that agrees a faster rate (gapMs in
// permissions.json) is what makes this practical; at 1 request a second it
// is about 4.5 days.
//
// Each profile gives name, address, phone, WhatsApp, website, map point,
// hours, year founded, employee band, SSM number ("Registration code"),
// categories and description. The contact person is an individual and must
// never reach a listing.

import { commercialFetcher, decode, JsonlStore, log, stateFile, text } from "./kit.mjs";

const SOURCE = "businesslist";
const ORIGIN = "https://www.businesslist.my";
const LAST_ID = 386_000;

const from = Number(process.argv[2] ?? 1);
const to = Number(process.argv[3] ?? LAST_ID);

function parse(id, html) {
  const ld = (() => {
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      try {
        const j = JSON.parse(m[1]);
        if (j["@type"] === "LocalBusiness") return j;
      } catch { /* malformed block: fall back to the labels */ }
    }
    return {};
  })();
  const info = {};
  for (const m of html.matchAll(/<div class="label">([\s\S]*?)<\/div>([\s\S]*?)<\/div>/g)) {
    const label = text(m[1]);
    if (label && !(label in info)) info[label] = text(m[2]);
  }
  const hours = [...html.matchAll(/<li><small>([^<]+):<\/small>\s*([^<]*)<\/li>/g)].map((m) => `${m[1]}: ${m[2].trim()}`);
  const categories = [...html.matchAll(/<a href="\/category\/[^"]+">([^<]+)<\/a>/g)].map((m) => decode(m[1]));
  const description = text(html.match(/<div class="text desc"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "");
  return {
    id,
    url: ld["@id"],
    name: decode(ld.name ?? ""),
    address: ld.address?.streetAddress,
    locality: ld.address?.addressLocality?.trim(),
    region: ld.address?.addressRegion,
    phone: ld.telephone?.trim(),
    website: ld.url,
    lat: ld.geo?.latitude,
    lng: ld.geo?.longitude,
    ssm: info["Registration code"],
    founded: info["Establishment year"],
    employees: info["Employees"],
    contactPerson: info["Contact Person"],
    whatsapp: html.match(/https:\/\/wa\.me\/(\d+)/)?.[1],
    hours,
    categories: [...new Set(categories)],
    description,
  };
}

const { get } = await commercialFetcher(SOURCE, ORIGIN);
const store = new JsonlStore(SOURCE, "companies.jsonl", (r) => r.id);
const state = stateFile(SOURCE);
let id = Math.max(from, (state.load().lastId ?? 0) + 1);

for (; id <= to; id++) {
  const html = await get(`${ORIGIN}/company/${id}`, { missingOk: true });
  if (html) store.add(parse(id, html));
  state.save({ lastId: id });
  if (id % 1000 === 0) log(SOURCE, `id ${id}/${to}: ${store.size} profiles saved`);
}
log(SOURCE, `done: ${store.size} profiles`);
