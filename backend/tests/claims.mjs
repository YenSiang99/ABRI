// Claiming a business, from the claimant's side — POST /businesses/claim,
// the confirm link, logging in while the claim is pending, rival claims, a
// rejection, and claiming again from inside the app.
//
// The thing under test is that a PENDING CLAIM OWNS NOTHING. A pending
// claimant can log in (ABRI-launch-access-plan.md step 1), and their Account
// row carries the businessId they are claiming; middleware/auth.js hides it
// until the claim is approved. Every assertion in section 3 is a route that
// would act as the business if that one line went missing.
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

// A session-carrying client. `cookie` comes from whichever response set it.
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

// ── Clean slate: everything this suite made last time ──────────────────────
// The claimants, and the businesses their claims created (ids are slugs of
// the names below, so they share the e2e-claim- prefix).
const claimants = await db.account.findMany({ where: { email: { startsWith: `${P}claim` } } });
await db.deferredConnection.deleteMany({ where: { accountId: { in: claimants.map((a) => a.id) } } });
await db.account.deleteMany({ where: { email: { startsWith: `${P}claim` } } });
const made = await db.business.findMany({ where: { id: { startsWith: `${P}claim-` } }, select: { id: true } });
const madeIds = made.map((b) => b.id);
await db.connection.deleteMany({ where: { OR: [{ businessAId: { in: madeIds } }, { businessBId: { in: madeIds } }] } });
await db.deferredConnection.deleteMany({ where: { businessId: { in: madeIds } } });
await db.networkEvent.deleteMany({ where: { subjectBusinessId: { in: madeIds } } });
await db.activityEvent.deleteMany({ where: { OR: [{ businessId: { in: madeIds } }, { actorBusinessId: { in: madeIds } }] } });
await db.sourceRecord.deleteMany({ where: { sourceId: { startsWith: `${P}claim` } } });
await db.business.deleteMany({ where: { id: { in: madeIds } } });

const hash = await hashPassword(PASSWORD);
await db.account.upsert({
  where: { email: `${P}admin@e2e.test` },
  update: { isAdmin: true, emailVerified: true, passwordHash: hash, businessId: null },
  create: { email: `${P}admin@e2e.test`, phone: "60100000000", name: "E2E Admin", role: "Admin",
            passwordHash: hash, emailVerified: true, isAdmin: true },
});
const admin = (await login(`${P}admin@e2e.test`)).as;

const claimBody = (email, extra = {}) => ({
  businessName: "E2E Claim Flow", category: "Law", location: "Petaling Jaya", ssm: "202401000001",
  repName: "Claimant", repEmail: email, repPhone: "60120000000", repRole: "Director", password: PASSWORD,
  ...extra,
});

// ─────────────────────────────────────────────────────────────────────────
console.log("\n1. A claim with no domain match goes to the admin, with a confirm link");
let r = await anon("/businesses/claim", { method: "POST", body: claimBody(`${P}claim-a@e2e.test`, { ssm: "" }) });
assert.equal(r.status, 400, "a claim without an SSM number is refused");
r = await anon("/businesses/claim", { method: "POST",
  body: claimBody(`${P}claim-a@e2e.test`, { connectTargetId: `${P}a2` }) });
assert.equal(r.status, 201, JSON.stringify(r.data));
assert.equal(r.data.requiresAdminApproval, true);
assert.ok(r.data.token, "no mail provider in tests, so the confirm token comes back");
const tokenA = r.data.token;
assert.equal(r.data.codeEmail, null, "a business the claimant typed in has no inbox to send a code to");
assert.equal(r.data.claimHandle, null, "so no handle to ask for one with");
const bizId = r.data.business.id;
assert.ok(bizId.startsWith(`${P}claim-`), `the new listing's id is a slug of its name: ${bizId}`);
ok("claim submitted: pending, with a confirm-email token");

r = await login(`${P}claim-a@e2e.test`);
assert.equal(r.status, 403, "an unconfirmed email still can't log in");
ok("login is refused until the email is confirmed");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n2. Opening the link logs them in, owning nothing yet");
r = await anon(`/auth/verify-claim/${tokenA}`, { method: "POST" });
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(r.data.business, null, "a pending claim is not a business");
assert.equal(r.data.account.businessId, null, "and the account doesn't say otherwise");
assert.equal(r.data.claim?.status, "pending");
assert.equal(r.data.claim.business.id, bizId);
for (const key of ["membershipTier", "isFoundingMember", "phone", "email", "ssm", "ssmNormalized"]) {
  assert.ok(!(key in r.data.claim.business), `the claimed listing is shown in its public view (no ${key})`);
}
ok("logged in; the claim is visible as status + the listing's public view");

let a = (await login(`${P}claim-a@e2e.test`)).as;
assert.ok(a, "and now ordinary login works");
r = await a("/auth/me");
assert.equal(r.data.claim.status, "pending");
ok("ordinary login works while the claim is pending");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n3. While pending, every route treats them as having no business");
r = await a("/businesses/me", { method: "PATCH", body: { description: "Taking over this listing" } });
assert.equal(r.status, 403, `edit own page -> ${r.status}`);
r = await a("/businesses/me/ssm", { method: "POST", body: { ssm: "202401000001" } });
assert.equal(r.status, 403, `submit SSM -> ${r.status}`);
r = await a("/connections", { method: "POST", body: { businessId: `${P}a2`, source: "directory" } });
assert.ok(r.status >= 400 && r.status < 500, `connect -> ${r.status}`);
r = await a("/follows", { method: "POST", body: { businessId: `${P}a2` } });
assert.ok(r.status >= 400 && r.status < 500, `follow -> ${r.status}`);
r = await a("/vouches", { method: "POST", body: { toBusinessId: `${P}target`, testimonial: "x".repeat(40) } });
assert.ok(r.status >= 400 && r.status < 500, `vouch -> ${r.status}`);
ok("edit, SSM, connect, follow and vouch are all refused (4xx, never 5xx)");

r = await a("/businesses?page=1");
assert.equal(r.status, 200, `directory -> ${r.status}`);
r = await a(`/businesses/${P}a2`);
assert.equal(r.status, 200, `a profile -> ${r.status}`);
ok("the directory and profiles still load");

let edge = await db.connection.findFirst({ where: { OR: [{ businessAId: bizId }, { businessBId: bizId }] } });
assert.equal(edge, null, "the card-tap connect intent did not fire at the pending login");
assert.equal(await db.deferredConnection.count({ where: { businessId: `${P}a2` } }) >= 1, true, "it is still queued");
ok("a queued connect intent waits for approval");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n4. A rival claims the same listing; the admin approves the first, in one review");
r = await anon("/businesses/claim", { method: "POST", body: claimBody(`${P}claim-b@e2e.test`, { businessId: bizId, ssm: "199901000009" }) });
assert.equal(r.status, 201, JSON.stringify(r.data));
assert.equal((await anon(`/auth/verify-claim/${r.data.token}`, { method: "POST" })).status, 200);
const accountA = await db.account.findUnique({ where: { email: `${P}claim-a@e2e.test` } });
assert.equal(accountA.claimSsm, "202401000001", "the number waits on the claimant's account");
assert.equal((await db.business.findUnique({ where: { id: bizId } })).ssm, null, "not on the business, which nobody owns yet");

// What the registers say: this listing's number is A's, and B's number
// belongs to another listing altogether.
await db.sourceRecord.create({ data: { businessId: bizId, source: "manual", sourceId: `${P}claim-1`, ssm: "202401000001", ssmNormalized: "202401000001" } });
await db.sourceRecord.create({ data: { businessId: `${P}a2`, source: "manual", sourceId: `${P}claim-2`, ssm: "199901000009", ssmNormalized: "199901000009" } });
r = await admin("/admin/claims");
const checkA = r.data.claims.find((x) => x.id === accountA.id).registerCheck;
const checkB = r.data.claims.find((x) => x.email === `${P}claim-b@e2e.test`).registerCheck;
assert.equal(checkA.match, true, "A's number is the one the register lists");
assert.equal(checkB.match, false, "B's isn't");
assert.ok(checkB.elsewhere.some((e) => e.businessId === `${P}a2`), "and the register files B's number under another business");
ok("the claims screen shows each claimant's number against the registers");

r = await admin(`/admin/claims/${accountA.id}/approve`, { method: "POST" });
assert.equal(r.status, 200, JSON.stringify(r.data));

a = (await login(`${P}claim-a@e2e.test`)).as;
r = await a("/auth/me");
assert.equal(r.data.business?.id, bizId, "the winner now owns the business");
assert.equal(r.data.business.verificationLevel, "L2", "one review: the claim and the SSM number together");
assert.equal(r.data.business.ssm, "202401000001", "the claimant's number is now the business's");
assert.equal(r.data.claim ?? null, null);
r = await a("/businesses/me", { method: "PATCH", body: { description: "Ours now" } });
assert.equal(r.status, 200, `edit own page after approval -> ${r.status}`);
edge = await db.connection.findFirst({ where: { OR: [{ businessAId: bizId, businessBId: `${P}a2` }, { businessAId: `${P}a2`, businessBId: bizId }] } });
assert.ok(edge, "the queued connect intent fired at the first session after approval");
ok("approved: owns the business, can edit it, and the queued connection landed");

const b = (await login(`${P}claim-b@e2e.test`)).as;
assert.ok(b, "the rival can still log in — rejected, not deleted");
r = await b("/auth/me");
assert.equal(r.data.business, null);
assert.equal(r.data.claim.status, "rejected");
ok("the rival's claim is rejected and their account kept");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n5. A rejected claimant claims again from inside the app");
r = await b("/businesses/me/claim", { method: "POST", body: { businessId: bizId, businessName: "E2E Claim Flow", category: "Law", location: "Petaling Jaya", ssm: "202401000002" } });
assert.equal(r.status, 400, "an owned listing can't be claimed again");
r = await b("/businesses/me/claim", { method: "POST", body: { businessName: "E2E Claim Second", category: "Law", location: "Petaling Jaya", ssm: "202401000002" } });
assert.equal(r.status, 201, JSON.stringify(r.data));
assert.equal(r.data.claim.status, "pending");
const bizB = r.data.claim.business.id;
ok("a new claim from inside the app is pending again");

const accountB = await db.account.findUnique({ where: { email: `${P}claim-b@e2e.test` } });
r = await admin(`/admin/claims/${accountB.id}/reject`, { method: "POST" });
assert.equal(r.status, 200, JSON.stringify(r.data));
r = await b("/auth/me");
assert.equal(r.status, 200, "the session survives a rejection");
assert.equal(r.data.claim.status, "rejected");
r = await admin("/admin/claims");
assert.ok(!r.data.claims.some((c) => c.id === accountB.id), "a rejected claim leaves the admin's claims list");
ok("an admin rejection keeps the account and leaves the queue");
assert.ok(bizB);

r = await a("/businesses/me/claim", { method: "POST", body: { businessName: "E2E Claim Third", category: "Law", location: "Petaling Jaya" } });
assert.equal(r.status, 409, "an owner can't claim a second business");
r = await admin("/businesses/me/claim", { method: "POST", body: { businessName: "E2E Claim Third", category: "Law", location: "Petaling Jaya" } });
assert.equal(r.status, 403, "nor can an admin");
ok("owners and admins can't use the in-app claim");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n6. Instant claim: a code to the email the listing already has");
// Two unclaimed listings with an email on file, as an import leaves them.
for (const id of ["code", "spam"]) {
  await db.business.create({ data: { id: `${P}claim-${id}`, name: `E2E Claim ${id}`, category: "Law",
    location: "Petaling Jaya", email: `owner@${id}.e2e.test` } });
}
r = await anon("/businesses/claim", { method: "POST", body: claimBody(`${P}claim-c@e2e.test`, { businessId: `${P}claim-code`, businessName: "E2E Claim code" }) });
assert.equal(r.status, 201, JSON.stringify(r.data));
assert.equal((await anon(`/auth/verify-claim/${r.data.token}`, { method: "POST" })).status, 200);
const c = (await login(`${P}claim-c@e2e.test`)).as;
r = await c("/auth/me");
assert.equal(r.data.claim.codeEmail, "o***@code.e2e.test", "the claimant sees where the code goes, masked");
ok("a pending claim on a listing with an email offers the code, masked");

r = await c("/businesses/me/claim/email-code", { method: "POST" });
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(r.data.sentTo, "o***@code.e2e.test");
assert.match(r.data.code, /^\d{6}$/, "no mail provider in tests, so the code comes back");
const code = r.data.code;
const stored = await db.claimCode.findFirst({ where: { businessId: `${P}claim-code` } });
assert.ok(stored && stored.codeHash !== code && !stored.codeHash.includes(code), "only a hash is stored");
assert.equal(stored.sentTo, "owner@code.e2e.test");
ok("a code is sent to the listing's own email, and only its hash is kept");

const wrong = code === "000000" ? "111111" : "000000";
r = await c("/businesses/me/claim/email-code/verify", { method: "POST", body: { code: wrong } });
assert.equal(r.status, 400);
assert.equal(r.data.attemptsLeft, 4);
r = await c("/auth/me");
assert.equal(r.data.claim.status, "pending", "a wrong code changes nothing");
ok("a wrong code is refused and counted");

r = await c("/businesses/me/claim/email-code/verify", { method: "POST", body: { code } });
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(r.data.business?.id, `${P}claim-code`);
assert.equal(r.data.business.verificationLevel, "L1", "the inbox proves the business, not its registration");
assert.equal(r.data.business.ssm, "202401000001", "the claimant's number is on the business at L1 — which is the SSM queue");
r = await admin("/admin/ssm-reviews");
assert.ok(r.data.businesses.some((x) => x.id === `${P}claim-code`), "and it is waiting in the SSM queue");
const accountC = await db.account.findUnique({ where: { email: `${P}claim-c@e2e.test` } });
assert.equal(accountC.verificationMethod, "email-code");
r = await c("/businesses/me/claim/email-code/verify", { method: "POST", body: { code } });
assert.equal(r.status, 403, "and the code can't be used again — there's no claim waiting");
ok("the right code approves the claim at once (L1, email-code)");

r = await anon("/businesses/claim", { method: "POST", body: claimBody(`${P}claim-d@e2e.test`, { businessId: `${P}claim-spam`, businessName: "E2E Claim spam" }) });
assert.equal((await anon(`/auth/verify-claim/${r.data.token}`, { method: "POST" })).status, 200);
const d = (await login(`${P}claim-d@e2e.test`)).as;
for (let i = 0; i < 3; i++) assert.equal((await d("/businesses/me/claim/email-code", { method: "POST" })).status, 200);
r = await d("/businesses/me/claim/email-code", { method: "POST" });
assert.equal(r.status, 429, "a fourth code inside the hour is refused");
ok("sending codes is rate-limited per claimant");

r = await b("/auth/me");
assert.equal(r.data.claim.codeEmail ?? null, null, "a rejected claim offers no code");
r = await b("/businesses/me/claim", { method: "POST", body: { businessName: "E2E Claim Fourth", category: "Law", location: "Petaling Jaya", ssm: "202401000004" } });
assert.equal(r.data.claim.codeEmail, null, "a business the claimant typed in has no email on file to prove anything with");
r = await b("/businesses/me/claim/email-code", { method: "POST" });
assert.equal(r.status, 400);
ok("no email on file, no code");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n7. Claiming WITH the listing's own email: the confirm click approves it");
// Listing emails start e2e-claim so the clean slate above removes the
// accounts made with them. "shared" is one inbox on two listings, as a sales
// agent's is in the seed data.
const listingEmails = { match: `${P}claim-match@e2e.test`, moved: `${P}claim-moved@e2e.test`,
  shared1: `${P}claim-shared@e2e.test`, shared2: `${P}claim-shared@e2e.test` };
for (const [id, email] of Object.entries(listingEmails)) {
  await db.business.create({ data: { id: `${P}claim-${id}`, name: `E2E Claim ${id}`, category: "Law",
    location: "Petaling Jaya", email } });
}

r = await anon("/businesses/claim", { method: "POST", body: claimBody(`${P}claim-rival@e2e.test`, { businessId: `${P}claim-match`, businessName: "E2E Claim match" }) });
assert.equal(r.data.requiresAdminApproval, true, "a rival with another email waits for the admin");
assert.equal((await anon(`/auth/verify-claim/${r.data.token}`, { method: "POST" })).status, 200);

// Different case in the domain: the same inbox.
const matchEmail = `${P}claim-match@E2E.test`;
r = await anon("/businesses/claim", { method: "POST", body: claimBody(matchEmail, { businessId: `${P}claim-match`, businessName: "E2E Claim match" }) });
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(r.data.requiresAdminApproval, undefined);
assert.equal(r.data.verificationMethod, "email-match");
assert.equal(await db.account.count({ where: { email: matchEmail } }), 0, "nothing is created before the click");
ok("a claim with the listing's email gets one link, and no account yet");

r = await anon(`/auth/verify-claim/${r.data.token}`, { method: "POST" });
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(r.data.business?.id, `${P}claim-match`, "the click logs them in as the owner");
assert.equal(r.data.business.verificationLevel, "L1", "an inbox proves the business, not its registration");
assert.equal((await db.account.findUnique({ where: { email: matchEmail } })).verificationMethod, "email-match");
const rival = await db.account.findUnique({ where: { email: `${P}claim-rival@e2e.test` } });
assert.equal(rival.claimStatus, "rejected", "the rival's pending claim lost");
ok("the click approves the claim (L1, email-match) and rejects the rival");

r = await anon("/businesses/claim", { method: "POST", body: claimBody(listingEmails.moved, { businessId: `${P}claim-moved`, businessName: "E2E Claim moved" }) });
assert.equal(r.data.verificationMethod, "email-match");
await db.business.update({ where: { id: `${P}claim-moved` }, data: { email: "someone-else@e2e.test" } });
r = await anon(`/auth/verify-claim/${r.data.token}`, { method: "POST" });
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(r.data.business, null, "the listing's email changed before the click, so it owns nothing");
assert.equal(r.data.claim?.status, "pending", "and the claim waits for the admin instead");
ok("a listing whose email changed before the click falls back to pending");

r = await anon("/businesses/claim", { method: "POST", body: claimBody(listingEmails.shared1, { businessId: `${P}claim-shared1`, businessName: "E2E Claim shared1" }) });
assert.equal(r.status, 201, JSON.stringify(r.data));
assert.equal(r.data.requiresAdminApproval, true, "an inbox on two listings proves neither");
assert.equal(r.data.codeEmail, null, "and the signup screen offers no code for it");
assert.equal((await anon(`/auth/verify-claim/${r.data.token}`, { method: "POST" })).status, 200);
const s = (await login(listingEmails.shared1)).as;
r = await s("/auth/me");
assert.equal(r.data.claim.status, "pending");
assert.equal(r.data.claim.codeEmail, null, "and no code is offered to it either");
r = await s("/businesses/me/claim/email-code", { method: "POST" });
assert.equal(r.status, 400);
ok("an email shared across listings goes to the admin: no auto-approval, no code");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n8. The code from the signup screen, before logging in");
for (const id of ["signup", "signup-limit"]) {
  await db.business.create({ data: { id: `${P}claim-${id}`, name: `E2E Claim ${id}`, category: "Law",
    location: "Petaling Jaya", email: `owner@${id}.e2e.test` } });
}
// A rival already waiting on the same listing.
r = await anon("/businesses/claim", { method: "POST", body: claimBody(`${P}claim-rival2@e2e.test`, { businessId: `${P}claim-signup`, businessName: "E2E Claim signup" }) });
assert.equal((await anon(`/auth/verify-claim/${r.data.token}`, { method: "POST" })).status, 200);

r = await anon("/businesses/claim", { method: "POST", body: claimBody(`${P}claim-e@e2e.test`, { businessId: `${P}claim-signup`, businessName: "E2E Claim signup" }) });
assert.equal(r.status, 201, JSON.stringify(r.data));
assert.equal(r.data.codeEmail, "o***@signup.e2e.test", "the submitted screen learns where a code would go, masked");
assert.ok(r.data.claimHandle, "and gets a handle to ask for it with");
const handleE = r.data.claimHandle;
const confirmE = r.data.token;
ok("a claim on a listing with an email returns the masked inbox and a handle");

r = await anon("/businesses/claim/email-code", { method: "POST", body: { claimHandle: "not-a-handle" } });
assert.equal(r.status, 401);
const sessionToken = (await login(`${P}claim-rival2@e2e.test`)).cookie.match(/abri_session=([^;]+)/)[1];
r = await anon("/businesses/claim/email-code", { method: "POST", body: { claimHandle: sessionToken } });
assert.equal(r.status, 401, "a session token is not a handle");
const asSession = await fetch(`${API}/auth/me`, { headers: { cookie: `abri_session=${handleE}` } });
assert.equal(asSession.status, 401, "and a handle is not a session");
ok("a forged handle, a session token and a handle-as-cookie are all refused");

r = await anon("/businesses/claim/email-code", { method: "POST", body: { claimHandle: handleE } });
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(r.data.sentTo, "o***@signup.e2e.test");
const codeE = r.data.code;
const wrongE = codeE === "000000" ? "111111" : "000000";
r = await anon("/businesses/claim/email-code/verify", { method: "POST", body: { claimHandle: handleE, code: wrongE } });
assert.equal(r.status, 400);
assert.equal(r.data.attemptsLeft, 4);
r = await anon("/businesses/claim/email-code/verify", { method: "POST", body: { claimHandle: handleE, code: codeE } });
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(r.data.business?.id, `${P}claim-signup`, "the right code logs them in as the owner");
const e = client(r.cookie);
r = await e("/auth/me");
assert.equal(r.status, 200, "with a real session");
assert.equal(r.data.business?.id, `${P}claim-signup`);
assert.equal(r.data.account.emailVerified, false, "though their own email is still unconfirmed");
const accountE = await db.account.findUnique({ where: { email: `${P}claim-e@e2e.test` } });
assert.equal(accountE.claimStatus, "approved");
assert.equal(accountE.verificationMethod, "email-code");
assert.equal(accountE.emailVerified, false);
assert.equal((await db.business.findUnique({ where: { id: `${P}claim-signup` } })).verificationLevel, "L1");
assert.equal((await db.account.findUnique({ where: { email: `${P}claim-rival2@e2e.test` } })).claimStatus, "rejected", "the rival lost");
r = await anon("/businesses/claim/email-code/verify", { method: "POST", body: { claimHandle: handleE, code: codeE } });
assert.equal(r.status, 403, "the handle is spent once there's no claim waiting");
ok("the right code approves the claim from the signup screen (L1, email-code), rejects the rival, and logs them in");

r = await anon("/auth/login", { method: "POST", body: { email: `${P}claim-e@e2e.test`, password: PASSWORD } });
assert.equal(r.status, 403, "once that session ends, login still waits for their own email");
r = await anon(`/auth/verify-claim/${confirmE}`, { method: "POST" });
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(r.data.business?.id, `${P}claim-signup`, "the confirm link logs them in as the owner");
assert.equal((await login(`${P}claim-e@e2e.test`)).status, 200, "and the password works from then on");
ok("login waits for their own confirm link, and works after it");

r = await anon("/businesses/claim", { method: "POST", body: claimBody(`${P}claim-f@e2e.test`, { businessId: `${P}claim-signup-limit`, businessName: "E2E Claim signup-limit" }) });
const handleF = r.data.claimHandle;
for (let i = 0; i < 2; i++) assert.equal((await anon("/businesses/claim/email-code", { method: "POST", body: { claimHandle: handleF } })).status, 200);
assert.equal((await anon(`/auth/verify-claim/${r.data.token}`, { method: "POST" })).status, 200);
const f = (await login(`${P}claim-f@e2e.test`)).as;
assert.equal((await f("/businesses/me/claim/email-code", { method: "POST" })).status, 200);
r = await anon("/businesses/claim/email-code", { method: "POST", body: { claimHandle: handleF } });
assert.equal(r.status, 429, "the fourth code in the hour is refused, whichever door the first three came through");
ok("both doors share one rate limit");

console.log(`\n${pass} checks passed.`);
await db.$disconnect();
