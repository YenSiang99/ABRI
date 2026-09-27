import { prisma } from "../prisma.js";

// The directory's browse order: members first, then everyone else in an order
// that changes once a day.
//
// WHY ROTATE AT ALL. Sorted A–Z, the same two dozen businesses whose names
// start with "A" hold page one forever, and 145,000 seeded listings means page
// one is the only page most visitors see. A daily shuffle spreads that
// exposure without inventing a ranking nobody earned.
//
// WHY DAILY, NOT PER REQUEST. A fresh shuffle per request would reorder the
// list between page 1 and page 2, so paging would repeat some businesses and
// skip others. Seeded by the date, the order holds all day — every page of it
// consistent — and moves on tomorrow.
//
// THE THREE BANDS, in order:
//   0  claimed or verified members (not L0) — the network the product sells
//   1  names starting with a Latin letter or digit
//   2  names starting in another script (Chinese, Tamil, Arabic…) — kept,
//      but after the rest: agreed 27 Sep 2026, page one opens on names most
//      visitors can read
// Within a band, a hash of id + date. Stored as one indexed integer
// (band * 2^28 + a 28-bit hash — a plain Int, so the raw row still
// serialises to JSON) so every page, the last one included, is an index
// read rather than a sort of the whole table.
//
// NO CRON, the same as vouchExpiry.js: the first browse of the day pays for
// the refresh (one UPDATE over the table, a second or two), and every other
// request that day finds it done. A row added or claimed since the refresh
// sits in the right band from tomorrow; until then a new row has no key and
// sorts last.
//
// Search and service-filter results don't use this — they have their own
// order (A–Z and evidence), which is what someone searching wants.

// The date in Malaysia, so the order turns over at midnight there.
function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
}

let refreshedFor = null;
let refreshing = null;

async function ensureDirectoryOrder() {
  const day = today();
  if (refreshedFor === day) return;
  refreshing ??= prisma
    .$executeRaw`
      UPDATE "Business" SET "directoryKey" =
        (CASE
           WHEN "verificationLevel" <> 'L0' THEN 0
           WHEN substring(name from '[[:alpha:][:digit:]]') ~ '^[A-Za-z0-9]' THEN 1
           ELSE 2
         END) * 268435456
        + ('x' || substr(md5(id || ${day}), 1, 7))::bit(28)::int`
    .then(() => {
      refreshedFor = day;
    })
    .finally(() => {
      refreshing = null;
    });
  await refreshing;
}

export { ensureDirectoryOrder };
