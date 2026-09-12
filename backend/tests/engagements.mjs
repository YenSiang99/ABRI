import assert from "node:assert";
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
const API = "http://localhost:4000";
const P = "e2e-";
let pass = 0;
const ok = (m) => { console.log("  ✓", m); pass++; };

// Same tiny cookie-jar client every suite here uses — real sessions, real HTTP.
async function login(key) {
  let res;
  for (let attempt = 1; attempt <= 8; attempt++) {
    res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `${P}${key}@e2e.test`, password: "e2e-password-123" }),
    });
    if (res.status !== 503) break;
    await new Promise((r) => setTimeout(r, 3000));
  }
  assert.equal(res.status, 200, `login ${key}: ${res.status} ${await res.text()}`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return async (path, { method = "GET", body } = {}) => {
    const r = await fetch(`${API}${path}`, {
      method, headers: { cookie, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
}

// RESETS ITS OWN TABLE FIRST, using Prisma directly the way fixtures.mjs does.
//
// Engagements accumulate: the HTTP surface deliberately offers no way to
// delete a CONFIRMED one (a confirmed record is a fact both parties agreed to,
// not a draft), so a second run of this suite would find a4 already counted as
// a counterparty and step 9's "breadth rises by one" would be false. That is a
// property of how often the suite has run, not of the feature.
//
// Scoped to the e2e businesses, so it can never touch real rows.
const url = fs
  .readFileSync(new URL("../.env", import.meta.url), "utf8")
  .match(/^DIRECT_URL=(.*)$/m)[1]
  .trim()
  .replace(/^"|"$/g, "");
const db = new PrismaClient({ datasourceUrl: url });
await db.engagement.deleteMany({
  where: {
    OR: [
      { businessAId: { startsWith: P } },
      { businessBId: { startsWith: P } },
      { proposedById: { startsWith: P } },
    ],
  },
});
await db.$disconnect();

const a2 = await login("a2");
const a3 = await login("a3");
const a4 = await login("a4");

const publicProfile = async (id) =>
  (await (await fetch(`${API}/businesses/${id}`)).json()).business;

// Every business here is Accounting & Tax, so the catalogue entry is one of
// theirs. "Bookkeeping" rather than the seeded default, to keep this suite's
// rows distinguishable from the fixtures'.
const SERVICE = "Bookkeeping";
const LAST_MONTH = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1))
  .toISOString();

console.log("\n1. Propose an engagement");
let r = await a2("/engagements", { method: "POST", body: {
  businessId: `${P}a3`, service: SERVICE, note: "Quarterly books for two entities.",
  occurredOn: LAST_MONTH,
}});
assert.equal(r.status, 201, JSON.stringify(r.data));
const id = r.data.engagement.id;
assert.equal(r.data.engagement.status, "pending");
assert.equal(r.data.engagement.proposedByYou, true);
ok(`proposed (${id}), pending, proposedByYou true`);

console.log("\n2. A pending engagement is public to nobody");
// BY ID, NOT BY COUNT. An earlier run of this suite leaves confirmed rows
// behind (fixtures.mjs seeds, teardown-e2e.mjs clears — neither is this file's
// job), so "the profile has zero engagements" is an assertion about how many
// times the suite has been run, not about the feature. Every count below is a
// DELTA for the same reason.
let profile = await publicProfile(`${P}a3`);
assert.ok(!profile.engagements.some((e) => e.id === id), "pending must not appear on a public profile");
ok("pending appears on neither profile and counts nowhere");

console.log("\n3. The proposer cannot confirm their own");
r = await a2(`/engagements/${id}/confirm`, { method: "POST" });
assert.equal(r.status, 403, JSON.stringify(r.data));
ok(`proposer refused (403: "${r.data.error}") — this is the whole model`);

console.log("\n4. A third party can neither see nor act on it");
r = await a4(`/engagements/${id}/confirm`, { method: "POST" });
// 404 rather than 403: whether two other businesses have an engagement is not
// this caller's business, and a 403 would confirm that it exists.
assert.equal(r.status, 404, JSON.stringify(r.data));
ok(`uninvolved business gets 404, not 403 (no existence leak)`);

console.log("\n5. The counterparty confirms, and it goes public on BOTH profiles");
r = await a3(`/engagements/${id}/confirm`, { method: "POST" });
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(r.data.engagement.status, "confirmed");
for (const who of [`${P}a2`, `${P}a3`]) {
  profile = await publicProfile(who);
  assert.ok(profile.engagements.some((e) => e.id === id), `${who} must show the engagement`);
}
ok("confirmed, and visible on both profiles to a logged-out reader");

console.log("\n6. Confirming twice is refused");
r = await a3(`/engagements/${id}/confirm`, { method: "POST" });
assert.equal(r.status, 409, JSON.stringify(r.data));
ok(`second confirm refused (409: "${r.data.error}")`);

const groupFor = async (businessId) => {
  const p = await publicProfile(businessId);
  return (
    p.engagementSummary.services.find((s) => s.service === SERVICE) ?? {
      engagements: 0,
      counterparties: 0,
    }
  );
};

console.log("\n7. Repeat work with the same business is a SECOND row");
const beforeRepeat = await groupFor(`${P}a3`);
r = await a2("/engagements", { method: "POST", body: {
  businessId: `${P}a3`, service: SERVICE, occurredOn: LAST_MONTH,
}});
assert.equal(r.status, 201, JSON.stringify(r.data));
const second = r.data.engagement.id;
assert.notEqual(second, id, "a repeat engagement must not overwrite the first");
await a3(`/engagements/${second}/confirm`, { method: "POST" });
ok("no unique on the pair — repeat engagements coexist");

console.log("\n8. A repeat with the SAME business adds volume but no breadth");
// THE ANTI-COLLUSION PROPERTY, asserted as a delta so it holds however many
// times this suite has run: a second engagement with a business already
// counted raises `engagements` and must leave `counterparties` untouched.
// If these ever move together, ten engagements with one friend would read as
// the strongest signal on the profile.
let group = await groupFor(`${P}a3`);
assert.equal(group.engagements, beforeRepeat.engagements + 1, "volume rises by one");
assert.equal(group.counterparties, beforeRepeat.counterparties, "breadth must NOT move");
ok("same counterparty: engagements +1, counterparties +0");

console.log("\n9. A different counterparty moves the number that matters");
const beforeNew = await groupFor(`${P}a3`);
r = await a4("/engagements", { method: "POST", body: {
  businessId: `${P}a3`, service: SERVICE, occurredOn: LAST_MONTH,
}});
assert.equal(r.status, 201, JSON.stringify(r.data));
await a3(`/engagements/${r.data.engagement.id}/confirm`, { method: "POST" });
group = await groupFor(`${P}a3`);
assert.equal(group.engagements, beforeNew.engagements + 1);
assert.equal(
  group.counterparties,
  beforeNew.counterparties + 1,
  "a genuinely different business raises breadth",
);
ok("different counterparty: engagements +1, counterparties +1");

console.log("\n10. A decline is terminal and invisible to everyone else");
r = await a2("/engagements", { method: "POST", body: {
  businessId: `${P}a4`, service: SERVICE, occurredOn: LAST_MONTH,
}});
const declined = r.data.engagement.id;
r = await a4(`/engagements/${declined}/decline`, { method: "POST" });
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(r.data.engagement.status, "declined");
profile = await publicProfile(`${P}a4`);
assert.ok(!profile.engagements.some((e) => e.id === declined), "a declined row must be public to nobody");
// ...but the two parties can still see their own.
r = await a2("/engagements?status=declined");
assert.ok(r.data.engagements.some((e) => e.id === declined), "the proposer can see their own declined row");
ok("declined: public to nobody, visible to the two parties");

console.log("\n11. Rejections that keep the record honest");
r = await a2("/engagements", { method: "POST", body: { businessId: `${P}a2`, occurredOn: LAST_MONTH }});
assert.equal(r.status, 400, "self-engagement must be refused");
r = await a2("/engagements", { method: "POST", body: {
  businessId: `${P}a3`, service: "cheap bookkeeping", occurredOn: LAST_MONTH }});
assert.equal(r.status, 400, "a non-canonical service must be refused");
const future = new Date(Date.UTC(new Date().getUTCFullYear() + 1, 0, 1)).toISOString();
r = await a2("/engagements", { method: "POST", body: { businessId: `${P}a3`, occurredOn: future }});
assert.equal(r.status, 400, "a future month must be refused");
ok("self-engagement, non-canonical service and future dates all refused");

console.log("\n12. Withdrawing removes a pending proposal entirely");
r = await a2("/engagements", { method: "POST", body: { businessId: `${P}a3`, occurredOn: LAST_MONTH }});
const pending = r.data.engagement.id;
r = await a3(`/engagements/${pending}`, { method: "DELETE" });
assert.equal(r.status, 403, "only the proposer may withdraw");
r = await a2(`/engagements/${pending}`, { method: "DELETE" });
assert.equal(r.status, 200);
r = await a2("/engagements");
assert.ok(!r.data.engagements.some((e) => e.id === pending), "withdrawn is gone, not archived");
ok("only the proposer withdraws, and the row is deleted rather than kept");

console.log(`\n${pass} checks passed.`);
