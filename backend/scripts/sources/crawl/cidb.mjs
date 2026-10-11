// Crawls CIDB's public register of local contractors (valid registrations).
//
//   node scripts/sources/crawl/cidb.mjs          # list, then details
//   node scripts/sources/crawl/cidb.mjs list     # list only
//   node scripts/sources/crawl/cidb.mjs details  # details only
//
// SOURCE. cims.cidb.gov.my "Carian Kontraktor", the search anyone can run
// without logging in; robots.txt allows it. About 137k contractors.
//
// TWO PASSES:
// 1. List: the search form posted page by page, 500 rows a page (the page
//    itself offers up to 1,000). Gives name, grade, state, district, phone,
//    fax, which certificates they hold, and the id of the details view.
// 2. Details: one request per contractor to the view the "Paparan" button
//    opens. Adds registered and correspondence address, email, CIDB number,
//    member-since date, certificate dates, and every grade/category/
//    specialisation. About 38 hours at one request a second.
//
// The register can be searched by SSM number but does not display it, so the
// SSM link is made later by matching, not here.

import { JsonlStore, log, politeFetcher, sleep, stateFile, text } from "./kit.mjs";

const SOURCE = "cidb";
const BASE = "https://cims.cidb.gov.my/smis/regcontractor/";
const PAGE_SIZE = 500;

const phase = process.argv[2] ?? "all";
const get = politeFetcher({ gapMs: 1000 });
const list = new JsonlStore(SOURCE, "list.jsonl", (r) => r.id);
const details = new JsonlStore(SOURCE, "details.jsonl", (r) => r.id);
const state = stateFile(SOURCE);

const cells = (row) => [...row.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) => m[1]);

async function crawlList() {
  const s = state.load();
  let page = (s.listPage ?? 0) + 1;
  let totalPages = s.listTotalPages ?? Infinity;
  while (page <= totalPages) {
    const form = new URLSearchParams({
      comName: "", ComState: "", ComCategoryID: "", CidbRegno: "", ComDistrict: "",
      ComSpecID: "", ComGradeID: "", seltype: "1", selvalidity: "1", ssmno: "",
      hdnpagesize: String(PAGE_SIZE), hdnctpage: String(page), hdnsortcol: "ComName",
      hdnsortdir: "0", hdnexportopts: "", txtgoto: "", selpagesize: String(PAGE_SIZE),
    });
    const html = await get(BASE + "reglocalsearchcontractor.vbhtml", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    totalPages = Number(html.match(/name="hdntotpage" value="(\d+)"/)?.[1] ?? totalPages);
    const total = html.match(/name="hdntotalrecs" value="(\d+)"/)?.[1];
    let rows = 0;
    for (const tr of html.split(/<tr[^>]*>/i).slice(1)) {
      const id = tr.match(/data-flag="([0-9a-f-]{36})"/)?.[1];
      if (!id) continue;
      const c = cells(tr).map((x) => text(x));
      list.add({
        id, name: c[1], grade: c[2], state: c[3], district: c[4], phone: c[5], fax: c[6],
        ppk: c[7] === "Yes", spkk: c[8] === "Yes", stb: c[9] === "Yes",
      });
      rows++;
    }
    if (!rows) throw new Error(`page ${page} had no rows; the page has changed`);
    state.save({ ...state.load(), listPage: page, listTotalPages: totalPages });
    log(SOURCE, `list page ${page}/${totalPages} (${total} contractors): ${list.size} saved`);
    page++;
  }
}

function parseDetails(id, html) {
  const rec = { id };
  const tables = [];
  for (const tr of html.split(/<tr[^>]*>/i).slice(1)) {
    const c = cells(tr.split(/<\/tr>/i)[0]).map((x) => text(x, { keepLines: true }));
    if (c.length === 2 && c[0] && !/^(TARIKH|PENDAFTARAN)/.test(c[0])) rec[c[0]] = c[1];
    else if (c.length >= 3) tables.push(c);
  }
  // Rows of the certificate and grade tables, header rows dropped.
  rec.certificates = tables.filter((c) => /\(|SIJIL|PERAKUAN/.test(c[0]) && c.length === 3)
    .map(([name, start, end]) => ({ name, start, end }));
  rec.grades = tables.filter((c) => /^G\d$/.test(c[0]))
    .map(([grade, category, specialisation]) => ({ grade, category: category.replace(/\n/g, " "), specialisation: specialisation.split("\n") }));
  return rec;
}

async function crawlDetails() {
  const todo = [...list.records()].filter((r) => !details.has(r.id));
  log(SOURCE, `details: ${details.size} saved, ${todo.length} to go (~${Math.round(todo.length / 3600)} h)`);
  let n = 0;
  for (const r of todo) {
    // CIDB has outages (503s, and pages that come back empty just before
    // one). An empty page is never saved; an outage is waited out, checking
    // every 15 minutes for up to a day, instead of ending the run.
    for (let waitedMin = 0; ; waitedMin += 15) {
      try {
        const rec = parseDetails(r.id, await get(`${BASE}reglocalsearch_view.vbhtml?search=P&comSSMNo=${r.id}`));
        if (!rec.Name) throw new Error("details page came back empty");
        details.add(rec);
        break;
      } catch (err) {
        if (/refusing us|challenge page/.test(err.message) || waitedMin >= 24 * 60) throw err;
        log(SOURCE, `CIDB unavailable (${err.message.slice(0, 60)}); trying again in 15 min`);
        await sleep(15 * 60_000);
      }
    }
    if (++n % 500 === 0) log(SOURCE, `details: ${details.size} saved, ${todo.length - n} to go`);
  }
  log(SOURCE, `details done: ${details.size}`);
}

if (phase === "all" || phase === "list") await crawlList();
if (phase === "all" || phase === "details") await crawlDetails();
