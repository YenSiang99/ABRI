// SSM submission and review — POST /businesses/me/ssm, GET
// /admin/ssm-reviews, and the two admin decisions. Run e2e-setup.mjs first.
//
// The thing under test is the DERIVED pending state. There is no ssmStatus
// column: "waiting on an admin" is `ssm != null && level L1`, and every
// assertion here is really checking that the queue, the member's own view and
// the decisions all read that same pair the same way.
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

const hash = await hashPassword("e2e-password-123");
await db.account.upsert({
  where: { email: `${P}admin@e2e.test` },
  update: { isAdmin: true, emailVerified: true, passwordHash: hash, businessId: null },
  create: { email: `${P}admin@e2e.test`, phone: "60100000000", name: "E2E Admin", role: "Admin",
            passwordHash: hash, emailVerified: true, isAdmin: true },
});

// e2e-t1 is the fixture's only L1 business — the one state that may submit.
// Reset it explicitly rather than assuming: other suites move this row.
await db.business.update({ where: { id: `${P}t1` }, data: { verificationLevel: "L1", ssm: null, ssmNormalized: null } });
await db.networkEvent.deleteMany({ where: { subjectBusinessId: `${P}t1` } });
await db.activityEvent.deleteMany({ where: { businessId: `${P}t1` } });

const t1 = await login(`${P}t1@e2e.test`);
const a2 = await login(`${P}a2@e2e.test`);
const admin = await login(`${P}admin@e2e.test`);

const queueHas = async (id) =>
  (await admin("/admin/ssm-reviews")).data.businesses.some((b) => b.id === id);

// ─────────────────────────────────────────────────────────────────────────
console.log("\n1. Nothing submitted yet, so nothing is queued");
assert.equal(await queueHas(`${P}t1`), false, "an L1 with no number is not waiting on anyone");
ok("an L1 that hasn't submitted is absent from the review queue");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n2. A claimed business submits its number");
let r = await t1("/businesses/me/ssm", { method: "POST", body: { ssm: "202301234567 (1234567-A)" } });
assert.equal(r.status, 200, JSON.stringify(r.data));
let row = await db.business.findUnique({ where: { id: `${P}t1` } });
assert.equal(row.ssm, "202301234567 (1234567-A)", "the number is stored exactly as typed, for the admin to read");
assert.equal(row.ssmNormalized, "2023012345671234567A", "and normalized alongside it, for the lookup to match");
assert.equal(row.verificationLevel, "L1", "submitting does not grant the badge");
ok("both columns written together; the level is untouched");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n3. Pending is derived from those two columns, not stored");
assert.equal(await queueHas(`${P}t1`), true, "ssm set + level L1 IS the queue");
// No status column exists to disagree with the level — this is the assertion
// that would fail the day somebody adds one and forgets to keep it in step.
assert.ok(!("ssmStatus" in row), "no status column exists to drift from verificationLevel");
ok("the queue reads the same two columns the member's own screen does");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n4. Garbage and wrong states are refused");
r = await t1("/businesses/me/ssm", { method: "POST", body: { ssm: "12" } });
assert.equal(r.status, 400, "too short is refused");
// PATCH /me must still not be a second door onto this column.
r = await t1("/businesses/me", { method: "PATCH", body: { ssm: "999" } });
assert.equal(r.status, 400, `PATCH /me must still refuse ssm, got ${r.status}`);
assert.match(r.data.error, /ssm/, "and say so by name");
row = await db.business.findUnique({ where: { id: `${P}t1` } });
assert.equal(row.ssm, "202301234567 (1234567-A)", "neither attempt changed the stored number");
ok("length bounds hold, and PROTECTED_FIELDS still blocks the edit route");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n5. An already-verified business can't rewrite its number");
r = await a2("/businesses/me/ssm", { method: "POST", body: { ssm: "999888777666" } });
assert.equal(r.status, 400, `an L2 must be refused, got ${r.status}`);
assert.match(r.data.error, /already verified/i, "and told to ask an admin");
ok("L2 is refused — a verified number is not the owner's to overwrite");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n6. The admin approves it");
r = await admin(`/admin/businesses/${P}t1/verify-ssm`, { method: "POST" });
assert.equal(r.status, 200, JSON.stringify(r.data));
row = await db.business.findUnique({ where: { id: `${P}t1` } });
assert.equal(row.verificationLevel, "L2");
assert.equal(row.ssm, "202301234567 (1234567-A)", "approval keeps the number it ruled on");
assert.equal(await queueHas(`${P}t1`), false, "and it leaves the queue");

const events = await db.activityEvent.findMany({ where: { businessId: `${P}t1` } });
assert.equal(events.filter((e) => e.type === "ssm_verified").length, 1, "exactly one ssm_verified");
assert.equal(events.find((e) => e.type === "ssm_verified").actorBusinessId, null, "no actor — an admin did it");
const netEvents = await db.networkEvent.findMany({ where: { subjectBusinessId: `${P}t1`, type: "business_verified" } });
assert.equal(netEvents.length, 1, "and one business_verified on the network feed");
ok("L2 granted, member notified once, network told once, queue cleared");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n7. The verified number is now findable by lookup");
// Through a session rather than anonymously: the limiter keys on the account
// when there is one, so this suite doesn't share a bucket with e2e-lookup.mjs,
// which deliberately exhausts the anonymous budget from this same address.
const found = await t1(`/businesses/lookup?q=${encodeURIComponent("2023 0123 4567")}`);
assert.equal(found.status, 200, JSON.stringify(found.data));
const foundData = found.data;
assert.ok(foundData.matches.some((m) => m.id === `${P}t1`),
  "the number a member submitted is the number a counterparty can check");
ok("submission feeds the lookup — the two halves are one feature");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n8. A rejection clears the number and says what to do next");
await db.business.update({ where: { id: `${P}t1` }, data: { verificationLevel: "L1" } });
await db.activityEvent.deleteMany({ where: { businessId: `${P}t1` } });
r = await t1("/businesses/me/ssm", { method: "POST", body: { ssm: "000000000000" } });
assert.equal(r.status, 200);

// Counted BEFORE the decision. Step 6's business_verified row still exists —
// correctly, since a NetworkEvent is never deleted; dropping back to L1 is
// what makes it invisible in the feed. The assertion is that the rejection
// adds nothing, not that the table is empty.
const netBefore = await db.networkEvent.count({ where: { subjectBusinessId: `${P}t1` } });
r = await admin(`/admin/businesses/${P}t1/reject-ssm`, { method: "POST" });
assert.equal(r.status, 200, JSON.stringify(r.data));
row = await db.business.findUnique({ where: { id: `${P}t1` } });
assert.equal(row.ssm, null, "the rejected number is cleared, not flagged");
assert.equal(row.verificationLevel, "L1", "and the level is unchanged");
assert.equal(await queueHas(`${P}t1`), false, "so it leaves the queue by the same derived rule");

const rejected = await db.activityEvent.findMany({ where: { businessId: `${P}t1`, type: "ssm_rejected" } });
assert.equal(rejected.length, 1, "the member is told");
// The network is never told somebody failed a check — the feed carries
// third-party positive acts only.
const netAfter = await db.networkEvent.count({ where: { subjectBusinessId: `${P}t1` } });
assert.equal(netAfter, netBefore, "and the network is told nothing new");
ok("cleared, member told, network silent, resubmittable");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n9. And they can submit a corrected number straight away");
r = await t1("/businesses/me/ssm", { method: "POST", body: { ssm: "202398765432" } });
assert.equal(r.status, 200, "a rejection is not a dead end");
assert.equal(await queueHas(`${P}t1`), true, "back in the queue");
ok("a corrected number goes through the same door");

console.log(`\n${pass} checks passed.`);
await db.$disconnect();
