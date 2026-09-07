// Check a business — GET /businesses/lookup. Run e2e-setup.mjs first, with
// the backend up.
//
// The assertion this file exists for is step 5: a business ABRI has never
// heard of returns 200 with an empty list, NOT a 404 and not an error. The
// whole feature rests on "no record" being an ordinary answer rather than a
// failure, because at current membership it is the common one — and because
// ABRI has no registry access, so it is the only honest thing a miss can mean.
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.js";
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
  return async (path, o = {}) => {
    const r = await fetch(`${API}${path}`, { method: o.method ?? "GET",
      headers: { cookie, ...(o.body ? { "Content-Type": "application/json" } : {}) },
      body: o.body ? JSON.stringify(o.body) : undefined });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
}
const anon = async (path) => {
  const r = await fetch(`${API}${path}`);
  return { status: r.status, data: await r.json().catch(() => null) };
};
const look = async (client, q) => (await client(`/businesses/lookup?q=${encodeURIComponent(q)}`)).data;

// Fixtures this file owns. e2e-setup seeds no ssm/domain/website (nothing
// does — the column was null on every row in the database before the
// submission route existed), so the identifiers under test are set here.
// ssm AND ssmNormalized together — the lookup matches on the second, and a
// fixture that set only the first would be testing a state the two writers of
// this column cannot produce.
await db.business.update({ where: { id: `${P}target` }, data: {
  ssm: "E2E202301234567", ssmNormalized: "E2E202301234567",
  domain: "e2etarget.my", website: "https://www.e2etarget.my" } });
await db.business.update({ where: { id: `${P}a4` }, data: {
  ssm: "E2E1234567-A", ssmNormalized: "E2E1234567A", domain: null, website: null } });

const member = await login(`${P}asker@e2e.test`);

// Wait out any anonymous rate-limit budget this file spent on a previous run.
//
// Step 10 deliberately exhausts it — that is the assertion — and the limiter
// is a 60-second fixed window keyed on IP for anonymous callers. Running the
// suite twice inside a minute would otherwise fail at step 1 with a 429 that
// looks like a lookup bug rather than the previous run's residue.
//
// Logged-in calls are unaffected (the limiter keys on the account), so this
// only guards the anonymous steps.
for (let waited = 0; waited <= 70; waited += 5) {
  const probe = await anon("/businesses/lookup?q=E2E");
  if (probe.status !== 429) break;
  if (waited === 0) console.log("  … anonymous budget spent by a previous run; waiting for the window");
  await new Promise((r) => setTimeout(r, 5000));
}

// ─────────────────────────────────────────────────────────────────────────
console.log("\n1. A name substring finds the business, and says so");
let d = await look(anon, "E2E Recommended");
const byName = d.matches.find((m) => m.id === `${P}target`);
assert.ok(byName, "name match found");
assert.equal(byName.matchReason, "name", "reported as a name match");
assert.equal(byName.standing, "listed", "an L2 business reads as listed, not unclaimed");
ok(`name match, matchReason "name"`);

// ─────────────────────────────────────────────────────────────────────────
console.log("\n2. One registration number, however it was typed");
// The three shapes a real SSM number arrives in. All must reach one business.
for (const form of ["E2E202301234567", "E2E 2023 0123 4567", "E2E202301234567 (1234567-A)"]) {
  const res = await look(anon, form);
  const hit = res.matches.find((m) => m.id === `${P}target`);
  assert.ok(hit, `"${form}" found the business`);
  assert.equal(hit.matchReason, "ssm", `"${form}" reported as an ssm match`);
}
ok("letterhead, spaced and bare forms all resolve to one business");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n3. The old pre-2016 format works too");
d = await look(anon, "E2E1234567-A");
assert.ok(d.matches.some((m) => m.id === `${P}a4`), "old-format number found");
ok("\"1234567-A\" style number matches");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n4. An identifier match outranks a name match");
// Constructed deliberately: "E2E" is a substring of every fixture's NAME and
// also of e2e-target's registration number, so one query hits both paths and
// the ordering is the only thing under test. A member who pasted a number
// must not have to scroll past nine name matches to find it.
d = await look(anon, "E2E");
assert.ok(d.matches.length > 1, "the query matched several businesses");
const reasons = d.matches.map((m) => m.matchReason);
assert.ok(reasons.includes("ssm") && reasons.includes("name"), "both bands are present");
// Band ordering, not a specific id: BOTH fixtures carry a registration number
// containing "E2E", so both are genuine ssm matches and which of the two sorts
// first is alphabetical. The invariant is that no name match outranks an
// identifier match — a member who pasted a number must not scroll past loose
// name matches to reach it.
assert.equal(
  reasons.lastIndexOf("ssm") < reasons.indexOf("name"), true,
  `identifier matches must all precede name matches, got ${reasons.join(",")}`,
);
ok(`${reasons.filter((r) => r === "ssm").length} ssm matches ranked above ${reasons.filter((r) => r === "name").length} name matches`);

// ─────────────────────────────────────────────────────────────────────────
console.log("\n5. A business ABRI has never heard of is a 200, not a 404");
const missRes = await anon(`/businesses/lookup?q=${encodeURIComponent("Nonexistent Holdings Sdn Bhd")}`);
assert.equal(missRes.status, 200, `a miss must be 200, got ${missRes.status}`);
assert.deepEqual(missRes.data.matches, [], "and an empty list");
assert.ok(!("error" in missRes.data), "with no error key — a miss is not a failure");
// A half-typed query answers the same way, so the field can be typed into
// without a 400 flashing under it mid-word.
const shortRes = await anon("/businesses/lookup?q=a");
assert.equal(shortRes.status, 200);
assert.deepEqual(shortRes.data.matches, []);
ok("miss and half-typed query both answer 200 with an empty list");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n6. A pasted URL or email address resolves to the business");
for (const form of ["https://www.e2etarget.my/about", "e2etarget.my", "accounts@e2etarget.my", "HTTP://E2ETarget.MY"]) {
  const res = await look(anon, form);
  const hit = res.matches.find((m) => m.id === `${P}target`);
  assert.ok(hit, `"${form}" found the business`);
  assert.equal(hit.matchReason, "domain", `"${form}" reported as a domain match`);
}
ok("scheme, www, path, port-less host and email local-part all stripped");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n7. Anonymous callers get the public half and nothing more");
d = await look(anon, "E2E Recommended");
const raw = JSON.stringify(d);
for (const key of ["phone", "whatsapp", "membershipTier", "passwordHash", "isFoundingMember"]) {
  assert.ok(!raw.includes(`"${key}"`), `an anonymous lookup must not carry ${key}`);
}
// The vouch numbers moved behind a session in Sep 2026, on BOTH this route
// and the directory, so the two surfaces cannot disagree about what a
// stranger is worth showing. What an anonymous visitor keeps is the
// verification level — the honest answer to "are they real", which is this
// screen's whole promise and is never for sale.
assert.ok(!("vouchCount" in d.matches[0]), "the vouch count needs an account");
assert.ok(d.matches[0].verificationLevel, "the verification level never does");
assert.ok(!("vouchesReceived" in d.matches[0]), "voucher names are never on this route, at any tier");
// The internal lookup key must never leave the server, at any level or to
// any viewer — it is a derived index, not a fact about the business.
assert.ok(!raw.includes("ssmNormalized"), "ssmNormalized is server-side only");
ok("level yes; count, contact, billing and lookup key all withheld");

d = await look(member, "E2E Recommended");
assert.ok("vouchCount" in d.matches[0], "and a free account is what reveals it");
ok("a session turns the count on — a real number, not a blurred one");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n7b. An UNVERIFIED registration number is not published");
// The number is a member's unchecked assertion until an admin rules on it.
// Publishing it under a "Claimed" badge would put a number ABRI has not
// verified on a page whose whole premise is that ABRI verifies things.
await db.business.update({ where: { id: `${P}t1` }, data: {
  verificationLevel: "L1", ssm: "111122223333", ssmNormalized: "111122223333" } });
d = await look(anon, "E2E T1");
let pending = d.matches.find((m) => m.id === `${P}t1`);
assert.ok(pending, "the business is still findable");
assert.ok(!("ssm" in pending), "but its unverified number is withheld");
// Still MATCHABLE, though — a counterparty who was given the number can
// confirm it belongs to this business without ABRI publishing it.
d = await look(anon, "111122223333");
assert.ok(d.matches.some((m) => m.id === `${P}t1`), "an unverified number still matches a lookup");

await db.business.update({ where: { id: `${P}t1` }, data: { verificationLevel: "L2" } });
d = await look(anon, "E2E T1");
pending = d.matches.find((m) => m.id === `${P}t1`);
assert.equal(pending.ssm, "111122223333", "and it publishes once an admin has verified it");
ok("withheld at L1, published at L2, matchable at both");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n8. Contact details follow contactVisibility, not this route");
// Free owner: withheld from a logged-in member, and the reason names the
// blocker that would still be standing if they did as they were told.
await db.business.update({ where: { id: `${P}target` }, data: { membershipTier: "free" } });
d = await look(member, "E2E Recommended");
let hit = d.matches.find((m) => m.id === `${P}target`);
assert.equal(hit.contactLocked, true);
assert.equal(hit.contactLockedReason, "owner_plan", "a free owner blocks before an anonymous viewer does");

// Plus owner + logged-in viewer: both conditions met, so it crosses.
await db.business.update({ where: { id: `${P}target` }, data: {
  membershipTier: "plus", phone: "03-1234 5678" } });
d = await look(member, "E2E Recommended");
hit = d.matches.find((m) => m.id === `${P}target`);
assert.equal(hit.contactLocked, false, "a Plus owner's details reach a logged-in member");
assert.equal(hit.phone, "03-1234 5678");

// Same business, anonymous: the viewer half of the gate now fails.
d = await look(anon, "E2E Recommended");
hit = d.matches.find((m) => m.id === `${P}target`);
assert.equal(hit.contactLocked, true);
assert.equal(hit.contactLockedReason, "viewer_anonymous");
assert.ok(!("phone" in hit), "the key is absent, not nulled");
ok("owner_plan, then visible, then viewer_anonymous — the existing rule, unchanged");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n9. An unclaimed listing reads as unclaimed, not as a member");
d = await look(anon, "E2E Unclaimed");
hit = d.matches.find((m) => m.id === `${P}t0`);
assert.ok(hit, "the T0 listing is findable — it is a record ABRI holds");
assert.equal(hit.standing, "unclaimed", "and it must not read as 'on ABRI'");
ok("T0 is a third answer, distinct from listed and from missing");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n10. The lookup is rate limited");
// 30 per minute per IP. Fire past it and the next one is refused with a
// Retry-After rather than a generic error.
let limited = null;
for (let i = 0; i < 40; i++) {
  const r = await fetch(`${API}/businesses/lookup?q=E2E%20Recommended`);
  if (r.status === 429) { limited = r; break; }
}
assert.ok(limited, "the limiter tripped within 40 requests");
assert.ok(limited.headers.get("retry-after"), "429 carries Retry-After");
assert.ok((await limited.json()).error, "and a message the client can render");
ok(`rate limited with Retry-After: ${limited.headers.get("retry-after")}s`);

console.log(`\n${pass} checks passed.`);
await db.$disconnect();
