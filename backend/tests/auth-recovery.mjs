// Getting back into an account without an admin: a new confirmation link
// (from the login screen, or from an old link's page), and a password reset.
//
// Needs the test API with no mail provider (tests/run-all.mjs blanks
// SMTP_HOST), so link tokens come back in the responses. The 60-second
// resend cooldown is stepped over by backdating createdAt, not by waiting.
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
const login = (email, password = PASSWORD) => anon("/auth/login", { method: "POST", body: { email, password } });
const register = (email) => anon("/auth/register", { method: "POST", body: {
  email, password: PASSWORD, name: "E2E Recovery", phone: "60120000000", role: "Director" } });
const resend = (body) => anon("/auth/resend-verification", { method: "POST", body });
const verify = (token) => anon(`/auth/verify-claim/${token}`, { method: "POST" });
const byEmail = (email) => db.account.findUnique({ where: { email } });
const PAST = new Date(Date.now() - 60 * 60 * 1000);
// Lets the next resend through without waiting out the cooldown.
const skipCooldown = (email) => db.emailVerificationToken.updateMany({ where: { email }, data: { createdAt: PAST } });
const expire = (token) => db.emailVerificationToken.update({ where: { token }, data: { expiresAt: PAST } });

const hash = await hashPassword(PASSWORD);
const adminEmail = `${P}admin@e2e.test`;
await db.account.upsert({
  where: { email: adminEmail },
  update: { isAdmin: true, emailVerified: true, passwordHash: hash, businessId: null },
  create: { email: adminEmail, phone: "60100000000", name: "E2E Admin", role: "Admin",
            passwordHash: hash, emailVerified: true, isAdmin: true },
});
const admin = client((await login(adminEmail)).cookie);

// ── Clean slate ──
const MATCH_DOMAIN = "recovery-match.e2e.test";
for (const b of (await admin("/admin/businesses?id=e2e-recovery&pageSize=100")).data.businesses) {
  await admin(`/admin/businesses/${b.id}`, { method: "DELETE" });
}
await db.emailVerificationToken.deleteMany({ where: { email: { startsWith: `${P}recovery` } } });
await db.account.deleteMany({ where: { email: { startsWith: `${P}recovery` } } });

// ─────────────────────────────────────────────────────────────────────────
console.log("\n1. Resend from the login screen (email + password)");
const stuckEmail = `${P}recovery-stuck@e2e.test`;
let r = await register(stuckEmail);
assert.equal(r.status, 201);
const firstToken = r.data.token;
r = await login(stuckEmail);
assert.equal(r.status, 403);
assert.equal(r.data.requiresEmailVerification, true);

assert.equal((await resend({ email: stuckEmail, password: "wrong-password" })).status, 401, "wrong password");
assert.equal((await resend({ email: `${P}recovery-nobody@e2e.test`, password: PASSWORD })).status, 401, "unknown email reads the same");
assert.equal((await resend({ email: stuckEmail, password: PASSWORD })).status, 429, "just registered: cooldown");
await skipCooldown(stuckEmail);
r = await resend({ email: stuckEmail, password: PASSWORD });
assert.equal(r.status, 200, JSON.stringify(r.data));
const secondToken = r.data.token;
assert.ok(secondToken && secondToken !== firstToken);
assert.equal((await verify(firstToken)).status, 404, "the older link is cancelled");
assert.equal((await resend({ email: stuckEmail, password: PASSWORD })).status, 429, "a second resend within a minute");
ok("password checked, cooldown held, old link cancelled");

r = await verify(secondToken);
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal((await login(stuckEmail)).status, 200, "confirmed: they can log in");
await skipCooldown(stuckEmail);
assert.equal((await resend({ email: stuckEmail, password: PASSWORD })).status, 400, "already confirmed");
ok("the new link confirms and logs in; nothing to resend after");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n2. Resend from an expired account link");
const lateEmail = `${P}recovery-late@e2e.test`;
r = await register(lateEmail);
const lateToken = r.data.token;
await expire(lateToken);
r = await verify(lateToken);
assert.equal(r.status, 400);
assert.equal(r.data.expired, true, "the page is told it expired");
await skipCooldown(lateEmail);
r = await resend({ token: lateToken });
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal((await verify(r.data.token)).status, 200, "the fresh link works");
assert.equal((await byEmail(lateEmail)).emailVerified, true);
assert.equal((await resend({ token: "not-a-token" })).status, 404);
ok("expired link → new link → confirmed; unknown token is 404");

const usedEmail = `${P}recovery-used@e2e.test`;
r = await register(usedEmail);
const usedToken = r.data.token;
assert.equal((await verify(usedToken)).status, 200);
assert.equal((await resend({ token: usedToken })).status, 400, "a used link offers nothing to resend");
ok("used link is refused");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n3. Resend from an expired auto-approve claim link");
r = await admin("/admin/businesses", { method: "POST", body: { name: "E2E Recovery Match", category: "Law", location: "Petaling Jaya", domain: MATCH_DOMAIN } });
assert.equal(r.status, 201);
const match = r.data.business;
const claimEmail = `${P}recovery@${MATCH_DOMAIN}`;
const claim = () => anon("/businesses/claim", { method: "POST", body: {
  businessId: match.id, businessName: match.name, category: "Law", location: "Petaling Jaya", ssm: "202401000555",
  repName: "Claimant", repEmail: claimEmail, repPhone: "60120000000", repRole: "Director", password: PASSWORD } });
r = await claim();
assert.equal(r.status, 200, JSON.stringify(r.data));
const claimToken = r.data.token;
await expire(claimToken);
assert.equal((await verify(claimToken)).data.expired, true);
assert.equal(await byEmail(claimEmail), null, "nothing was created by the expired link");

await skipCooldown(claimEmail);
r = await resend({ token: claimToken });
assert.equal(r.status, 200, JSON.stringify(r.data));
const freshClaim = r.data.token;
assert.equal((await verify(claimToken)).status, 404, "the expired claim link is gone");
r = await verify(freshClaim);
assert.equal(r.status, 200, JSON.stringify(r.data));
const owner = await byEmail(claimEmail);
assert.equal(owner.claimStatus, "approved", "the same claim, approved on the fresh link");
assert.equal(owner.businessId, match.id);
ok("expired claim link re-sent as the same claim; it approves");

// An account appeared for the address since: a re-sent claim would collide.
await admin(`/admin/accounts/${owner.id}`, { method: "DELETE", body: { releaseBusiness: true } });
r = await claim();
const raceToken = r.data.token;
await expire(raceToken);
assert.equal((await register(claimEmail)).status, 201);
await skipCooldown(claimEmail);
assert.equal((await resend({ token: raceToken })).status, 409, "an account now exists: log in instead");
ok("refused once an account exists for the address");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n4. Forgot password");
const forgot = (email) => anon("/auth/forgot-password", { method: "POST", body: { email } });
const reset = (token, password) => anon(`/auth/reset-password/${token}`, { method: "POST", body: { password } });

r = await forgot(`${P}recovery-nobody@e2e.test`);
assert.equal(r.status, 200);
assert.equal(r.data.token, undefined, "an unknown email gets the same answer and no link");
const unknownMessage = r.data.message;
assert.equal((await forgot("not-an-email")).status, 400);

const forgetfulEmail = `${P}recovery-forgetful@e2e.test`;
assert.equal((await register(forgetfulEmail)).status, 201, "never confirmed, and forgot the password too");
const forgetful = await byEmail(forgetfulEmail);
r = await forgot(forgetfulEmail);
assert.equal(r.status, 200);
assert.equal(r.data.message, unknownMessage, "the same words whether or not the account exists");
const resetToken = r.data.token;
assert.ok(resetToken);
r = await forgot(forgetfulEmail);
assert.equal(r.data.token, undefined, "a second request within a minute sends nothing");
ok("neutral answer; link only for a real account; cooldown");

assert.equal((await reset(resetToken, "short")).status, 400);
assert.equal((await reset("not-a-token", "new-password-456")).status, 404);
r = await reset(resetToken, "new-password-456");
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.ok(r.cookie.includes("="), "logged in by the reset");
assert.equal((await byEmail(forgetfulEmail)).emailVerified, true, "the reset confirmed the email too");
assert.equal((await login(forgetfulEmail)).status, 401, "the old password no longer works");
assert.equal((await login(forgetfulEmail, "new-password-456")).status, 200, "the new one does");
r = await reset(resetToken, "another-password-789");
assert.equal(r.status, 400);
assert.equal(r.data.expired, true, "a used reset link can't be reused");
ok("reset sets the password, confirms the email, logs in, is single-use");

await db.passwordResetToken.updateMany({ where: { accountId: forgetful.id }, data: { createdAt: PAST } });
r = await forgot(forgetfulEmail);
await db.passwordResetToken.update({ where: { token: r.data.token }, data: { expiresAt: PAST } });
r = await reset(r.data.token, "new-password-456");
assert.equal(r.status, 400);
assert.equal(r.data.expired, true);
ok("an expired reset link is refused");

// ── Tidy up ──
for (const b of (await admin("/admin/businesses?id=e2e-recovery&pageSize=100")).data.businesses) {
  await admin(`/admin/businesses/${b.id}`, { method: "DELETE" });
}
await db.emailVerificationToken.deleteMany({ where: { email: { startsWith: `${P}recovery` } } });
await db.account.deleteMany({ where: { email: { startsWith: `${P}recovery` } } });

console.log(`\n${pass} checks passed.`);
await db.$disconnect();
