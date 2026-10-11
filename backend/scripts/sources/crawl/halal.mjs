// Crawls JAKIM's public directory of halal-certified companies.
//
//   node scripts/sources/crawl/halal.mjs
//
// SOURCE. halal.gov.my "Halal Status Verification" (MYeHALAL directory), the
// search anyone can run. Each result gives the company's name, full address,
// brand, certificate expiry and JAKIM's company code.
//
// The search needs a keyword, so there is no "list everything". We run a set
// of words that most company names contain ("sdn", "enterprise", "restoran"…)
// through each certificate category, across all states, and dedupe on JAKIM's
// company code. Coverage is therefore large but not guaranteed complete; the
// log reports how many new companies each word added, so a word that adds
// nothing can be dropped and a gap can be filled with new words.
//
// The server answers in about 7 seconds a page, so this takes hours.

import { JsonlStore, log, politeFetcher, stateFile, text } from "./kit.mjs";

const SOURCE = "halal";
const BASE = "https://www.halal.gov.my/index.php?data=ZGlyZWN0b3J5L2luZGV4X2RpcmVjdG9yeTs7Ozs=";
const CATEGORIES = {
  PE: "Premis Makanan", PR: "Produk Makanan / Minuman", OEM: "Pengilangan Kontrak (OEM)",
  BG: "Barang Gunaan", FM: "Farmaseutikal", KO: "Kosmetik dan Dandanan Diri",
  MD: "Peranti Perubatan", PL: "Logistik", PS: "Rumah Sembelihan", IN: "International",
};
const WORDS = [
  "sdn", "bhd", "enterprise", "trading", "plt", "restoran", "restaurant", "cafe", "kedai",
  "bakery", "catering", "food", "foods", "industries", "industri", "industry", "resources",
  "services", "marketing", "global", "international", "holdings", "ventures", "corporation",
  "group", "products", "manufacturing", "supply", "supplies", "mart", "kitchen", "nasi",
  "kopitiam", "hotel", "agro", "mee", "roti", "kek", "cake", "ayam", "beverage", "coffee",
  "frozen", "perusahaan", "niaga", "jaya", "maju", "makmur", "logistics", "pharma",
  "cosmetics", "koperasi", "berhad", "company", "co", "m",
];

const get = politeFetcher({ gapMs: 1500 });
const store = new JsonlStore(SOURCE, "companies.jsonl", (r) => `${r.code}|${r.category}`);
const state = stateFile(SOURCE);

function parseRows(html) {
  return html.split(/<tr class="border-b/).slice(1).map((tr) => {
    const code = tr.match(/comp_code=([\w-]+)/)?.[1];
    const cell = (cls) => tr.match(new RegExp(`class="company-${cls}">([\\s\\S]*?)</span>`))?.[1] ?? "";
    const dates = tr.split("</td>").slice(-2)[0] ?? "";
    return code && {
      code,
      name: text(cell("name")),
      address: text(cell("address"), { keepLines: true }),
      brand: text(cell("brand")),
      expiry: [...dates.matchAll(/\d{2}\/\d{2}\/\d{4}/g)].map((m) => m[0]),
    };
  }).filter(Boolean);
}

const done = state.load();
for (const [cat, catName] of Object.entries(CATEGORIES)) {
  for (const word of WORDS) {
    const key = `${cat}|${word}`;
    if (done[key]?.complete) continue;
    let page = (done[key]?.page ?? 0) + 1;
    let pages = Infinity;
    const before = store.size;
    while (page <= pages) {
      const url = `${BASE}&negeri=&category=${cat}&page=${page}&cari=${encodeURIComponent(word)}`;
      const html = await get(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "ty=CO",
      });
      const m = html.match(/Total Record : (\d+) - Page \d+ From (\d+)/);
      pages = m ? Number(m[2]) : 0;
      for (const r of parseRows(html)) store.add({ ...r, category: cat, categoryName: catName });
      done[key] = { page, pages };
      state.save(done);
      page++;
    }
    done[key] = { ...done[key], complete: true };
    state.save(done);
    log(SOURCE, `${cat} "${word}": ${pages} pages, +${store.size - before} new, ${store.size} saved`);
  }
}
log(SOURCE, `done: ${store.size} company-category records`);
