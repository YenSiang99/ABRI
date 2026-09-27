# ABRI — Free data sources for seeding the directory

Closes the blueprint's owed item: *"Real corridor count: the SSM/MyData pull that sets the true seeding target."* Scope is the Klang Valley, free sources first, paid only once free is exhausted.

Two rules are already decided and are not revisited here:
- **No scraping personal data — public listings only** (`ABRI-master-blueprint.md`, non-negotiables).
- **Breadth beats depth** — a row with `id`, `name`, `category`, `location` is findable, filterable and claimable (`ABRI-listing-intake.xlsx` → *Before sending*).

---

## Where we are (26 Sep 2026)

**145,221 unique Klang Valley businesses**, intake-sheet shaped, in `data/seed/listings.csv`. They come from three free sources whose licences allow commercial reuse. Mixed-script names are cleaned to their Latin part (`cleanName` in `common.mjs`).

They are loaded with `node scripts/import-seed.mjs`, which does a dry run unless given `--apply`. It only ever inserts: an existing id, or an existing name in the same locality, is skipped and never overwritten. Every run writes a manifest to `data/seed/imports/`, and `--remove <manifest>` undoes that run for any listing nobody has touched since. Any database other than `backend/.env`'s needs `ABRI_IMPORT_CONFIRM=<host>:<port>/<db>`.

This count is after widening the vocab on 26 Sep: `Automotive` became a category, and 19 localities were added (Klang, Kajang, Selayang, Seri Kembangan and others) to the original 7. Before that it was 94,444.

| Category | Total | Overture | OSM | DBKL | In 2+ sources |
|---|---:|---:|---:|---:|---:|
| Food & Beverage | 43,371 | 31,649 | 5,814 | 5,908 | 1,956 |
| Retail | 28,318 | 16,128 | 4,570 | 7,620 | 1,123 |
| Health & Wellness | 21,865 | 17,074 | 2,054 | 2,737 | 880 |
| Automotive | 18,557 | 16,166 | 1,249 | 1,142 | 737 |
| Education | 10,902 | 8,806 | 1,705 | 391 | 382 |
| Property | 5,111 | 5,000 | 111 | — | 38 |
| Manufacturing | 4,261 | 3,779 | 199 | 283 | 104 |
| Construction & Trades | 3,616 | 3,272 | 92 | 252 | 46 |
| Marketing & Media | 3,521 | 3,100 | 31 | 390 | 74 |
| IT Consulting | 1,798 | 1,787 | 11 | — | 26 |
| Logistics | 1,345 | 1,233 | 23 | 89 | 15 |
| Law | 1,110 | 1,087 | 23 | — | 4 |
| Design | 842 | 828 | 14 | — | 10 |
| **Professional Training** | 315 | 129 | 4 | 182 | 2 |
| **Accounting & Tax** | 285 | 264 | 21 | — | 1 |
| **Corporate Secretarial** | 13 | 13 | — | — | — |

By locality: Kuala Lumpur 59,152 · Petaling Jaya 14,101 · Shah Alam 12,714 · Klang 12,258 · Puchong 6,542 · Kajang 5,442 · Subang Jaya 4,961 · Selayang 4,100 · Seri Kembangan 4,084 · Ampang 3,600 · Bangsar 3,194 · Cheras (Selangor) 2,537 · Bangi 2,008 · Rawang 2,004 · Sungai Buloh 1,709 · Nilai 1,391 · Putrajaya 1,136 · Cyberjaya 1,047 · Semenyih 1,033 · Dengkil 872 · Sepang 423 · Hulu Langat 306 · Serdang 185 · Banting 155 · Ijok 152 · Puncak Alam 124.

**Checks passed on the merged file:** 0 duplicate ids, every id slug-shaped, every category/location valid against `businessVocab.js`, `domain`/`phone`/`whatsapp`/`email` all empty, no `N/A`/`-`/`TBC` cells.

**Still thin:** Corporate Secretarial, Accounting & Tax and Professional Training, and to a lesser degree Design and Law. Those are what pass 2 (below) is for.

## How to run it

```
cd backend
python3 scripts/sources/overture_fetch.py   # needs: pip3 install --user duckdb
node scripts/sources/overture.mjs
node scripts/sources/osm.mjs                # Overpass; cached in data/sources/osm/raw
node scripts/sources/dbkl.mjs               # downloads the DBKL xlsx once
node scripts/sources/merge.mjs              # → data/seed/listings.csv
```

Each source writes `data/sources/<name>/listings.csv`, `overflow.csv` and `stats.json` (all gitignored). Shared helpers — slugs, postcode → locality, vocab checks, CSV — are in `backend/scripts/sources/common.mjs`.

---

## How to judge a source

1. **Licence or terms.** "Free to view" is not "free to reuse". An open licence (CDLA, ODbL, CC-BY, Apache) permits reuse; a directory's terms usually forbid it.
2. **Personal data.** Anything identifying a person falls under the PDPA and the blueprint's rule. Firm names and business addresses are fine.
3. **Someone else's compiled database.** Copying a directory wholesale takes the thing that directory sells.
4. **Bot protection means no.** A Cloudflare challenge or CAPTCHA is the site saying so. We never work around one.

## Sources in use

### Overture Maps Places — the big one
| | |
|---|---|
| Licence | **CDLA-Permissive-2.0** (a few upstream rows Apache-2.0 / CC0). Commercial use, attribution, **no share-alike** |
| What it is | Open POI dataset from the Overture Maps Foundation (Meta, Microsoft, AWS, TomTom). In the Klang Valley, 96% of rows come from Meta business pages — the legal route to roughly what Google Maps shows |
| Raw | 302,055 places in the Klang Valley box, release 2026-09-23.1 |
| Kept | **63,992** after dropping chains (16,187), non-businesses like mosques and parks (20,311), low confidence (108,683) and duplicates |
| Why it matters | It reaches professional services OSM barely maps: 860 law firms, 217 accountants, 1,338 IT firms, 644 design firms against OSM's ~20 each |
| Confidence | Overture's confidence largely tracks how alive a place's upstream page is. Consumer categories need ≥ 0.6; **B2B categories need ≥ 0.4**, because a law firm's page gets little engagement and still exists — a sample of 0.4–0.6 law, accounting and agency rows was overwhelmingly real |

### OpenStreetMap
| | |
|---|---|
| Licence | ODbL — attribution **and share-alike on derived databases** (see *Open question*) |
| Kept | **15,446** of 30,560 named places (5,861 brand branches dropped) |
| Locality | Postcode, else the OSM council boundary the point sits in, else `addr:city`. Postcode and boundary agree 97.7% of the time |

### DBKL licensed premises, Kuala Lumpur
| | |
|---|---|
| Licence | **CC-BY 4.0**, via archive.data.gov.my |
| What it is | 55,530 trade licences, 36,589 companies, 427 activity types, each with company name and premises address |
| Kept | **19,497** after dropping chains (companies with ≥ 5 KL premises) and the 13,400 generic "business office" licences with no stated trade |
| Caveats | **Dated 2019**, so some businesses have since closed. **Names are legal names** ("… Sdn Bhd"), not trading names. When Overture or OSM has the same business, the merge takes their name. 17,687 DBKL rows are found in no other source; treat those as the least certain |

## The merge

`merge.mjs` matches rows on normalised name + locality (Sdn Bhd / Enterprise / PLT / punctuation stripped). The highest-priority source supplies name and category (register > Overture > OSM > DBKL), and empty fields are filled from the others. `confirmed = yes` marks 4,296 businesses found in two or more independent sources.

Matching is deliberately exact. A missed duplicate can be cleaned up later; two different businesses glued together can't be seen at all.

## What's in overflow, and what it's telling us

Overflow holds real businesses the vocab can't take yet. After the 26 Sep widening, it is almost entirely businesses with no category: about 48,000. They are mostly generic DBKL "business office" licences with no stated trade, plus hotels, event planners, travel agents, banks, insurers and laundries, most of which probably shouldn't be added.

Only about 500 rows are still held back by locality: Telok Panglima Garang, Jenjarom, Subang (the airport side, 47200), and DBKL licences whose postcode is a typo.

Coverage stops at the Klang Valley box (2.75–3.35°N, 101.35–101.85°E), so Sepang, Nilai and Banting are only partly covered and KLIA is not covered at all.

## Pass 2 — filling the thin categories

The rule is: build a register scraper only for categories that are still thin, and only after that site passes the terms check.

| Category | Candidate source | Status |
|---|---|---|
| Corporate Secretarial | SSM registered secretaries, MAICSA | **Individuals, not firms** — probably unusable. Law and accounting firms often run the secretarial practice, so filling those may fill this |
| Accounting & Tax | MyCukai / MOF approved tax agents search | To check |
| Accounting & Tax | MIA member firm directory | **Blocked** — Cloudflare bot challenge |
| Law | Malaysian Bar legal directory | **Blocked** — terms forbid reproduction without the Bar Council's consent |
| Professional Training | HRD Corp ETRIS (~8,000 providers) | To check |
| Design | BQSM consulting QS firms; MIID directory | To check |
| Design | LAM (architects) | **Blocked** — Cloudflare |
| Logistics | FMFF (~1,500 forwarders); MCMC courier list; JKDM customs agents | To check; FMFF shows contact persons, take firms only |
| Construction & Trades | CIDB contractor search | To check |
| Construction & Trades | BEM engineering consultancies | **Blocked** — Cloudflare |
| Property | LPPEH estate agency firms; KPKT licensed developers | To check |
| IT Consulting | MDEC Malaysia Digital directory | To check |
| Marketing & Media | 4As members (~80 agencies) | To check |
| Manufacturing | MATRADE exporter directory | To check |

**Permission requests** (to be sent by a human, not scraped): the Bar Council, MIA, LAM and BEM, plus the four Selangor councils (MBPJ, MBSJ, MBSA, MPAJ), which don't publish a licence list like DBKL's.

## Not used yet, and why

| Source | Why not yet |
|---|---|
| **Foursquare OS Places** (Apache 2.0) | Moved to a gated Hugging Face dataset. Needs a human to accept the terms, which shares contact details with Foursquare, and then an access token. About 8,000 Klang Valley Foursquare rows already arrive inside Overture |
| MOH Act 304 clinic lists, pharma/cosmetics manufacturer lists (CC-BY) | National lists of ~1,300 rows; Health & Wellness already has 16,000. Low marginal value |
| GLEIF LEI, Wikidata (CC0) | Large companies only |
| data.gov.my MSC datasets | Counts only, no company names |

## Ruled out

| Source | Why |
|---|---|
| Google Maps / Places | API is paid, and the terms forbid storing results beyond place IDs; scraping Maps breaks the terms |
| LinkedIn | Prohibited by the terms and actively litigated; also mostly personal data |
| JobStreet | Terms prohibit automated collection; only shows companies currently hiring |
| Yellow Pages MY and similar | Compiled databases; terms forbid reuse |
| OpenCorporates | Free tier is share-alike and non-commercial |
| SSM | RM15–25 per company profile, no bulk tier — buy per verification, not for seeding |

## Rules for imported data

1. **Never fill `domain` from OSM, Overture or DBKL.** `lib/domainVerification.js` auto-approves an ownership claim whose email domain matches it, with no admin review; a stale or wrong website would hand a stranger somebody else's listing. `domain` is filled only from a regulator's own record of the firm, or by an admin.
2. **Never fill `phone`, `whatsapp` or `email`.** `lib/contactVisibility.js` puts them behind the paid tier. Bulk-loading them would sell contact details nobody consented to share. Overture's phones and emails are never even exported.
3. **Keep provenance.** Every row carries `source`, `sourceId`, `sourceYear`, `locationBasis`, `sourceType`, and after the merge `primarySource`, `alsoIn`, `confirmed`.
4. **Skip chains.** Brand-tagged places, and DBKL companies with five or more premises.
5. **A wrong locality is worse than a missing one.** When unsure, send the row to overflow.
6. **Names are kept as the source wrote them** (`nameVerdict` in `common.mjs`, decided 27 Sep, reversing the 26 Sep strip-to-English rule). Chinese, Tamil, Arabic, Japanese, Korean and Thai names stay, including names with no English at all (id `biz-<source id>`). What still changes:
   - Fancy maths/fullwidth letters become plain.
   - Every word starts with a capital, except joining words in the middle ("and", "of", "dan", "di"). Words that already have a capital (`iPhone`, `McDonald's`) and ALL-CAPS names are left alone, and abbreviations go fully uppercase (`KL`, `SS2`, `PLT`). This applies to DBKL names too.
   - Text in other scripts (Burmese, Bengali) is removed.
   - Decoration is tidied: symbols at either end, extra spaces, trailing dots, broken brackets, and an address pasted after the name (cut at the street word).
   - A listing is dropped when its name is only a place ("Taman Asa Jaya", "Lorong Keramat 12"), starts like an address ("Taman…", "Kampung…", "Unit…", reviewed over 1,242 examples), or says it's closed. Malls stay.
   - One-off rulings go in `scripts/sources/name-decisions.json`, and already-imported rows are updated with `scripts/sync-seed-names.mjs`.
7. **Only businesses** (`scripts/sources/nonBusiness.mjs`, decided 27 Sep). The test: could this listing claim its page, pass SSM verification and want other businesses to find it? Removed by `merge.mjs`, and recorded with a reason in `data/seed/nonbusiness.csv`:
   - government schools, public universities, and public hospitals, wards and government clinics
   - government offices, places of worship, residences, street markets (pasar malam/tani/pagi), and public sports fields, pools and courts
   - added in a second sweep: public housing and quarters, military, police and prison sites, hawker centres and Ramadan bazaars, LRT/MRT/KTM stations and toll plazas, statutory bodies (Lembaga…), GIATMARA and other government skills institutes, and street addresses standing in for a name
   - office-floor addresses and landmarks
   - associations and non-profits. These are kept as a partner lead list in `ABRI-associations.xlsx`, since trade bodies speak for many businesses.
   - When a listing is borderline it stays. Any name with a trading word (`Kafe Pemuda Masjid`, `IIUM Bookshop`) is kept, and so are private hospitals and schools, food courts, malls, petrol stations and company head offices (`Wisma …`).

## Attribution — required before any of this goes live

- "© OpenStreetMap contributors" (ODbL)
- "Overture Maps Foundation" (CDLA-Permissive-2.0)
- "Dewan Bandaraya Kuala Lumpur, via data.gov.my" (CC-BY 4.0)

## Open question — ODbL share-alike

OSM's licence requires share-alike on *derived databases*, and seeding ABRI's listings from OSM arguably creates one. Overture (no share-alike) and DBKL (CC-BY) don't have this issue. OSM now contributes only 15,446 rows, and many of those also appear in Overture. The cleanest option may be to **import only OSM rows that are `confirmed` by another source, and carry those under the other source's licence**. Get a lawyer's view before launch.

## The real corridor count — still owed

DOSM's Economic Census publishes establishment counts by district and MSIC industry. Mapping those onto the 15 categories for WP Kuala Lumpur and the Petaling, Klang, Hulu Langat and Gombak districts would show what share of each category the 94,444 rows actually reach.

## Next steps, in order

1. ~~Widen the vocab~~ — done 26 Sep: Automotive plus 19 localities. `ABRI-listing-intake.xlsx` updated to match (16 categories, 26 localities, 136 services).
2. **Pass 2 for the thin categories:** accounting, corporate secretarial, training, design, logistics. Run the terms check, then scrape only what passes.
3. **Send the permission requests** (Bar Council, MIA, LAM, BEM, Selangor councils).
4. ~~Build the importer~~ — done: `backend/scripts/import-seed.mjs`.
5. **Compute the corridor count** from DOSM.
