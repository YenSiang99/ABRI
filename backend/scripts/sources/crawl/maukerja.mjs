// Crawls Maukerja's employer profiles. Needs AJobThing's permission on record
// in permissions.json (see kit.mjs) AND their Cloudflare allowlisting our
// crawler: as of 3 Oct 2026 every page, sitemaps included, answers a
// non-browser with a challenge, and this crawler stops at a challenge rather
// than working around it.
//
//   node scripts/sources/crawl/maukerja.mjs
//
// SOURCE. maukerja.my/company/<slug>, about 90,000 employers listed in the
// mk_company<n>.xml sitemaps. Ricebowl (ricebowl.my) is the same company's
// site over the same employer database, so crawling one covers both.
//
// Each profile gives the SSM number (under "Business Information"), a
// Verified badge, employee band, industry and address.
//
// THE PARSER IS UNCONFIRMED: it was written from the page as seen in a browser,
// not from HTML this crawler fetched. The first 20 pages are saved whole to
// raw/samples/ so it can be checked on the first permitted run.

import fs from "node:fs";
import path from "node:path";
import { outDir } from "../common.mjs";
import { commercialFetcher, decode, JsonlStore, log, saveRaw, text } from "./kit.mjs";

const SOURCE = "maukerja";
const ORIGIN = "https://www.maukerja.my";

function parse(url, html) {
  const t = text(html, { keepLines: true });
  const next = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  const title = decode(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? html.match(/<meta property="og:title" content="([^"]*)"/)?.[1] ?? "");
  // "201701041284" or "1234567-A", the first one after an SSM label that isn't
  // AJobThing's own (its footer carries "SSM (1036935K)").
  const ssmBlock = t.split(/Business Information/i)[1] ?? t;
  const ssm = ssmBlock.match(/SSM[^\n]{0,30}\n?\s*((?:19|20)\d{10}|\d{5,7}-?[A-Z])\b/i)?.[1];
  const sizeLine = t.match(/([\d,]+\s*-\s*[\d,]+|[\d,]+\+?)\s*Employees\s*·\s*([^\n]+)/i);
  return {
    url,
    slug: url.split("/").pop(),
    name: text(title).replace(/\s*-\s*Cari Kerja.*$/i, "").replace(/^Profil Syarikat\s*/i, ""),
    ssm,
    verified: /\bVerified\b/.test(t.split("\n").slice(0, 40).join("\n")),
    employees: sizeLine?.[1],
    industry: sizeLine?.[2]?.trim(),
    address: (t.split(/Alamat Syarikat|Company Address/i)[2] ?? "").split("\n").slice(0, 4).join(", ").trim() || undefined,
    nextData: Boolean(next),
  };
}

const { get } = await commercialFetcher(SOURCE, ORIGIN);
const store = new JsonlStore(SOURCE, "companies.jsonl", (r) => r.url);
const samples = path.join(outDir(SOURCE), "raw", "samples");
fs.mkdirSync(samples, { recursive: true });

const index = await get(`${ORIGIN}/mk_company.xml`);
const sitemaps = [...(index ?? "").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
log(SOURCE, `${sitemaps.length} company sitemaps`);

let n = 0;
for (const sm of sitemaps) {
  const xml = await get(sm);
  for (const url of [...(xml ?? "").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])) {
    if (store.has(url)) continue;
    const html = await get(url, { missingOk: true });
    if (!html) continue;
    if (n < 20) saveRaw(SOURCE, `samples/${url.split("/").pop()}.html`, html);
    store.add(parse(url, html));
    if (++n % 500 === 0) log(SOURCE, `${n} fetched this run, ${store.size} saved`);
  }
}
log(SOURCE, `done: ${store.size} employers`);
