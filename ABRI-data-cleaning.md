# ABRI seed data: how it was cleaned

How the Klang Valley directory went from ~390,000 raw records to **142,936 listings** (27 Sep 2026). `ABRI-data-sources.md` covers where the data comes from and its licences; this file covers what was done to it and why. Every step is code in `backend/scripts/sources/`, so a rebuild reproduces all of it.

## The pipeline

| Step | Script | What it does |
|---|---|---|
| 1. Pull | `overture_fetch.py`, `osm.mjs`, `dbkl.mjs` | Raw places from Overture Maps, OpenStreetMap and DBKL's licensed-premises list |
| 2. Filter per source | `overture.mjs`, `osm.mjs`, `dbkl.mjs` | Drop closed places, chains, low-confidence and non-business categories, and anything outside our categories and areas. Clean every name (`nameVerdict` in `common.mjs`) |
| 3. Merge | `merge.mjs` | Combine the sources, fold duplicates into one listing, remove non-businesses (`nonBusiness.mjs`), assign ids → `data/seed/listings.csv` |
| 4. Load | `import-seed.mjs` | Insert new listings as unclaimed (L0). Insert-only: never overwrites a claimed listing |
| 5. Update | `sync-seed-names.mjs` | Bring already-imported listings in line with a rebuilt list: names, map pins, ids, removals |

Rebuild: `node scripts/sources/overture.mjs && node scripts/sources/osm.mjs && node scripts/sources/dbkl.mjs && node scripts/sources/merge.mjs`

## Cleaning steps, in order

### 1. Source filters (before a record becomes a listing)

| Removed | Count | Why |
|---|---:|---|
| Low-confidence Overture places | 105,214 | Mostly abandoned Facebook pages. B2B categories use a lower bar (0.4 vs 0.6), because a law firm's page gets little engagement and still exists |
| Chains and brands | 31,606 | Brand-tagged places, and DBKL companies with 5 or more premises. ABRI lists independent businesses |
| Non-business Overture categories | 27,309 | Mosques, parks, public schools and similar, by source category |
| DBKL licences with no trade, or outside our areas | 18,498 | e.g. generic "business office" licences |
| Marked closed by the source | 1 | |

### 2. Names (`nameVerdict`, `common.mjs`)

Names are **kept as the source wrote them**, Chinese, Tamil, Arabic, Japanese, Korean and Thai included (decided 27 Sep, reversing a 26 Sep English-only rule that broke names like `一品味海鲜火锅（Pulau Ketam）` → `(Pulau Ketam)`).

| Rule | Example |
|---|---|
| Maths-bold and fullwidth letters become plain | `𝐅𝐓 𝐈𝐓 𝐒𝐎𝐋𝐔𝐓𝐈𝐎𝐍` → `FT IT SOLUTION` |
| Uncommon scripts (Burmese, Bengali) are removed; the English stays | `နီနီ… - NI NI Int'l Sdn Bhd` → `NI NI Int'l Sdn Bhd` |
| Symbols at either end are trimmed | `#kkbsteak` → `kkbsteak`, `czking_` → `czking` |
| Extra spaces are tidied | `( HQ )` → `(HQ)` |
| Trailing dots and commas go; `..` inside a name becomes a space | `Kiosk ABAH..` → `Kiosk ABAH` |
| Broken and fullwidth brackets are fixed | `Restaurant 3T (` → `Restaurant 3T`, `（M）` → `(M)` |
| An address pasted after a name is cut at the street word | `Char Kwey Teow Republik Lorong G1…, 55100 Ampang` → `Char Kwey Teow Republik` |
| Bullets between words **stay** | `Dink Arena • USJ` |
| Every word is capitalised, except joining words mid-name; words that already have a capital and ALL-CAPS names are left alone | `restoran ali dan anak` → `Restoran Ali dan Anak`; `iPhone` unchanged |
| Common abbreviations go uppercase | `kl` → `KL`, `ss2` → `SS2`, `plt` → `PLT` |

**Names that drop the listing:**

| Name | Example |
|---|---|
| Empty, or nothing left after cleaning | `· · ·`, a Burmese-only name |
| Only a place or an address | `Taman Asa Jaya`, `Lorong Keramat 12` |
| Starts like an address, with no business word (reviewed over 1,242 examples) | `Taman Minang`, `Unit Dialisis` |
| Says the business is closed | `Yong Sheng (Closed)` |

Malls are exempt from the place rules (`Nilai Square`, `Setia Walk Mall`). A name that only *ends* in a place word stays (`SS2 Fatty Duck`).

### 3. Duplicates (`assignIds`, `merge.mjs`)

The same name in the same area is one business: extra branches within a source, and the same place across sources, are merged into one listing. The best source supplies the name (Overture, then OSM, then DBKL), and empty fields such as website, address and map pin are filled from the others. Names are compared across all scripts, so `Restoran 春景` and `Restoran 龙门` stay two businesses.

### 4. Non-businesses (`nonBusiness.mjs`)

The test for every listing: **could it claim its page, pass SSM verification and want other businesses to find it?** Removed rows are written to `data/seed/nonbusiness.csv` with their reason.

| Removed | Count |
|---|---:|
| Government schools (SK, SMK, SJK, SRA, KAFA, MRSM…) | 1,683 |
| Public hospitals, wards, government clinics | 710 |
| Public universities and government skills institutes | 567 |
| Residences (condos, apartments, SOHOs, their pools) | 441 |
| Street markets (pasar malam, tani, pagi) | 388 |
| Public sports fields, pools, courts | 348 |
| Associations and non-profits (kept aside as partner leads) | 145 |
| Government offices and statutory bodies | 132 |
| Hawker centres and Ramadan bazaars | 62 |
| Street addresses used as names | 58 |
| Places of worship | 49 |
| Public housing and quarters | 46 |
| Office-floor addresses and landmarks | 38 |
| Military, police, prison | 29 |
| Stations and toll plazas | 6 |
| Adult | 1 |

**When unsure, keep.** Any name with a trading word stays (`Kafe Pemuda Masjid`, `7-11 USJ7 LRT Station`, `IIUM Bookshop`, `Malaysian Institute of Baking`). So do private hospitals and schools, food courts, malls, petrol stations and company head offices (`Wisma …`, `Menara …`).

### 5. Ids and map pins

- **Ids** are the slug of the name (`klang-parade`). A name with non-Latin letters gets the source id appended (`klang-parade-26509eff` for `皇龍海鮮大酒家 Klang Parade`), and one with no Latin letters is `biz-<source id>`.
- **Map pins** come from the source's own point (Overture, OSM), never from geocoding the address text. 87% of listings have one.
- **Directory order** (not stored in the list): members first, then a shuffle that changes daily. Latin-script names come before others.

## Result

**142,936 listings** in 16 categories across 26 areas. See `ABRI-directory-summary.md` for the per-category table and the full list of what was left out.

## Rules that stay true

- **Imported data never fills `domain`, phone, WhatsApp or email.** See `ABRI-data-sources.md` → "Rules for imported data".
- **Claimed listings are never touched.** Import and sync only write unclaimed (L0) rows with no account.
- **Every removal is recorded:**
  - name verdicts in `data/sources/<source>/names.csv`
  - non-businesses in `data/seed/nonbusiness.csv`
  - each database change in `data/seed/imports/*-names-*.csv`
- **Sync safeguards:**
  - it dry-runs by default and refuses to delete more than 10% of an import without `--force`
  - a listing something still refers to (a follow, a watch) is kept and reported
  - ids move in two steps, so two listings can swap ids in one run
- **One-off rulings** go in `scripts/sources/name-decisions.json`, keyed by source id.
