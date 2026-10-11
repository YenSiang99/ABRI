# ABRI: Malaysian websites with SSM and business data

Research done on 2 October 2026 by web search, by direct requests, and by browsing each site in Chrome. For every site we opened one real company profile and checked whether it shows an SSM registration number. An SSM number looks like `202501046060` (the 12-digit format used since 2019) or `1647468-V` (old format).

"Free" below means free to view in a browser. Copying a site's data into ABRI in bulk still needs that site's permission; the plan is to license the sources we use. Sole-proprietor and director details are personal data under PDPA 2010 even when licensed.

## What ABRI has today (for comparison)

`data/seed/listings.csv` has 142,936 rows by primary source: Overture 108,893, DBKL 19,021 (2019 trade licences), OSM 15,022. None has an SSM number, phone or email; about 45k have a website.

## 1. Free to view, SSM number shown

| Site | Size | Fields beyond the SSM number | Access notes |
|---|---|---|---|
| **BusinessList.my** (`businesslist.my/company/<id>/<slug>`) | 284,455 listings | Phone, WhatsApp, email, website, employees, year founded, hours, contact person, description | Cloudflare; robots.txt asks for 40 seconds between requests. The richest source; best route is a data licence. |
| **Maukerja** (`maukerja.my/company/<slug>`) and **Ricebowl** (`ricebowl.my/company/<slug>`) | about 90,000 employer pages (`mk_company1–18.xml` sitemaps) | SSM number in "Business Information", Verified badge, employee range, industry, address | Same owner (AJobThing) and the same database on both sites, so one licence covers both. robots.txt allows `/company/` pages for crawlers in general but blocks named bots, including ClaudeBot, and company pages now show a Cloudflare challenge to anything that isn't a browser, so the only route is an export from AJobThing. The `SSM (1036935K)` in the page footer is AJobThing's own number. |
| **companieshouse.my** (`companieshouse.my/<slug>-<oldno>`) | Companies and sole proprietors/partnerships | New and old SSM number, year registered, entity type | No address or contact details. Searchable by name or number (`/search?term=`). robots.txt allows everything; there's no sitemap. Full reports are paid (see section 2). |
| **Newpages** (`newpages.com.my/v2/en/company/<id>/<name>.html`) | about 4,800+ suppliers | Phone, hours, business type, products, website | SSM number appears next to the company name. robots.txt allows company pages; it blocks only search pages, two named companies and one advertising bot (corrected 2 Oct; an earlier note said it blocked everything). |
| **OpenCorporates** (`opencorporates.com/companies/my/<oldno>`) | All SSM companies | Old-format number, status, company type, city/state | Some fields (data source, GST number) need a login. Rates its own Malaysia data 10/100. |
| **myProcurement** (`myprocurement.treasury.gov.my/results/...`) | Every federal tender and quotation award | Winning company, address, ROB/ROS/ROC number, contract value, dates | Government site, public. |
| **Bursa Malaysia** (`bursamalaysia.com/trade/trading_resources/listing_directory/company-profile?stock_code=<code>`) | about 1,000 listed companies | Sector, website, announcements, annual reports | Public. |
| **MDEC Malaysia Digital** (`mdec.my/md-tech-directory`) | 4,382 tech companies | Website, sector, year awarded | Table includes a ROC number column. |

## 2. Paid: SSM data you have to buy

| Provider | What you buy | Price found |
|---|---|---|
| **SSM MyData** (`mydata-ssm.com.my`) | "Company Listing Package B": bulk list with basic info, officers, shareholders and share capital, filtered by criteria you choose | **RM4.06 per company** (RM3 SSM fee + RM1 service + SST) plus a RM25.30 application fee. Contact: SSM, 03-7721 4000, enquiry@ssm.com.my. Single profiles about RM10–50. SSM's terms ban scraping MyData and e-Info, and there's no public API. |
| **SSM e-Info** (`ssm-einfo.my`) | Official profiles and documents | Name search free with an account; reports paid |
| **companieshouse.my** | Company profile, directors, shareholders, certificate | US$50 each; financial report US$25 |
| **InfobelPRO** | Bulk data: 823,802 Malaysian businesses, sourced from SSM | Quote on request |
| **OpenCorporates** | Bulk CSV, API | Quote on request |
| **Truestack TrueSSM**, **MyData Infomatica**, **ssmsearch.com**, **Emerhub** | API lookups or reports, one company at a time | Quote on request; good for checking an SSM number when an owner claims a profile, not for building a list |
| **D&B**, **CTOS**, **RAMCI** | Credit reports | Per report |
| **FMM Directory of Malaysian Industries** | 4,100+ manufacturers | Paid publication (sold on USB) |

**Free check at claim time:** LHDN's MyInvois "Search Taxpayer TIN" API looks a taxpayer up by business registration number or name. It needs MyInvois API credentials. It checks one business at a time and can't produce a list.

## 3. Free, but no SSM number

| Site | Size | Fields | Notes |
|---|---|---|---|
| **CIDB contractor search** (`cims.cidb.gov.my/smis/regcontractor/reglocalsearchcontractor.vbhtml`) | **137,216 valid local contractors** | Name, grade, state, district, address, phone, fax, **email**, CIDB number, member since, certificates | Can be **searched by SSM number** ("No. Pendaftaran Perniagaan"), so records can be matched to SSM. Has an Export button (not used yet; downloading needs the user's OK). |
| **MOTAC travel agencies** (`motac.gov.my/kategori-semakan-new/agensi-pelancongan-tobtab/`) | 5,396 | Address, phone, licence number, services, head office or branch, expiry | One paged table. |
| **JAKIM MyeHALAL directory** | Large (e.g. 533 Kuala Lumpur food-product companies matched "sdn bhd") | Name, full address, certificate expiry | Search form: state, category, keyword. |
| **Cybo** (`cybo.com/MY-biz/<slug>`) | Large | Phone, email, hours, address, ISIC industry code | A Cloudflare check appears but passes without a click. |
| **D&B public directory** | Thin (about 200 accounting firms) | Key person's name, industry | D-U-N-S company ID is paywalled. |
| **JobStreet**, **Hiredly** (7,729 companies), **recommend.my** (about 11k businesses, up to 225k service providers) | | Address, industry, size, services | JobStreet discourages crawling. |
| **foodpanda** (30k+), **GrabFood** | | Name, address, hours, cuisine | Strict terms; needs a partnership. |
| **InvestPenang MNC directory** | Multinationals only | Sector, home country, website | |
| **data.gov.my** (CC BY 4.0) | Pharma wholesalers 1,014, importers 475, manufacturers 289; cosmetics manufacturers 629; PriceCatcher premises 3,921 | Phone and address (pharma, cosmetics); address (PriceCatcher) | Direct CSV downloads from `storage.data.gov.my`. |
| **archive.data.gov.my** | 2,570 "senarai" (list) datasets, mostly 2018–19 | Varies | Includes JPJ accident-repair workshops (880, with phone), MOTAC agencies, KPDN direct sellers, community pharmacies. DBKL came from here. |

## 4. Not usable as of 2 October 2026

- **Kompass**: Malaysia is no longer in its country list.
- **Yellow Pages MY**: the site loads but its listings never appeared.
- **LemReveal**: couldn't find a real company (AVERIS SDN. BHD.) that two other sites found.
- **streetdirectory.com.my**: the domain is now an unrelated blog.
- **InvestPenang SME directory**: removed (page not found).
- **MATRADE services directory**: listing pages don't load.
- **MYStartup**: the startup database needs a login.
- **LPPEH** (estate agents and valuers): site was down for maintenance; check again later.
- **Infobel** (free site): flagged the visit as abuse. Don't revisit; use the paid InfobelPRO instead.
- **No public list found** for SSM-licensed company secretaries, LHDN tax agents or HRD Corp training providers. The audit regulator's register has only 37 firms. For these thin categories, use SSM's industry-code filter or a directory licence.

## Recommendations

1. **SSM backbone:** get quotes from SSM MyData (Package B, filtered to active Klang Valley companies) and from InfobelPRO. Only SSM covers every business.
2. **SSM numbers without paying SSM:** BusinessList, Maukerja/Ricebowl and companieshouse.my together cover the most businesses. BusinessList and Maukerja also have contact details; companieshouse.my includes sole proprietors.
3. **Free official lists:** CIDB (137k, with email and phone, searchable by SSM number), MOTAC, JAKIM halal, data.gov.my. Useful as verified sector badges.
4. **Biggest free source not used yet:** Foursquare Open Source Places. It's waiting on the user to accept the gated access on Hugging Face.

## Government crawlers (started 2 October 2026)

Code is in `backend/scripts/sources/crawl/`. Each script saves what the register publishes, unchanged, to `data/sources/<source>/raw/` (gitignored), with logs in `data/sources/logs/`. Rerunning a script resumes where it stopped. `kit.mjs` holds the shared rules: one request at a time with a pause, back off on errors, stop on 401/403 or a challenge page. Mapping raw records into listings is a separate step that follows `../common.mjs` (phone and email stay out of listings unless that rule changes).

| Script | Source | Result / estimate |
|---|---|---|
| `datagovmy.mjs` | 5 data.gov.my CSVs | Done: 6,328 rows |
| `mdec.mjs` | MDEC's quarterly CSV | Done: 4,468 companies with SSM numbers |
| `motac.mjs` | 9 MOTAC registers via `admin-ajax.php` (action `motac_semakan_filter`) | Done: 13,593 records |
| `cidb.mjs` | CIDB contractor search, 500 per page, then each details view | 137,229 contractors; list about 8 minutes, details about 38 hours |
| `myprocurement.mjs` | `/procurements/fetch` (100 per page), then one award page per distinct winner | about 158k awards; list about 30 minutes, details 12–17 hours |
| `halal.mjs` | JAKIM directory: common name words × 10 categories, all states | The server takes about 7 seconds a page, so 4–8 hours. Coverage depends on the word list. |

Bursa was left out: it serves a Cloudflare challenge to anything that isn't a browser.

## Commercial crawlers (written 2 October 2026, not run)

Each one refuses to start until the site's permission is recorded in `backend/scripts/sources/crawl/permissions.json` (who agreed, when, scope, and optionally the agreed request rate). robots.txt is always honoured unless the owner agreed otherwise in writing (`overridesRobots`).

| Script | How it works | Records | Time |
|---|---|---|---|
| `businesslist.mjs` | Walks company ids 1–386k (`/company/<id>` redirects to the profile; gaps answer 404). Reads the JSON-LD block plus the label/value fields. | about 284k: SSM number, phone, WhatsApp, website, map point, hours, year founded, employee band, categories, description | At robots.txt's 40 s delay, about 6 months. At a licensed 1 request/s, about 4.5 days. |
| `newpages.mjs` | Walks ids 1–830k (`/v2/en/company/<id>/x.html`); a missing id redirects home and is detected without downloading the home page. | Unknown until crawled: SSM number, locations, business nature, product classifieds, tags, hours, WhatsApp, website | About 19 days at the default 2 s gap; about 9.6 days at 1/s |
| `companieshouse.mjs` | **Lookup, not a crawl:** one name search per business already in `data/seed/listings.csv`. Keeps every candidate and flags exact name matches. | about 143k lookups → SSM number (new and old), entity type | About 80 hours at 2 s; about 40 hours at 1/s |
| `opencorporates.mjs` | Official API (needs `OPENCORPORATES_API_TOKEN`). One month of incorporation dates per search, split in half if a month exceeds the API's 10,000-result cap. | about 1.28M companies: SSM number, status, type, incorporation date, registered address. ODbL (attribution + share-alike). | About 13–15k API calls; a few hours at 1/s, but the free tier allows only 50 a day |

Not written: **Maukerja/Ricebowl** (Cloudflare challenge on every company page) and **Bursa** (Cloudflare). Both need an export from the owner.

### Where the long crawls run (from 2 October 2026)

CIDB and myProcurement moved to the EC2 host on 2 Oct and continued from the progress saved on the Mac. Code and data are in `/srv/abri/crawl/` (same layout as the repo: `backend/scripts/sources/crawl/`, `data/sources/<source>/raw/`, `data/sources/logs/`). Each runs as the systemd service `abri-crawl@<name>`. The unit (`/etc/systemd/system/abri-crawl@.service`) caps memory at 250 MB, sets OOMScoreAdjust=1000 so the kernel kills the crawler before Postgres, restarts on failure after 15 minutes (at most 6 times a day), and appends to the log.

- Status: `systemctl status abri-crawl@cidb` · `tail -f /srv/abri/crawl/data/sources/logs/cidb.log`
- Stop / start: `sudo systemctl stop|start abri-crawl@<name>` (crawls resume on start)
- Bring results home: `rsync -az -e "ssh -i ~/Downloads/abri.pem" ec2-user@<host>:/srv/abri/crawl/data/sources/<name>/raw/ data/sources/<name>/raw/`
- Before copying a crawler change to the server, check its memory: JsonlStore streams files for this reason; never load a whole raw file into an array.

## Loaded into the local database (3 October 2026)

`backend/scripts/sources/registers.mjs` maps halal, MOTAC, data.gov.my, myProcurement and MDEC raw files to `data/sources/<source>/listings.csv`. Then `merge.mjs`, `import-seed.mjs --apply` and `sync-seed-fields.mjs --apply` (new: fills phone/WhatsApp/email and fixes Banting/Puncak Alam localities on untouched imported rows). Local `abri` went from 146,802 to 191,705 businesses; 112,675 have a phone and 64,136 an email. Six categories were added. SSM numbers are kept in the seed CSV but **not written** to `Business.ssm` (that column means "submitted for verification"); they need a separate column. CIDB is waiting on its details view (`SystemOffline.vbhtml`).

## SourceRecord: who said what (3 October 2026)

New table `SourceRecord` (migration `20261003090000_add_source_records`): one row per business per source, with `@@unique([source, sourceId])`. Register SSM numbers live here (`ssm`/`ssmNormalized`), never in `Business.ssm`, which means "the owner submitted it". The lookup and directory search match these numbers too, and the public profile shows the first one as "Reg. … per MDEC · not yet verified" on unclaimed listings.

- `merge.mjs` now also writes `data/seed/sources.csv` (every contributing source row per listing).
- `scripts/sync-source-records.mjs [--apply]` writes SourceRecords after an import, matching by id, then by name and locality.
- `scripts/add-source-records.mjs <csv> [--apply]` handles manual entries from one CSV (template: `scripts/templates/source-records.csv`). It creates or attaches the Business, fills its empty fields if unclaimed, and upserts the record.
- Local `abri`: 199,511 SourceRecords; 20,734 businesses have a register SSM number. The `abri_test` DB was migrated by hand (`DATABASE_URL=<test url> npx prisma migrate deploy`); 70/70 tests pass.
