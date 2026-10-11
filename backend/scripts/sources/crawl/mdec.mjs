// Downloads MDEC's list of Malaysia Digital status companies.
//
//   node scripts/sources/crawl/mdec.mjs
//
// SOURCE. mdec.my/malaysiadigital/companies publishes the list as a CSV
// (company name, website, SSM number new and old, year awarded), renewed each
// quarter. The page names the current file; we find it there rather than
// hard-coding a quarter.

import { log, politeFetcher, saveRaw } from "./kit.mjs";

const SOURCE = "mdec";
const get = politeFetcher({ gapMs: 1000 });

const page = await get("https://mdec.my/malaysiadigital/companies");
const file = page.match(/\/api\/media\/file\/[^"\\]+\.csv/)?.[0];
if (!file) throw new Error("No CSV link on the MDEC companies page; the page has changed");

const csv = await get(`https://mdec.my${file}`);
const name = file.split("/").pop();
saveRaw(SOURCE, name, csv);
log(SOURCE, `${name}: ${csv.trim().split("\n").length - 1} companies`);
