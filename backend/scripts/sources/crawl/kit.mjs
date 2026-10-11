// Shared by the government-register crawlers in this folder. Each crawler
// saves what a register publishes, as-is, to data/sources/<source>/raw/*.jsonl
// (data/ is gitignored). Turning raw records into listings is a separate step
// that follows the rules in ../common.mjs — raw files keep phones and emails,
// listings never do.
//
// THE RULES EVERY CRAWLER FOLLOWS (see ABRI-ssm-data-sites.md):
//   - government registers freely; commercial sites only with the owner's
//     permission on record (requirePermission below)
//   - only where robots.txt allows the path, at its Crawl-delay if it sets one
//   - one request at a time, with a pause between requests
//   - never work around a challenge page, CAPTCHA or login; a 401/403 stops
//     the crawl instead of retrying
//   - resumable: rerunning skips whatever is already saved

import fs from "node:fs";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { outDir } from "../common.mjs";

export const UA = "Mozilla/5.0 (compatible; ABRIbot/0.1; Malaysian business directory)";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function log(source, msg) {
  console.log(`${new Date().toISOString().slice(0, 19)} [${source}] ${msg}`);
}

// A fetch that never runs faster than one request per `gapMs`, backs off on
// 429/5xx/network errors, and stops for good on 401/403.
export function politeFetcher({ gapMs = 1000, retries = 6 } = {}) {
  let last = 0;
  return async function get(url, opts = {}) {
    for (let attempt = 0; ; attempt++) {
      const wait = last + gapMs - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
      let res;
      try {
        const { missingOk, ...fetchOpts } = opts;
        res = await fetch(url, {
          ...fetchOpts,
          headers: { "User-Agent": UA, ...(opts.headers ?? {}) },
          signal: AbortSignal.timeout(180_000),
        });
      } catch (err) {
        if (attempt >= retries) throw err;
        await sleep(backoff(attempt));
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error(`${res.status} from ${url}: the site is refusing us, so the crawl stops here`);
      }
      if (res.status === 429 || res.status >= 500) {
        if (attempt >= retries) throw new Error(`${res.status} from ${url} after ${retries} retries`);
        await sleep(backoff(attempt));
        continue;
      }
      // Crawlers that walk an id range expect gaps: with `missingOk`, a 404
      // or (under redirect: "manual") a redirect means "no record here".
      if (opts.missingOk && (res.status === 404 || (res.status >= 300 && res.status < 400))) return null;
      if (!res.ok) throw new Error(`${res.status} from ${url}`);
      const body = await res.text();
      if (/<title>Just a moment\.\.\.<\/title>|challenges\.cloudflare\.com/.test(body)) {
        throw new Error(`challenge page from ${url}: not working around it, so the crawl stops here`);
      }
      return body;
    }
  };
}

const backoff = (n) => Math.min(10 * 60_000, 5_000 * 2 ** n);

// Append-only JSONL keyed by `keyOf`. Loading it back gives resumability.
export class JsonlStore {
  constructor(source, file, keyOf) {
    this.path = path.join(outDir(source), "raw", file);
    this.keyOf = keyOf;
    this.keys = new Set();
    for (const rec of this.records()) this.keys.add(keyOf(rec));
  }
  has(key) {
    return this.keys.has(key);
  }
  add(rec) {
    const key = this.keyOf(rec);
    if (this.keys.has(key)) return false;
    this.keys.add(key);
    fs.appendFileSync(this.path, JSON.stringify(rec) + "\n");
    return true;
  }
  // Streams the file a megabyte at a time: the crawl server has little
  // memory, and some of these files run to hundreds of megabytes.
  *records() {
    if (!fs.existsSync(this.path)) return;
    const fd = fs.openSync(this.path, "r");
    const buf = Buffer.alloc(1 << 20);
    const decoder = new StringDecoder("utf8");
    let rest = "";
    try {
      for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0; ) {
        const lines = (rest + decoder.write(buf.subarray(0, n))).split("\n");
        rest = lines.pop();
        for (const line of lines) if (line) yield JSON.parse(line);
      }
      rest += decoder.end();
      if (rest) yield JSON.parse(rest);
    } finally {
      fs.closeSync(fd);
    }
  }
  get size() {
    return this.keys.size;
  }
}

// Small cursor file, so a list crawl resumes at the page it stopped on.
export function stateFile(source) {
  const p = path.join(outDir(source), "raw", "state.json");
  return {
    load: () => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : {}),
    save: (s) => fs.writeFileSync(p, JSON.stringify(s, null, 2)),
  };
}

// ── Commercial sites ────────────────────────────────────────────────────────
// Crawlers for commercial directories only run once the site's owner has
// agreed, recorded in permissions.json next to this file:
//
//   "businesslist": { "granted": "2026-10-15", "by": "name, role, company",
//                     "scope": "what they agreed to", "gapMs": 1000 }
//
// `gapMs` is the request rate they agreed to; without it, the site's own
// robots.txt Crawl-delay applies. robots.txt rules always apply unless
// "overridesRobots": true says the owner agreed otherwise in writing.

const PERMISSIONS = new URL("./permissions.json", import.meta.url).pathname;

export function requirePermission(source) {
  const all = fs.existsSync(PERMISSIONS) ? JSON.parse(fs.readFileSync(PERMISSIONS, "utf8")) : {};
  const p = all[source];
  if (!p?.granted || !p?.by) {
    console.error(
      `[${source}] No permission on record. This crawler only runs after the site has agreed.\n` +
      `Add "${source}": { "granted": "<date>", "by": "<who>", "scope": "<what>" } to ${PERMISSIONS}`,
    );
    process.exit(1);
  }
  return p;
}

// The rules in robots.txt that apply to us (our own group if the site names
// ABRIbot, otherwise "*"). Returns { allowed(path), crawlDelayMs }.
export async function robots(origin) {
  const res = await fetch(`${origin}/robots.txt`, { headers: { "User-Agent": UA } });
  return parseRobots(res.ok ? await res.text() : "");
}

// The robots.txt parser on its own, for crawlers that fetch the file
// themselves (websites.mjs needs a timeout and its own error handling).
export function parseRobots(body) {
  const groups = [];
  let current = null;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const [, key, value = ""] = line.match(/^([\w-]+)\s*:\s*(.*)$/) ?? [];
    if (!key) continue;
    const k = key.toLowerCase();
    if (k === "user-agent") {
      if (!current || current.rules.length || current.delay != null) groups.push((current = { agents: [], rules: [], delay: null }));
      current.agents.push(value.toLowerCase());
    } else if (current && (k === "allow" || k === "disallow")) {
      current.rules.push({ allow: k === "allow", path: value });
    } else if (current && k === "crawl-delay") {
      current.delay = Number(value) * 1000;
    }
  }
  const mine = groups.find((g) => g.agents.some((a) => a !== "*" && UA.toLowerCase().includes(a)))
    ?? groups.find((g) => g.agents.includes("*"))
    ?? { rules: [], delay: null };
  const matches = (rule, p) => {
    const re = new RegExp("^" + rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
    return re.test(p);
  };
  return {
    crawlDelayMs: mine.delay,
    // Longest matching rule wins; Allow wins a tie; an empty Disallow allows.
    allowed(p) {
      let best = null;
      for (const r of mine.rules) {
        if (!r.path) continue;
        if (matches(r.path, p) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
      }
      return !best || best.allow;
    },
  };
}

// Permission + robots.txt → the fetcher a commercial crawler must use.
export async function commercialFetcher(source, origin) {
  const p = requirePermission(source);
  const rules = await robots(origin);
  const gapMs = p.gapMs ?? rules.crawlDelayMs ?? 2000;
  const get = politeFetcher({ gapMs });
  log(source, `permission from ${p.by} (${p.granted}); one request every ${gapMs / 1000}s`);
  return {
    gapMs,
    async get(url, opts) {
      const { pathname, search } = new URL(url);
      if (!p.overridesRobots && !rules.allowed(pathname + search)) return null;
      return get(url, opts);
    },
  };
}

export function saveRaw(source, file, body) {
  fs.writeFileSync(path.join(outDir(source), "raw", file), body);
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#039": "'" };

export function decode(s) {
  return String(s ?? "").replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// Visible text of an HTML fragment: <br> becomes a newline, tags go, entities
// decode, runs of spaces collapse.
export function text(html, { keepLines = false } = {}) {
  let s = String(html ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ");
  s = decode(s);
  return keepLines
    ? s.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n")
    : s.replace(/\s+/g, " ").trim();
}
