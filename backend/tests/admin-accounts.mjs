// The admin Users page: list with filters, and delete — the plain case (a
// signup stuck before its confirmation email), a pending claimant, and an
// approved claimant, whose business goes back to unclaimed.
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
const adminEmail = `${P}admin@e2e.test`;
await db.account.upsert({
  where: { email: adminEmail },
  update: { isAdmin: true, emailVerified: true, passwordHash: hash, businessId: null },
  create: { email: adminEmail, phone: "60100000000", name: "E2E Admin", role: "Admin",
            passwordHash: hash, emailVerified: true, isAdmin: true },
});
const admin = (await login(adminEmail)).as;
const member = (await login(`${P}t1@e2e.test`)).as;

// ── Clean slate: last run's listings and accounts ──
const MATCH_DOMAIN = "adminacct-match.e2e.test";
let r = await admin("/admin/businesses?id=e2e-admin-acct&pageSize=100");
for (const b of r.data.businesses) await admin(`/admin/businesses/${b.id}`, { method: "DELETE" });
await db.emailVerificationToken.deleteMany({ where: { email: { startsWith: `${P}adminacct` } } });
await db.account.deleteMany({ where: { email: { startsWith: `${P}adminacct` } } });

const register = (email) => anon("/auth/register", { method: "POST", body: {
  email, password: PASSWORD, name: "E2E Acct", phone: "60120000000", role: "Director" } });
const claim = (email, id) => anon("/businesses/claim", { method: "POST", body: {
  businessId: id, businessName: "E2E Admin Acct", category: "Law", location: "Petaling Jaya", ssm: "202401000999",
  repName: "Claimant", repEmail: email, repPhone: "60120000000", repRole: "Director", password: PASSWORD } });
const byEmail = (email) => db.account.findUnique({ where: { email } });

// ─────────────────────────────────────────────────────────────────────────
console.log("\n1. Only admins; list and filters");
assert.equal((await anon("/admin/accounts")).status, 401);
assert.equal((await member("/admin/accounts")).status, 403);
const someone = await db.account.findFirst({ where: { isAdmin: false }, select: { id: true } });
assert.equal((await member(`/admin/accounts/${someone.id}`, { method: "DELETE" })).status, 403);
ok("logged-out gets 401, a member gets 403, on list and delete");

const stuckEmail = `${P}adminacct-stuck@e2e.test`;
r = await register(stuckEmail);
assert.equal(r.status, 201, JSON.stringify(r.data));
r = await admin(`/admin/accounts?email=${encodeURIComponent("E2E-ADMINACCT-STUCK")}`);
assert.equal(r.status, 200);
assert.deepEqual(r.data.accounts.map((a) => a.email), [stuckEmail], "email filter is case-insensitive and partial");
assert.equal(r.data.accounts[0].emailVerified, false);
assert.equal(r.data.accounts[0].business, null);
r = await admin("/admin/accounts?email=e2e-adminacct&verified=yes");
assert.equal(r.data.total, 0, "verified filter");
r = await admin("/admin/accounts?email=e2e-adminacct&claimStatus=none");
assert.equal(r.data.total, 1, "no-claim filter");
r = await admin("/admin/accounts?pageSize=5000");
assert.equal(r.data.pageSize, 100, "page size is capped");
ok("list, email/verified/claim filters, page cap");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n2. Delete a stuck signup");
const stuck = await byEmail(stuckEmail);
assert.ok(await db.emailVerificationToken.count({ where: { accountId: stuck.id } }) > 0);
r = await admin(`/admin/accounts/${stuck.id}`, { method: "DELETE" });
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(r.data.releasedBusiness, null);
assert.equal(await byEmail(stuckEmail), null);
assert.equal(await db.emailVerificationToken.count({ where: { OR: [{ accountId: stuck.id }, { email: stuckEmail }] } }), 0,
  "its confirmation links go with it");
assert.equal((await admin(`/admin/accounts/${stuck.id}`, { method: "DELETE" })).status, 404);
r = await register(stuckEmail);
assert.equal(r.status, 201, "the same email can register again");
ok("deleted with its tokens; the email registers again");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n3. Admins can't be deleted");
const adminRow = await byEmail(adminEmail);
assert.equal((await admin(`/admin/accounts/${adminRow.id}`, { method: "DELETE" })).status, 400);
assert.ok(await byEmail(adminEmail), "including yourself");
ok("admin delete refused");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n4. A pending claimant: the claim is withdrawn, the business untouched");
r = await admin("/admin/businesses", { method: "POST", body: { name: "E2E Admin Acct Other", category: "Law", location: "Petaling Jaya" } });
assert.equal(r.status, 201);
const other = r.data.business;
const pendingEmail = `${P}adminacct-pending@gmail.com`;
r = await claim(pendingEmail, other.id);
assert.equal(r.status, 201, JSON.stringify(r.data));
const pendingAcct = await byEmail(pendingEmail);
assert.equal(pendingAcct.claimStatus, "pending");
r = await admin(`/admin/accounts?email=${pendingEmail}`);
assert.equal(r.data.accounts[0].business.id, other.id, "the list shows the business they claimed");
r = await admin(`/admin/accounts/${pendingAcct.id}`, { method: "DELETE" });
assert.equal(r.status, 200, "no release needed for a pending claim");
assert.equal(await byEmail(pendingEmail), null);
assert.equal((await db.business.findUnique({ where: { id: other.id } })).verificationLevel, "L0");
ok("pending claimant deleted, business still there and unclaimed");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n5. An approved claimant: refused without release, then the business is claimable again");
r = await admin("/admin/businesses", { method: "POST", body: { name: "E2E Admin Acct Match", category: "Law", location: "Petaling Jaya", domain: MATCH_DOMAIN } });
assert.equal(r.status, 201);
const match = r.data.business;
const ownerEmail = `${P}adminacct@${MATCH_DOMAIN}`;
r = await claim(ownerEmail, match.id);
assert.equal(r.status, 200, JSON.stringify(r.data));
r = await anon(`/auth/verify-claim/${r.data.token}`, { method: "POST" });
assert.equal(r.status, 200, JSON.stringify(r.data));
const owner = await byEmail(ownerEmail);
assert.equal(owner.claimStatus, "approved");
assert.equal((await db.business.findUnique({ where: { id: match.id } })).verificationLevel, "L1");

r = await admin(`/admin/accounts/${owner.id}`, { method: "DELETE" });
assert.equal(r.status, 409);
assert.equal(r.data.business.id, match.id, "the refusal names the business");
assert.ok(await byEmail(ownerEmail), "and nothing was deleted");
assert.equal((await db.business.findUnique({ where: { id: match.id } })).verificationLevel, "L1");
ok("refused without releaseBusiness");

r = await admin(`/admin/accounts/${owner.id}`, { method: "DELETE", body: { releaseBusiness: true } });
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(r.data.releasedBusiness, match.id);
assert.equal(await byEmail(ownerEmail), null);
assert.equal((await db.business.findUnique({ where: { id: match.id } })).verificationLevel, "L0");
r = await admin(`/admin/businesses?id=${match.id}`);
assert.deepEqual(r.data.businesses[0].claimants, [], "the Businesses page shows it unclaimed");
r = await claim(ownerEmail, match.id);
assert.equal(r.status, 200, "and it can be claimed again");
ok("released: account gone, business at L0, claimable again");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n6. Edit");
const editEmail = `${P}adminacct-edit@e2e.test`;
assert.equal((await register(editEmail)).status, 201);
const editAcct = await byEmail(editEmail);
assert.equal((await login(editEmail)).status, 403, "unverified can't log in");
assert.equal((await member(`/admin/accounts/${editAcct.id}`, { method: "PATCH", body: { name: "x" } })).status, 403);

r = await admin(`/admin/accounts/${editAcct.id}`, { method: "PATCH", body: { name: "  Renamed  ", phone: "60129999999", role: "Owner" } });
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(r.data.account.name, "Renamed", "trimmed");
assert.equal(r.data.account.role, "Owner");
assert.equal(r.data.account.email, editEmail, "fields not sent are left alone");
assert.equal((await admin(`/admin/accounts/${editAcct.id}`, { method: "PATCH", body: { name: " " } })).status, 400);
assert.equal((await admin(`/admin/accounts/${editAcct.id}`, { method: "PATCH", body: {} })).status, 400);
assert.equal((await admin(`/admin/accounts/${editAcct.id}`, { method: "PATCH", body: { emailVerified: "yes" } })).status, 400);
assert.equal((await admin("/admin/accounts/nope", { method: "PATCH", body: { name: "x" } })).status, 404);
ok("details edited; empty, junk and unknown refused");

assert.equal((await admin(`/admin/accounts/${editAcct.id}`, { method: "PATCH", body: { email: "not-an-email" } })).status, 400);
r = await admin(`/admin/accounts/${editAcct.id}`, { method: "PATCH", body: { email: adminEmail.toUpperCase() } });
assert.equal(r.status, 409, "an email already in use, in any case, is refused");
const newEmail = `${P}adminacct-edit2@e2e.test`;
r = await admin(`/admin/accounts/${editAcct.id}`, { method: "PATCH", body: { email: newEmail } });
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(await db.emailVerificationToken.count({ where: { accountId: editAcct.id, consumed: false } }), 0,
  "the link sent to the old address no longer works");
ok("email changed; invalid and taken refused; old links cancelled");

r = await admin(`/admin/accounts/${editAcct.id}`, { method: "PATCH", body: { emailVerified: true } });
assert.equal(r.status, 200);
assert.equal(r.data.account.emailVerified, true);
assert.equal((await login(newEmail)).status, 200, "marked verified: they can log in");
ok("marking verified lets a stuck signup log in");

// ── Tidy up ──
for (const b of (await admin("/admin/businesses?id=e2e-admin-acct&pageSize=100")).data.businesses) {
  await admin(`/admin/businesses/${b.id}`, { method: "DELETE" });
}
await db.emailVerificationToken.deleteMany({ where: { email: { startsWith: `${P}adminacct` } } });
await db.account.deleteMany({ where: { email: { startsWith: `${P}adminacct` } } });

console.log(`\n${pass} checks passed.`);
await db.$disconnect();
