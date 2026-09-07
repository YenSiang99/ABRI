// The directory — GET /businesses. Run e2e-setup.mjs first, with the backend
// up.
//
// Two things this file exists to hold:
//
//   1. THE LADDER. An anonymous visitor gets the verification level (the
//      honest answer to "are they real", never for sale) and NOT the vouch
//      count (the depth, which a free account buys). Steps 1 and 2 are that
//      rule from both sides.
//
//   2. THAT BROWSING SURVIVED IDENTIFYING. This route absorbed the lookup's
//      registration-number and domain matching when /app/check was deleted.
//      Step 6 is the regression that would catch category browsing being lost
//      to it — the failure that would make the directory useless for the job
//      it had first.
import { PrismaClient } from "@prisma/client";
import assert from "node:assert";
import fs from "node:fs";
const url = fs.readFileSync(new URL("../.env", import.meta.url), "utf8").match(/^DIRECT_URL=(.*)$/m)[1].trim().replace(/^"|"$/g,"");
const db = new PrismaClient({ datasourceUrl: url });
const API = "http://localhost:4000";
const P = "e2e-";
let pass = 0; const ok = (m) => { console.log("  ✓", m); pass++; };
for (let i = 1; i <= 6; i++) { try { await db.$queryRaw`select 1`; break; } catch { await new Promise(r=>setTimeout(r,4000)); } }

async function login(email) {
  let res;
  for (let attempt = 1; attempt <= 8; attempt++) {
    res = await fetch(`${API}/auth/login`, { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "e2e-password-123" }) });
    if (res.status !== 503) break;
    await new Promise((r) => setTimeout(r, 3000));
  }
  assert.equal(res.status, 200, `login ${email} -> ${res.status}`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return cookie;
}
async function dir(cookie, qs = "") {
  const r = await fetch(`${API}/businesses${qs}`, { headers: cookie ? { cookie } : {} });
  return { status: r.status, data: await r.json() };
}

// One identifier to match on. e2e-setup writes no ssm/domain (nothing did
// before the submission route existed), so this file sets its own.
await db.business.update({ where: { id: `${P}target` }, data: {
  ssm: "E2E900011112222", ssmNormalized: "E2E900011112222",
  domain: "e2edir.my", website: "https://www.e2edir.my", verificationLevel: "L2" } });

// Free, Plus and Pro viewers, to prove the ladder is logged-in and not paid.
for (const [id, tier] of [[`${P}a2`,"free"],[`${P}a3`,"plus"],[`${P}a4`,"pro"]]) {
  await db.business.update({ where: { id }, data: { membershipTier: tier } });
}
const free = await login(`${P}a2@e2e.test`);
const plus = await login(`${P}a3@e2e.test`);
const pro  = await login(`${P}a4@e2e.test`);

// ─────────────────────────────────────────────────────────────────────────
console.log("\n1. An anonymous visitor gets no vouch numbers");
let r = await dir(null, "?limit=5");
assert.equal(r.status, 200, "and is not refused — the directory stays public");
for (const b of r.data.businesses) {
  assert.ok(!("vouchCount" in b), `${b.id} leaked vouchCount to an anonymous caller`);
  assert.ok(!("vouchLevel" in b), `${b.id} leaked vouchLevel`);
}
ok("no vouchCount, no vouchLevel, still a 200");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n2. The verification level is NEVER gated");
// The one thing a stranger must always get. It is the answer the whole
// product promises, and "verification cannot be bought" means it is not for
// trade either.
for (const b of r.data.businesses) {
  assert.ok(b.verificationLevel, `${b.id} withheld its verification level`);
}
ok("every anonymous row still carries verificationLevel");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n3. A free account is the whole step — Plus and Pro add nothing");
const [f, p, pr] = await Promise.all([dir(free, "?limit=5"), dir(plus, "?limit=5"), dir(pro, "?limit=5")]);
assert.ok("vouchCount" in f.data.businesses[0], "a logged-in Free member gets the count");
assert.ok("vouchLevel" in f.data.businesses[0], "and the level");
// Byte-identical across the three paid tiers: this ladder rung is about
// having an account, not about paying. Anything tier-shaped belongs in the
// separate network-overlap work, not here.
assert.equal(JSON.stringify(p.data), JSON.stringify(f.data), "Plus sees exactly what Free sees");
assert.equal(JSON.stringify(pr.data), JSON.stringify(f.data), "Pro sees exactly what Free sees");
ok("free = plus = pro; the rung is the session, not the plan");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n4. Paging, and no row seen twice");
r = await dir(free, "?limit=5");
assert.equal(r.data.businesses.length, 5);
assert.equal(r.data.hasMore, true);
const seen = [];
for (let page = 1; page <= 20; page++) {
  const res = await dir(free, `?limit=5&page=${page}`);
  seen.push(...res.data.businesses.map((b) => b.id));
  if (!res.data.hasMore) break;
}
assert.equal(new Set(seen).size, seen.length, "no business appears on two pages");
const total = await db.business.count();
assert.equal(seen.length, total, `walked every row (${seen.length} of ${total})`);
ok(`paged ${seen.length} businesses five at a time, no duplicates, no gaps`);

// ─────────────────────────────────────────────────────────────────────────
console.log("\n5. The cap is clamped, not honoured");
// The whole point of the cap: before it, this route answered every request
// with the entire member list, and a caller could still ask for it.
//
// The cap is 50 and the fixture holds ~34, so it CANNOT BIND without more
// rows — asserting "<= 50" against 34 would pass whether or not a cap
// existed, which is the shape of a test that guards nothing. So make enough
// rows for it to bind, then take them away again.
const BULK = "e2e-bulk-";
await db.business.deleteMany({ where: { id: { startsWith: BULK } } });
await db.business.createMany({
  data: Array.from({ length: 40 }, (_, i) => ({
    id: `${BULK}${String(i).padStart(3, "0")}`,
    name: `E2E Bulk ${String(i).padStart(3, "0")}`,
    category: "IT Consulting",
    location: "Puchong",
    verificationLevel: "L1",
  })),
});
const inflated = await db.business.count();

r = await dir(null, "?limit=99999");
assert.ok(inflated > 50, `the cap must be able to bind — only ${inflated} rows`);
assert.equal(r.data.businesses.length, 50, `expected exactly the cap, got ${r.data.businesses.length}`);
assert.equal(r.data.hasMore, true, "and it says there is more rather than pretending that was everything");
ok(`limit=99999 returned 50 of ${inflated} rows`);

await db.business.deleteMany({ where: { id: { startsWith: BULK } } });

// ─────────────────────────────────────────────────────────────────────────
console.log("\n6. Browsing by CATEGORY survived the identifier matching");
// The regression that matters. "Accounting" is a browse word — it must still
// return every accountant, not just businesses with it in their name.
r = await dir(free, "?search=Accounting");
const categoryOnly = r.data.businesses.filter((b) => !b.name.toLowerCase().includes("accounting"));
assert.ok(categoryOnly.length > 0, "businesses matched on category alone, not just name");
assert.ok(categoryOnly.every((b) => b.matchReason === "name"),
  "a category hit is reported as a name match — the closest honest label");
ok(`"Accounting" returned ${r.data.businesses.length}, ${categoryOnly.length} by category alone`);

// ─────────────────────────────────────────────────────────────────────────
console.log("\n7. And it learned to match identifiers");
r = await dir(free, "?search=E2E%20900011112222");
let hit = r.data.businesses.find((b) => b.id === `${P}target`);
assert.ok(hit, "a spaced registration number finds the business");
assert.equal(hit.matchReason, "ssm");

r = await dir(free, `?search=${encodeURIComponent("https://www.e2edir.my/about")}`);
hit = r.data.businesses.find((b) => b.id === `${P}target`);
assert.ok(hit, "a pasted URL finds the business");
assert.equal(hit.matchReason, "domain");
ok("registration number and pasted URL both resolve, and say which");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n8. Registration still works — the claim search is untouched");
// Register.jsx:261 makes exactly this call, while LOGGED OUT, to let somebody
// find their own unclaimed listing. If this breaks, nobody can join.
r = await dir(null, "?search=E2E&verificationLevel=L0");
assert.equal(r.status, 200, "anonymous claim search is not refused");
assert.ok(r.data.businesses.length > 0, "and finds unclaimed listings");
assert.ok(r.data.businesses.every((b) => b.verificationLevel === "L0"),
  "returning ONLY unclaimed ones — offering a claimed business for claiming is the bug this filter prevents");
ok(`claim search returned ${r.data.businesses.length} unclaimed listings, logged out`);

// ─────────────────────────────────────────────────────────────────────────
console.log("\n9. Contact details are on no row, at any tier");
// Unchanged by the ladder, deliberately: BusinessCard has nowhere to render a
// phone number, so shipping one would send every listing's contact details to
// every session to serve a card that does not display them.
for (const [label, cookie] of [["anonymous", null], ["free", free], ["pro", pro]]) {
  const res = await dir(cookie, "?limit=50");
  const raw = JSON.stringify(res.data);
  for (const key of ["phone", "whatsapp", "membershipTier", "ssmNormalized"]) {
    assert.ok(!raw.includes(`"${key}"`), `${label} directory leaked ${key}`);
  }
}
ok("no phone, whatsapp, membershipTier or ssmNormalized for anyone");

console.log(`\n${pass} checks passed.`);
await db.$disconnect();
