// Crawls MOTAC's public licence registers ("Semakan") for tourism businesses.
//
//   node scripts/sources/crawl/motac.mjs
//
// SOURCE. motac.gov.my/semakan. Each register is a paged card list that the
// page loads from admin-ajax.php (action motac_semakan_filter); robots.txt
// allows that path. We ask for 100 cards a page.
//
// Left out on purpose: licensed tour guides (individuals), the unlicensed-
// entities warning list, Umrah advert approvals and tour-guide cancellations.

import { decode, JsonlStore, log, politeFetcher, stateFile, text } from "./kit.mjs";

const SOURCE = "motac";
const REGISTERS = [
  "agensi-pelancongan-tobtab",
  "agensi-pelancongan-umrah",
  "syarikat-mm2h-berlesen",
  "hotel-berdaftar",
  "penggredan-hotel",
  "penggredan-green-hotel",
  "penggredan-spa",
  "premis-kesejahteraan-urutan-pku",
  "malaysia-tourism-quality-assurancesmytqa",
];
const PER_PAGE = 100;

const get = politeFetcher({ gapMs: 1500 });
const store = new JsonlStore(SOURCE, "registers.jsonl", (r) => `${r.register}|${r.page}|${r.num}`);
const state = stateFile(SOURCE);
const done = state.load();

// One card → { field: value }. Cards differ per register, so every
// "col col-<name>" div and every "company-<name>" div becomes a field.
function parseCard(card) {
  const rec = {};
  for (const m of card.matchAll(/class="col col-([\w-]+)"[^>]*>([\s\S]*?)(?=<div class="col col-|$)/g)) {
    rec[m[1]] = text(m[2].replace(/<svg[\s\S]*?<\/svg>/g, ""), { keepLines: true });
  }
  for (const m of card.matchAll(/class="company-([\w-]+)"[^>]*>([\s\S]*?)<\/div>/g)) {
    rec[m[1]] = text(m[2].replace(/<svg[\s\S]*?<\/svg>/g, ""), { keepLines: true });
  }
  for (const m of card.matchAll(/class="badge-[\w-]+"[^>]*>([\s\S]*?)<\/div>/g)) {
    (rec.badges ??= []).push(text(m[1]));
  }
  return rec;
}

for (const register of REGISTERS) {
  let page = (done[register] ?? 0) + 1;
  let lastPage = Infinity;
  while (page <= lastPage) {
    const form = new FormData();
    for (const [k, v] of Object.entries({
      action: "motac_semakan_filter", kategori: register, search: "", negeri: "",
      klasifikasi: "", jenis: "", page: String(page), per_page: String(PER_PAGE),
    })) form.append(k, v);
    const body = JSON.parse(
      await get("https://www.motac.gov.my/wp-admin/admin-ajax.php", { method: "POST", body: form }),
    );
    const html = body?.data?.html ?? "";
    if (/motac-db-error/.test(html)) {
      log(SOURCE, `${register}: MOTAC says its system is unreachable; skipped for now`);
      break;
    }
    const cards = html.split('<div class="motac-card">').slice(1);
    if (!cards.length) break;
    lastPage = Math.ceil((body.data.total ?? 0) / PER_PAGE) || page;
    for (const card of cards) {
      const rec = parseCard(card);
      store.add({ register, page, ...rec, name: decode(rec.name ?? "") });
    }
    done[register] = page;
    state.save(done);
    log(SOURCE, `${register}: page ${page}/${lastPage}, ${store.size} saved in total`);
    page++;
  }
}
log(SOURCE, `done: ${store.size} records`);
