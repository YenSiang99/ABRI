// The admin Businesses page: list with filters and paging, add, edit, delete,
// and the two claim cases it exists to set up — a claimant whose email matches
// the business's domain (approved on the spot) and one whose email doesn't
// (waits for an admin).
//
// Needs the test API with no mail provider (tests/run-all.mjs blanks
// SMTP_HOST), so link tokens come back in the responses.
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.js";
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
  return { ...r, as: r.status === 200 ? client(r.cookie) : null };
}

const hash = await hashPassword(PASSWORD);
await db.account.upsert({
  where: { email: `${P}admin@e2e.test` },
  update: { isAdmin: true, emailVerified: true, passwordHash: hash, businessId: null },
  create: { email: `${P}admin@e2e.test`, phone: "60100000000", name: "E2E Admin", role: "Admin",
            passwordHash: hash, emailVerified: true, isAdmin: true },
});
const admin = (await login(`${P}admin@e2e.test`)).as;
const member = (await login(`${P}t1@e2e.test`)).as;

// ── Clean slate: last run's listings, removed through the route under test ──
const MATCH_DOMAIN = "adminbiz-match.e2e.test";
let r = await admin("/admin/businesses?id=e2e-admin-biz&pageSize=100");
for (const b of r.data.businesses) {
  await db.follow.deleteMany({ where: { OR: [{ followerId: b.id }, { followedId: b.id }] } });
  assert.equal((await admin(`/admin/businesses/${b.id}`, { method: "DELETE" })).status, 200);
}

// ─────────────────────────────────────────────────────────────────────────
console.log("\n1. Only admins");
assert.equal((await anon("/admin/businesses")).status, 401);
assert.equal((await member("/admin/businesses")).status, 403);
assert.equal((await member("/admin/businesses", { method: "POST", body: { name: "x", category: "Law", location: "Petaling Jaya" } })).status, 403);
ok("logged-out gets 401, a member gets 403, on list and add");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n2. Add");
const base = { name: "E2E Admin Biz Match", category: "Law", location: "Petaling Jaya" };
assert.equal((await admin("/admin/businesses", { method: "POST", body: { ...base, name: "" } })).status, 400);
r = await admin("/admin/businesses", { method: "POST", body: { ...base, domain: "gmail.com" } });
assert.equal(r.status, 400, "a public email domain can't approve claims");
r = await admin("/admin/businesses", { method: "POST", body: { ...base, domain: "not a domain" } });
assert.equal(r.status, 400);
r = await admin("/admin/businesses", { method: "POST", body: { ...base, level: "L4" } });
assert.equal(r.status, 400, "level can't be set from here");
r = await admin("/admin/businesses", { method: "POST", body: { ...base, domain: `https://www.${MATCH_DOMAIN.toUpperCase()}/about`, ssm: "2024-01-000777", whatsapp: "012-345 6789" } });
assert.equal(r.status, 201, JSON.stringify(r.data));
const match = r.data.business;
assert.equal(match.id, "e2e-admin-biz-match");
assert.equal(match.domain, MATCH_DOMAIN, "a pasted URL is stored as a bare lowercase domain");
assert.equal(match.verificationLevel, "L0");
assert.deepEqual(match.claimants, []);
const row = await db.business.findUnique({ where: { id: match.id } });
assert.equal(row.ssmNormalized, "202401000777", "ssm and its normalized copy are written together");
assert.equal(row.whatsapp, "60123456789", "contact fields are stored the way a member's own edit stores them");
ok("created unclaimed at L0, domain cleaned, ssm pair written, bad input refused");

r = await admin("/admin/businesses", { method: "POST", body: { name: "E2E Admin Biz Other", category: "Law", location: "Petaling Jaya" } });
assert.equal(r.status, 201);
const other = r.data.business;
assert.equal(other.domain, null);
for (let i = 1; i <= 3; i++) {
  assert.equal((await admin("/admin/businesses", { method: "POST", body: { name: `E2E Admin Biz Page ${i}`, category: "Retail", location: "Klang" } })).status, 201);
}

// ─────────────────────────────────────────────────────────────────────────
console.log("\n3. List, filters, paging");
r = await admin("/admin/businesses?name=e2e admin biz");
assert.equal(r.data.total, 5, "name filter is case-insensitive and partial");
r = await admin("/admin/businesses?id=e2e-admin-biz&category=retail");
assert.equal(r.data.total, 3);
r = await admin(`/admin/businesses?id=e2e-admin-biz&domain=${MATCH_DOMAIN}`);
assert.deepEqual(r.data.businesses.map((b) => b.id), [match.id]);
r = await admin("/admin/businesses?id=e2e-admin-biz&claimed=yes");
assert.equal(r.data.total, 0);
r = await admin("/admin/businesses?id=e2e-admin-biz&claimed=no&verificationLevel=L0");
assert.equal(r.data.total, 5);
r = await admin("/admin/businesses?id=e2e-admin-biz&verificationLevel=L2");
assert.equal(r.data.total, 0);
ok("each column filter narrows the list");

r = await admin("/admin/businesses?id=e2e-admin-biz&pageSize=2&page=1");
const p1 = r.data;
assert.equal(p1.total, 5); assert.equal(p1.businesses.length, 2); assert.equal(p1.pageSize, 2);
r = await admin("/admin/businesses?id=e2e-admin-biz&pageSize=2&page=3");
assert.equal(r.data.businesses.length, 1, "the last page holds the remainder");
r = await admin("/admin/businesses?id=e2e-admin-biz&pageSize=2&page=2");
assert.ok(!r.data.businesses.some((b) => p1.businesses.some((x) => x.id === b.id)), "pages don't overlap");
r = await admin("/admin/businesses?pageSize=5000");
assert.equal(r.data.pageSize, 100, "page size is capped");
ok("paging: sizes, remainder, no overlap, cap");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n4. Edit");
r = await admin(`/admin/businesses/${other.id}`, { method: "PATCH", body: { domain: "adminbiz-other.e2e.test", email: "hello@adminbiz-other.e2e.test", location: "Klang" } });
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(r.data.business.domain, "adminbiz-other.e2e.test");
assert.equal(r.data.business.email, "hello@adminbiz-other.e2e.test");
assert.equal(r.data.business.location, "Klang");
r = await admin(`/admin/businesses/${other.id}`, { method: "PATCH", body: { domain: "" } });
assert.equal(r.data.business.domain, null, "an empty domain clears it");
assert.equal(r.data.business.email, "hello@adminbiz-other.e2e.test", "fields not sent are left alone");
assert.equal((await admin(`/admin/businesses/${other.id}`, { method: "PATCH", body: { verificationLevel: "L4" } })).status, 400);
assert.equal((await admin("/admin/businesses/nope", { method: "PATCH", body: { name: "x" } })).status, 404);
ok("edit changes only what is sent; level is refused; unknown id is 404");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n5. A claim whose email matches the domain is approved on the spot");
const matchEmail = `${P}adminbiz@${MATCH_DOMAIN}`;
const claim = (email, id) => anon("/businesses/claim", { method: "POST", body: {
  businessId: id, businessName: "E2E Admin Biz", category: "Law", location: "Petaling Jaya", ssm: "202401000888",
  repName: "Claimant", repEmail: email, repPhone: "60120000000", repRole: "Director", password: PASSWORD } });
r = await claim(matchEmail, match.id);
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(r.data.requiresEmailVerification, true);
assert.ok(!r.data.requiresAdminApproval, "no admin needed");
r = await anon(`/auth/verify-claim/${r.data.token}`, { method: "POST" });
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(r.data.account.businessId, match.id, "they own it as soon as the link is opened");
assert.equal((await db.business.findUnique({ where: { id: match.id } })).verificationLevel, "L1");
ok("matching email: link opened -> owner, L1");

r = await admin(`/admin/businesses?id=${match.id}`);
assert.equal(r.data.businesses[0].claimants[0].email, matchEmail);
assert.equal(r.data.businesses[0].claimants[0].claimStatus, "approved");
ok("the table shows who claimed it");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n6. A claim whose email does not match waits for an admin");
r = await claim(`${P}adminbiz-gmail@gmail.com`, other.id);
assert.equal(r.status, 201, JSON.stringify(r.data));
assert.equal(r.data.requiresAdminApproval, true);
const acct = await db.account.findUnique({ where: { email: `${P}adminbiz-gmail@gmail.com` } });
assert.equal(acct.claimStatus, "pending");
ok("non-matching email: pending, needs an admin");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n7. Delete");
await db.follow.create({ data: { followerId: other.id, followedId: `${P}a2` } });
r = await admin(`/admin/businesses/${other.id}`, { method: "DELETE" });
assert.equal(r.status, 409, "a business with network history is refused");
assert.ok(await db.business.findUnique({ where: { id: other.id } }), "and is still there");
await db.follow.deleteMany({ where: { followerId: other.id } });
ok("refused while it has network activity");

r = await admin(`/admin/businesses/${other.id}`, { method: "DELETE" });
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(r.data.accountsDeleted, 1, "the pending claimant goes with it");
assert.equal(await db.business.findUnique({ where: { id: other.id } }), null);
r = await admin(`/admin/businesses/${match.id}`, { method: "DELETE" });
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(await db.account.findUnique({ where: { email: matchEmail } }), null, "the approved claimant is gone too");
assert.equal(await db.networkEvent.count({ where: { subjectBusinessId: match.id } }), 0, "and the claim's own announcement");
assert.ok(await db.account.findUnique({ where: { email: `${P}admin@e2e.test` } }), "an admin account is never deleted");
assert.equal((await admin(`/admin/businesses/${match.id}`, { method: "DELETE" })).status, 404);
ok("delete removes the business, its claimants and the claim's own rows");

// Re-claiming with the same email works again: the point of delete.
r = await admin("/admin/businesses", { method: "POST", body: { ...base, domain: MATCH_DOMAIN } });
assert.equal(r.status, 201);
r = await claim(matchEmail, r.data.business.id);
assert.equal(r.status, 200, "the same email can claim the recreated listing");
ok("delete then add again: the same email can claim again");

for (const b of (await admin("/admin/businesses?id=e2e-admin-biz&pageSize=100")).data.businesses) {
  await admin(`/admin/businesses/${b.id}`, { method: "DELETE" });
}
await db.emailVerificationToken.deleteMany({ where: { email: { startsWith: `${P}adminbiz` } } });

console.log(`\n${pass} checks passed.`);
await db.$disconnect();
