// The Founding programme — lib/founding.js, lib/membershipExpiry.js and
// PUT /admin/settings/founding (ABRI-launch-access-plan.md step 4).
//
// While the programme is open every approved claim is a Founding member on
// Pro until the Founding end date. Moving that date moves every business
// still on Founding Pro and nobody else; an expired tier is Free to the gates
// at once and in the column after the sweep; and once the programme closes,
// approvals start on Free. Also: a tier paid for before SSM verification
// waits and starts with a full year at verification (step 6).
//
// Leaves the two settings cleared at the end, which is "open, no end date":
// the state every other suite assumes.
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.js";
import { sweepExpiredMemberships } from "../src/lib/membershipExpiry.js";
import assert from "node:assert";
import { API, TEST_DATABASE_URL } from "./env.mjs";
const db = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
const P = "e2e-";
const PASSWORD = "e2e-password-123";
let pass = 0; const ok = (m) => { console.log("  ✓", m); pass++; };
for (let i = 1; i <= 6; i++) { try { await db.$queryRaw`select 1`; break; } catch { await new Promise(r=>setTimeout(r,4000)); } }

function client(cookie) {
  return async (path, o = {}) => {
    const r = await fetch(`${API}${path}`, { method: o.method ?? "GET",
      headers: { ...(cookie ? { cookie } : {}), ...(o.body ? { "Content-Type": "application/json" } : {}) },
      body: o.body ? JSON.stringify(o.body) : undefined });
    return { status: r.status, data: await r.json().catch(() => null), cookie: r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") };
  };
}
const anon = client(null);
async function login(email) {
  const r = await anon("/auth/login", { method: "POST", body: { email, password: PASSWORD } });
  assert.equal(r.status, 200, `login ${email} -> ${r.status}`);
  return client(r.cookie);
}

// ── Clean slate ─────────────────────────────────────────────────────────────
const old = await db.business.findMany({ where: { id: { startsWith: `${P}founding-` } }, select: { id: true } });
const oldIds = old.map((b) => b.id);
await db.account.deleteMany({ where: { email: { startsWith: `${P}founding` } } });
await db.networkEvent.deleteMany({ where: { subjectBusinessId: { in: oldIds } } });
await db.activityEvent.deleteMany({ where: { OR: [{ businessId: { in: oldIds } }, { actorBusinessId: { in: oldIds } }] } });
await db.business.deleteMany({ where: { id: { in: oldIds } } });

const hash = await hashPassword(PASSWORD);
await db.account.upsert({
  where: { email: `${P}admin@e2e.test` },
  update: { isAdmin: true, emailVerified: true, passwordHash: hash, businessId: null },
  create: { email: `${P}admin@e2e.test`, phone: "60100000000", name: "E2E Admin", role: "Admin",
            passwordHash: hash, emailVerified: true, isAdmin: true },
});
const admin = await login(`${P}admin@e2e.test`);

const day = 24 * 60 * 60 * 1000;
const inDays = (n) => new Date(Date.now() + n * day).toISOString();
const setFounding = (body) => admin("/admin/settings/founding", { method: "PUT", body });

// Claims a new business by the admin path and approves it. Returns the
// owner's client and the business id.
async function founder(n) {
  let r = await anon("/businesses/claim", { method: "POST", body: {
    businessName: `E2E Founding ${n}`, category: "Law", location: "Petaling Jaya", ssm: `20240100090${n}`,
    repName: "Founder", repEmail: `${P}founding-${n}@e2e.test`, repPhone: "60120000000", repRole: "Director", password: PASSWORD,
  } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const businessId = r.data.business.id;
  assert.equal((await anon(`/auth/verify-claim/${r.data.token}`, { method: "POST" })).status, 200);
  const account = await db.account.findUnique({ where: { email: `${P}founding-${n}@e2e.test` } });
  r = await admin(`/admin/claims/${account.id}/approve`, { method: "POST" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return { as: await login(`${P}founding-${n}@e2e.test`), businessId };
}
const row = (id) => db.business.findUnique({ where: { id } });

// ─────────────────────────────────────────────────────────────────────────
console.log("\n1. While the programme is open, an approval is a Founding member on Pro");
let r = await setFounding({ closesAt: null, proEndsAt: inDays(30) });
assert.equal(r.status, 200, JSON.stringify(r.data));
const one = await founder(1);
let b = await row(one.businessId);
assert.equal(b.membershipTier, "pro");
assert.equal(b.membershipTierGrant, "founding");
assert.equal(b.isFoundingMember, true);
assert.equal(b.membershipTierExpiresAt.toISOString(), r.data.proEndsAt, "Pro ends on the Founding end date");
assert.equal((await one.as("/watches")).status, 200, "a Pro feature works");
ok("Founding: the badge, Pro, and the Founding end date as its expiry");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n2. Moving the end date moves every business still on Founding Pro");
r = await setFounding({ closesAt: null, proEndsAt: inDays(60) });
assert.ok(r.data.foundingProMembers >= 1);
b = await row(one.businessId);
assert.equal(b.membershipTierExpiresAt.toISOString(), r.data.proEndsAt);
ok("the founder's expiry followed the new date");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n3. An expired tier is Free at once, and in the column after the sweep");
await setFounding({ closesAt: null, proEndsAt: inDays(-1) });
r = await one.as("/watches");
assert.equal(r.status, 402, `the Pro gate refuses an expired Pro -> ${r.status}`);
assert.equal((await row(one.businessId)).membershipTier, "pro", "before the sweep the column still says Pro");
await sweepExpiredMemberships();
b = await row(one.businessId);
assert.equal(b.membershipTier, "free");
assert.equal(b.membershipTierGrant, null);
assert.equal(b.isFoundingMember, true, "the badge outlives the Pro");
ok("gates are exact; the sweep catches the column up; the badge stays");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n4. Once the programme closes, approvals start on Free");
await setFounding({ closesAt: inDays(-1), proEndsAt: null });
const two = await founder(2);
b = await row(two.businessId);
assert.equal(b.membershipTier, "free");
assert.equal(b.isFoundingMember, false);
ok("closed: no badge, no Pro");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n5. A tier an admin set by hand ignores the Founding end date");
await setFounding({ closesAt: null, proEndsAt: null });
const three = await founder(3);
r = await admin(`/admin/businesses/${three.businessId}/membership-tier`, { method: "POST", body: { membershipTier: "plus" } });
assert.equal(r.status, 200, JSON.stringify(r.data));
await setFounding({ closesAt: null, proEndsAt: inDays(5) });
b = await row(three.businessId);
assert.equal(b.membershipTierGrant, "admin");
assert.equal(b.membershipTierExpiresAt, null, "the hand-set Plus keeps its own (absent) expiry");
ok("only Founding grants follow the date");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n6. Paying before SSM verification: the year starts at verification");
// e2e-t1 is the fixtures' only L1 business. Reset it; other suites move it.
const t1Before = await row(`${P}t1`);
await db.business.update({ where: { id: `${P}t1` }, data: {
  verificationLevel: "L1", ssm: null, ssmNormalized: null, membershipTier: "free",
  membershipTierGrant: null, membershipTierExpiresAt: null, pendingMembershipTier: null } });
r = await admin(`/admin/businesses/${P}t1/membership-tier`, { method: "POST", body: { membershipTier: "plus", paid: true } });
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(r.data.startsAtVerification, true);
b = await row(`${P}t1`);
assert.equal(b.pendingMembershipTier, "plus", "parked");
assert.equal(b.membershipTier, "free", "and not started");

const t1 = await login(`${P}t1@e2e.test`);
assert.equal((await t1("/businesses/me/ssm", { method: "POST", body: { ssm: "202401000777" } })).status, 200);
r = await admin(`/admin/businesses/${P}t1/verify-ssm`, { method: "POST" });
assert.equal(r.status, 200, JSON.stringify(r.data));
b = await row(`${P}t1`);
assert.equal(b.membershipTier, "plus", "started the day SSM was verified");
assert.equal(b.membershipTierGrant, "paid");
assert.equal(b.pendingMembershipTier, null);
const yearOn = Date.now() + 365 * day;
assert.ok(Math.abs(b.membershipTierExpiresAt.getTime() - yearOn) < 2 * day, "a year from verification");
ok("a paid tier on an L1 waits, then starts with a full year at SSM verification");

r = await admin(`/admin/businesses/${one.businessId}/membership-tier`, { method: "POST", body: { membershipTier: "pro", paid: true } });
assert.equal(r.data.startsAtVerification, false);
b = await row(one.businessId);
assert.equal(b.membershipTier, "pro");
assert.equal(b.membershipTierGrant, "paid");
ok("on an already-verified business it starts at once");

await db.business.update({ where: { id: `${P}t1` }, data: {
  verificationLevel: t1Before.verificationLevel, ssm: t1Before.ssm, ssmNormalized: t1Before.ssmNormalized,
  membershipTier: t1Before.membershipTier, membershipTierGrant: null, membershipTierExpiresAt: null,
  membershipTierStartedAt: t1Before.membershipTierStartedAt, pendingMembershipTier: null } });

// Back to open with no end date — what every other suite expects.
r = await setFounding({ closesAt: null, proEndsAt: null });
assert.equal(r.data.closesAt, null);
assert.equal(r.data.proEndsAt, null);

console.log(`\n${pass} checks passed.`);
await db.$disconnect();
