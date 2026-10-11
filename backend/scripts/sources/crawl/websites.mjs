// Reads phone, WhatsApp and email off each listing's own website, for
// listings that have a website and are missing a phone or an email.
//
//   node scripts/sources/crawl/websites.mjs              # every site
//   node scripts/sources/crawl/websites.mjs --limit 50   # a sample
//
// Input: data/seed/listings.csv (run merge.mjs first). Output:
// data/sources/websites/raw/sites.jsonl, one record per website with every
// candidate found. merge.mjs picks from it (websiteContacts.mjs pickContacts)
// and fills only fields that are still empty.
//
// This is the business's own site saying how to reach it, read the way a
// search engine would. Per site:
//   - robots.txt first; nothing it disallows is fetched, and its Crawl-delay
//     is kept (sites asking for more than 10s are skipped)
//   - the listed page, then at most two contact/about pages it links to on
//     the same domain; one request at a time to a site, a second apart
//   - a 401/403, a challenge page or a CAPTCHA ends that site: recorded as
//     "refused", never worked around (so is Cloudflare's email obfuscation)
//   - a site that redirects to another domain is recorded as "moved" and
//     nothing is taken: parked and expired domains do that
// Many sites are crawled side by side (CONCURRENCY), never one site twice
// at once.
//
// Skipped without a request: chain websites shared by three or more listings
// (the head office's number is not the outlet's), and social/marketplace
// pages, which are not the business's own site.
//
// Resumable: a rerun skips every website already in sites.jsonl.

import path from "node:path";
import { REPO_ROOT, readCsv, outDir } from "../common.mjs";
import { JsonlStore, UA, log, parseRobots, sleep } from "./kit.mjs";
import { extract, siteDomain } from "../websiteContacts.mjs";

const SOURCE = "websites";
const CONCURRENCY = 32;
const GAP_MS = 1000;
const MAX_CRAWL_DELAY_MS = 10_000;
const TIMEOUT_MS = 15_000;
const MAX_BYTES = 1_500_000;
const MAX_EXTRA_PAGES = 2;
const CHAIN_MIN = 3;

const NOT_OWN_SITE = /(^|\.)(facebook|fb|instagram|linktr|linkedin|twitter|x|tiktok|youtube|youtu|shopee|lazada|wa|whatsapp|wasap|watsap|wsap|google|goo|g|foodpanda|grab|tripadvisor|booking|agoda|airbnb|mudah|carousell|carlist|beacons|bit|tinyurl|business)\.(com|me|ee|my|be|co|gl|ly|ai|link|site|com\.my)$/i;
const CONTACT_LINK = /contact|hubungi|reach|find-?us|location|enquir|inquir|about|tentang/i;
const CHALLENGE = /<title>\s*(Just a moment|Attention Required|Access denied)|challenges\.cloudflare\.com|g-recaptcha|hcaptcha\.com|cf-browser-verification/i;

const args = process.argv.slice(2);
const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity;

outDir(SOURCE);
const store = new JsonlStore(SOURCE, "sites.jsonl", (r) => r.url);

// ── Which websites ──────────────────────────────────────────────────────────
const listings = readCsv(path.join(REPO_ROOT, "data", "seed", "listings.csv"));
const uses = new Map();
for (const r of listings) if (r.website) uses.set(r.website, (uses.get(r.website) ?? 0) + 1);
const wanted = new Set();
let chains = 0, social = 0;
for (const r of listings) {
  if (!r.website || (r.phone && r.email)) continue;
  if (uses.get(r.website) >= CHAIN_MIN) { chains++; continue; }
  let host;
  try { host = new URL(r.website).hostname; } catch { continue; }
  if (NOT_OWN_SITE.test(host.replace(/^www\./, ""))) { social++; continue; }
  wanted.add(r.website);
}
const queue = [...wanted].filter((u) => !store.has(u)).slice(0, limit);
log(SOURCE, `${wanted.size} websites wanted (${chains} chain-site listings and ${social} social-page listings skipped); ${store.size} done, ${queue.length} to go`);

// ── Fetching ────────────────────────────────────────────────────────────────
class Refused extends Error {}

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 401 || res.status === 403 || res.status === 429) throw new Refused(`${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || (type && !/html|text\/plain/i.test(type))) {
    res.body?.cancel().catch(() => {});
    return { status: res.status, finalUrl: res.url, html: "" };
  }
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
    if (size > MAX_BYTES) { reader.cancel().catch(() => {}); break; }
  }
  const html = Buffer.concat(chunks).toString("utf8");
  if (CHALLENGE.test(html)) throw new Refused("challenge page");
  return { status: res.status, finalUrl: res.url, html };
}

async function fetchRobots(origin) {
  try {
    const res = await fetch(`${origin}/robots.txt`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status === 401 || res.status === 403) return null; // the whole site says no
    return parseRobots(res.ok ? await res.text() : "");
  } catch {
    return parseRobots(""); // no robots.txt reachable: the page fetch will tell
  }
}

function contactLinks(html, base, domain) {
  const out = [];
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    const [, href, label] = m;
    if (!CONTACT_LINK.test(href) && !CONTACT_LINK.test(label.replace(/<[^>]+>/g, ""))) continue;
    let u;
    try { u = new URL(href, base); } catch { continue; }
    if (!/^https?:$/.test(u.protocol) || siteDomain(u.hostname) !== domain) continue;
    u.hash = "";
    if (!out.includes(u.href) && u.href !== base) out.push(u.href);
  }
  // Contact pages first, then about pages.
  return out.sort((a, b) => Number(/about|tentang/i.test(a)) - Number(/about|tentang/i.test(b)));
}

async function crawlSite(url) {
  const rec = { url, finalUrl: "", status: "", pages: [], emails: [], phones: [], whatsapp: [], at: new Date().toISOString() };
  const merge = (found, page) => {
    for (const k of ["emails", "phones", "whatsapp"]) {
      for (const c of found[k]) if (!rec[k].some((x) => x.value === c.value)) rec[k].push({ ...c, page });
    }
  };
  let start;
  try { start = new URL(url); } catch { return { ...rec, status: "bad-url" }; }
  const domain = siteDomain(start.hostname);
  try {
    const rules = await fetchRobots(start.origin);
    if (!rules) return { ...rec, status: "refused", note: "robots.txt 401/403" };
    if ((rules.crawlDelayMs ?? 0) > MAX_CRAWL_DELAY_MS) return { ...rec, status: "skipped", note: `crawl-delay ${rules.crawlDelayMs / 1000}s` };
    const gap = Math.max(GAP_MS, rules.crawlDelayMs ?? 0);
    if (!rules.allowed(start.pathname + start.search)) return { ...rec, status: "disallowed" };

    let page;
    try {
      page = await fetchPage(url);
    } catch (err) {
      // An https site with a broken certificate often answers on http.
      if (err instanceof Refused || start.protocol !== "https:") throw err;
      await sleep(gap);
      page = await fetchPage(url.replace(/^https:/, "http:"));
    }
    rec.finalUrl = page.finalUrl;
    if (siteDomain(page.finalUrl) !== domain) return { ...rec, status: "moved", note: page.finalUrl };
    if (!page.html) return { ...rec, status: `http-${page.status}` };
    rec.pages.push(page.finalUrl);
    merge(extract(page.html), page.finalUrl);

    for (const link of contactLinks(page.html, page.finalUrl, domain).slice(0, MAX_EXTRA_PAGES)) {
      const u = new URL(link);
      if (!rules.allowed(u.pathname + u.search)) continue;
      await sleep(gap);
      try {
        const extra = await fetchPage(link);
        if (!extra.html || siteDomain(extra.finalUrl) !== domain) continue;
        rec.pages.push(extra.finalUrl);
        merge(extract(extra.html), extra.finalUrl);
      } catch (err) {
        if (err instanceof Refused) break;
      }
    }
    return { ...rec, status: "ok" };
  } catch (err) {
    if (err instanceof Refused) return { ...rec, status: "refused", note: err.message };
    return { ...rec, status: "error", note: String(err.cause?.code ?? err.name ?? err.message).slice(0, 80) };
  }
}

// ── Run ─────────────────────────────────────────────────────────────────────
// Sites that share a host (two listings on one domain) go to the same worker
// in turn, so no host ever gets two requests at once.
const byHost = new Map();
for (const u of queue) {
  let host;
  try { host = new URL(u).hostname; } catch { host = u; }
  if (!byHost.has(host)) byHost.set(host, []);
  byHost.get(host).push(u);
}
const hosts = [...byHost.values()];
let next = 0, done = 0;
const tally = {};
async function worker() {
  while (next < hosts.length) {
    const urls = hosts[next++];
    for (const u of urls) {
      const rec = await crawlSite(u);
      store.add(rec);
      tally[rec.status] = (tally[rec.status] ?? 0) + 1;
      if (++done % 250 === 0) log(SOURCE, `${done}/${queue.length} ${JSON.stringify(tally)}`);
      if (urls.length > 1) await sleep(GAP_MS);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
log(SOURCE, `done: ${done} sites this run, ${store.size} in total ${JSON.stringify(tally)}`);
