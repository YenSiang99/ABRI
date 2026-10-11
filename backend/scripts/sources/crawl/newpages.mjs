// Crawls NEWPAGES company profiles. Needs the site's permission on record in
// permissions.json (see kit.mjs).
//
//   node scripts/sources/crawl/newpages.mjs [fromId] [toId]
//
// SOURCE. newpages.com.my, a Malaysian B2B supplier directory. Profiles live
// at /v2/en/company/<id>/<anything>.html; an id with no company redirects to
// the home page, which we detect without downloading it. robots.txt allows
// company pages (it blocks search and two named companies) and sets no delay.
// Ids run to about 830k; how many are live is unknown until crawled.
//
// Each profile gives name and SSM number (in the page title block), the
// areas it serves, business nature, product classifieds, tags, hours,
// WhatsApp, website and description.

import { commercialFetcher, decode, JsonlStore, log, stateFile, text } from "./kit.mjs";

const SOURCE = "newpages";
const ORIGIN = "https://www.newpages.com.my";
const LAST_ID = 830_000;

const from = Number(process.argv[2] ?? 1);
const to = Number(process.argv[3] ?? LAST_ID);

// The anchor titles listed after "<Label>:" in a selectbox block.
function listAfter(html, label) {
  const block = html.split(`<strong class="color">${label}:</strong>`)[1]?.split("</p>")[0] ?? "";
  return [...block.matchAll(/title="([^"]*)"/g)].map((m) => decode(m[1]));
}

function parse(id, html) {
  const title = decode(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "");
  const ssm = text(html).match(/\b((?:19|20)\d{10})\s*\((\d{1,7}-[A-Z])\)/);
  const hours = [...html.matchAll(/<div class="inside_row">\s*<strong>([^<]+)<\/strong>\s*<em>([\s\S]*?)<\/em>/g)]
    .map((m) => `${text(m[1])}: ${text(m[2])}`);
  const website = html.match(/<a[^>]+href="([^"]+)"[^>]*>(?:(?!<\/a>)[\s\S])*Official Website/)?.[1];
  return {
    id,
    name: title.replace(/\s+in\s+[^:]*::\s*Malaysia NEWPAGES\s*$/, "").trim(),
    ssm: ssm ? `${ssm[1]} (${ssm[2]})` : undefined,
    locations: listAfter(html, "Location"),
    businessNature: listAfter(html, "Business Nature"),
    classifieds: listAfter(html, "Related Classifieds"),
    tags: listAfter(html, "Tags"),
    hours,
    whatsapp: html.match(/wa\.me\/(\d+)/)?.[1],
    website: website && !website.includes("newpages.com.my") ? website : undefined,
    description: decode(html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? ""),
  };
}

const { get } = await commercialFetcher(SOURCE, ORIGIN);
const store = new JsonlStore(SOURCE, "companies.jsonl", (r) => r.id);
const state = stateFile(SOURCE);
let id = Math.max(from, (state.load().lastId ?? 0) + 1);

for (; id <= to; id++) {
  const html = await get(`${ORIGIN}/v2/en/company/${id}/x.html`, { redirect: "manual", missingOk: true });
  if (html) store.add(parse(id, html));
  state.save({ lastId: id });
  if (id % 1000 === 0) log(SOURCE, `id ${id}/${to}: ${store.size} profiles saved`);
}
log(SOURCE, `done: ${store.size} profiles`);
