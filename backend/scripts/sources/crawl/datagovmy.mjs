// Downloads the data.gov.my datasets that list individual businesses.
//
//   node scripts/sources/crawl/datagovmy.mjs
//
// SOURCE. data.gov.my, CC-BY 4.0. These are official files, not pages, so
// there is nothing to crawl: each dataset's page names a CSV on
// storage.data.gov.my and we save it as-is.

import { log, politeFetcher, saveRaw } from "./kit.mjs";

const SOURCE = "datagovmy";

// id → what it is. All carry company name and address; the pharma and
// cosmetics lists also carry a phone and a licence number.
const DATASETS = {
  pharmaceutical_wholesalers: "MOH-licensed pharmaceutical wholesalers",
  pharmaceutical_importers: "MOH-licensed pharmaceutical importers",
  pharmaceutical_manufacturers: "MOH-licensed pharmaceutical manufacturers",
  cosmetics_manufacturers: "Notified cosmetics manufacturers",
  lookup_premise: "PriceCatcher retail premises (KPDN)",
};

const get = politeFetcher({ gapMs: 1000 });

for (const [id, what] of Object.entries(DATASETS)) {
  const page = await get(`https://data.gov.my/data-catalogue/${id}`);
  const csvUrl = page.match(/https:\/\/storage\.data\.gov\.my\/[^"\\]+\.csv/)?.[0];
  if (!csvUrl) {
    log(SOURCE, `${id}: no CSV link on its page, skipped`);
    continue;
  }
  const csv = await get(csvUrl);
  saveRaw(SOURCE, `${id}.csv`, csv);
  log(SOURCE, `${id}: ${csv.trim().split("\n").length - 1} rows (${what})`);
}
