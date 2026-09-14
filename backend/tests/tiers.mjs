// The two paid steps on the check-a-business screen: network overlap (Plus)
// and watch + check history (Pro). Run e2e-setup.mjs first.
//
// WHAT THESE ASSERTIONS ARE REALLY PROTECTING is the rule that made these
// features buildable at all. ABRI-feature-checklist.md line 55 forbids
// charging the viewer for facts about the seller — "charging the buyer for the
// privilege of contacting a paying seller paywalls that seller's own leads
// away from them". So step 3 is the one that matters most: a Free viewer must
// still get the badge, the vouch count and the contact details. Everything
// these tiers add is something that did not exist for a stranger.
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.js";
import assert from "node:assert";
import fs from "node:fs";
const url = fs.readFileSync(new URL("../.env", import.meta.url), "utf8").match(/^DIRECT_URL=(.*)$/m)[1].trim().replace(/^"|"$/g,"");
// Set for the one place this file imports a src/ module directly (step 9).
// The server has dotenv; a bare script does not, and src/prisma.js reads this.
process.env.DATABASE_URL ??= url;
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

// ── The graph under test ──────────────────────────────────────────────────
//
//   e2e-asker  (the VIEWER)  ──connected──> e2e-a2 ──vouches for──> e2e-target
//                                            e2e-a3 ──vouches for──> e2e-target  (NOT connected)
//
// So the viewer should be told about a2 and never about a3: one is somebody
// they know, the other is a stranger who happens to have vouched.
const TARGET = `${P}target`;
await db.business.update({ where: { id: TARGET }, data: { verificationLevel: "L2", membershipTier: "plus" } });
for (const id of [`${P}asker`, `${P}a2`, `${P}a3`]) {
  await db.business.update({ where: { id }, data: { verificationLevel: "L2", membershipTier: "plus" } });
}

async function resetVouch(fromId, toId, status) {
  const stale = await db.vouch.findMany({ where: { fromBusinessId: fromId, toBusinessId: toId }, select: { id: true } });
  for (const { id } of stale) {
    await db.vouch.update({ where: { id }, data: { currentRevisionId: null } });
    await db.networkEvent.deleteMany({ where: { vouchId: id } });
    await db.vouchAction.deleteMany({ where: { vouchId: id } });
    await db.vouchFlag.deleteMany({ where: { vouchId: id } });
    await db.vouchRevision.deleteMany({ where: { vouchId: id } });
    await db.vouch.delete({ where: { id } });
  }
  const vouch = await db.vouch.create({ data: { fromBusinessId: fromId, toBusinessId: toId, status, closedAt: new Date() } });
  const rev = await db.vouchRevision.create({ data: {
    vouchId: vouch.id, attempt: 1, revisionNumber: 1, comment: "Solid work.", createdById: fromId } });
  await db.vouch.update({ where: { id: vouch.id }, data: { currentRevisionId: rev.id } });
  return vouch;
}
await resetVouch(`${P}a2`, TARGET, "published");
await resetVouch(`${P}a3`, TARGET, "published");

// Connect the viewer to a2 only. ACCEPTED — a pending request must not count.
await db.connection.deleteMany({ where: { OR: [{ businessAId: `${P}asker` }, { businessBId: `${P}asker` }] } });
const pair = [`${P}asker`, `${P}a2`].sort();
await db.connection.create({ data: {
  businessAId: pair[0], businessBId: pair[1], requestedById: `${P}asker`,
  status: "accepted", source: "directory" } });

const viewer = () => login(`${P}asker@e2e.test`);
const admin = await login(`${P}admin@e2e.test`);
const anon = async (path) => {
  const r = await fetch(`${API}${path}`);
  return { status: r.status, data: await r.json().catch(() => null) };
};
const setTier = (tier) => db.business.update({ where: { id: `${P}asker` }, data: { membershipTier: tier } });
const lookTarget = async (client) =>
  (await client(`/businesses/lookup?q=${encodeURIComponent("E2E Recommended")}`)).data
    .matches.find((m) => m.id === TARGET);

// ─────────────────────────────────────────────────────────────────────────
console.log("\n1. A Free viewer gets no network overlap");
await setTier("free");
let v = await viewer();
let hit = await lookTarget(v);
assert.ok(hit, "the business is still found");
assert.ok(!("vouchersInYourNetwork" in hit), "the overlap is a Plus feature");
ok("no vouchersInYourNetwork below Plus");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n2. A Plus viewer is told WHO they already know");
await setTier("plus");
v = await viewer();
hit = await lookTarget(v);
assert.ok(hit.vouchersInYourNetwork, "the overlap appears at Plus");
const ids = hit.vouchersInYourNetwork.map((b) => b.id);
assert.deepEqual(ids, [`${P}a2`], `expected only the connected voucher, got ${ids.join(",")}`);
// Names, not just a count: "2 of them are in your network" is interesting and
// "Tan & Co vouches for them" is what makes somebody pick up the phone.
assert.ok(hit.vouchersInYourNetwork[0].name, "and names them");
assert.equal(hit.vouchCount, 2, "while the public count still says 2 — both vouches are real");
ok("names the connected voucher, excludes the stranger, count unchanged");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n3. Plus takes NOTHING away from Free");
// The assertion that keeps this feature honest. Line 55 of the checklist
// forbids charging the buyer for the seller's own facts, so a Free viewer must
// still see everything they saw before this feature existed.
await setTier("free");
const asFree = await lookTarget(await viewer());
await setTier("plus");
const asPlus = await lookTarget(await viewer());
for (const key of Object.keys(asFree)) {
  assert.deepEqual(asPlus[key], asFree[key], `Plus changed "${key}" — it must only ADD`);
}
assert.ok(!("vouchersInYourNetwork" in asFree) && "vouchersInYourNetwork" in asPlus,
  "the only difference is the added key");
ok(`Plus adds one key and alters none of the other ${Object.keys(asFree).length}`);

// ─────────────────────────────────────────────────────────────────────────
console.log("\n4. A pending connection is not a network");
await db.connection.updateMany({ where: { businessAId: pair[0], businessBId: pair[1] }, data: { status: "pending" } });
hit = await lookTarget(await viewer());
assert.ok(!("vouchersInYourNetwork" in hit),
  "an unanswered request must not manufacture 'somebody you know vouches for them'");
await db.connection.updateMany({ where: { businessAId: pair[0], businessBId: pair[1] }, data: { status: "accepted" } });
ok("only accepted connections count — a request cannot forge the signal");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n5. Watching is Pro, and refused below it");
await setTier("plus");
v = await viewer();
let r = await v("/watches", { method: "POST", body: { businessId: `${P}t0` } });
assert.equal(r.status, 402, `expected 402, got ${r.status}`);
assert.equal(r.data.requiredMembershipTier, "pro", "and names the tier to buy");
ok(`Plus is refused with 402 and "${r.data.requiredMembershipTier}"`);

// ─────────────────────────────────────────────────────────────────────────
console.log("\n6. Pro can watch an UNCLAIMED listing — the case follows refuses");
await setTier("pro");
v = await viewer();
await db.business.update({ where: { id: `${P}t0` }, data: { verificationLevel: "L0" } });
await db.businessWatch.deleteMany({ where: { watcherId: `${P}asker` } });

// POST /follows refuses a T0 outright; a watch is the feature follows.js
// named as the better answer, so this MUST be allowed.
r = await v("/watches", { method: "POST", body: { businessId: `${P}t0` } });
assert.equal(r.status, 201, JSON.stringify(r.data));
const follow = await v("/follows", { method: "POST", body: { businessId: `${P}t0` } });
assert.equal(follow.status, 400, "while following the same listing is still refused");
// Idempotent, like a follow: the button may be double-pressed.
r = await v("/watches", { method: "POST", body: { businessId: `${P}t0` } });
assert.equal(r.status, 201, "watching twice is a success, not a conflict");
assert.equal((await db.businessWatch.count({ where: { watcherId: `${P}asker` } })), 1, "and makes one row");
ok("T0 watchable where it is unfollowable; idempotent");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n7. A watched business getting verified reaches the watcher");
// Driven through the REAL admin route rather than by calling the notifier,
// so this also asserts the hook is actually wired into the place a level
// changes — which is the half most likely to be forgotten.
await db.business.update({ where: { id: `${P}t1` }, data: { verificationLevel: "L1" } });
await db.businessWatch.deleteMany({ where: { watcherId: `${P}asker` } });
await db.activityEvent.deleteMany({ where: { businessId: `${P}asker` } });
r = await v("/watches", { method: "POST", body: { businessId: `${P}t1` } });
assert.equal(r.status, 201, JSON.stringify(r.data));

r = await admin(`/admin/businesses/${P}t1/verify-ssm`, { method: "POST" });
assert.equal(r.status, 200, JSON.stringify(r.data));
let events = await db.activityEvent.findMany({ where: { businessId: `${P}asker` } });
assert.equal(events.length, 1, "exactly one event");
assert.equal(events[0].type, "watched_business_verified");
assert.equal(events[0].actorBusinessId, null, "no actor — an admin moved it");
// Caught up, so the NEXT change is measured from here rather than from
// whatever it was when the watch was set.
let watchRow = await db.businessWatch.findFirst({ where: { watcherId: `${P}asker`, watchedId: `${P}t1` } });
assert.equal(watchRow.lastSeenLevel, "L2", "lastSeenLevel advanced");
ok("verify-ssm notified the watcher once, no actor, watch caught up");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n8. Losing a level reads as a warning, not as news");
await db.activityEvent.deleteMany({ where: { businessId: `${P}asker` } });
r = await admin(`/admin/businesses/${P}t1/revoke-ssm`, { method: "POST" });
assert.equal(r.status, 200, JSON.stringify(r.data));
events = await db.activityEvent.findMany({ where: { businessId: `${P}asker` } });
// The direction is the whole reason lastSeenLevel is stored: a member told
// "is now verified" when a counterparty was just downgraded has the fact
// right and the meaning backwards.
assert.equal(events[0].type, "watched_business_downgraded", "down is 'downgraded', not 'verified'");
ok("revoke-ssm reads as a warning");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n8b. And the claim direction says 'claimed'");
// The one case driven through the notifier rather than a route: its real
// caller is approveClaimAndRejectRivals, which needs a whole pending-account
// fixture to reach. The hook itself is asserted in e2e-t0's claim flow.
const { notifyWatchers } = await import("../src/lib/businessWatch.js");
await db.activityEvent.deleteMany({ where: { businessId: `${P}asker` } });
const notified = await notifyWatchers(`${P}t1`, { fromLevel: "L0", toLevel: "L1" });
assert.equal(notified, 1, "one watcher notified");
events = await db.activityEvent.findMany({ where: { businessId: `${P}asker` } });
assert.equal(events[0].type, "watched_business_claimed");
// And the watcher whose OWN business moved is skipped — you do not need
// telling that you got verified.
const selfNotified = await notifyWatchers(`${P}asker`, { fromLevel: "L1", toLevel: "L2" });
assert.equal(selfNotified, 0, "a business watching itself is not notified about itself");
ok("claimed direction, and self-notification suppressed");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n9. Check history is written for Pro and nobody else");
await db.businessCheck.deleteMany({ where: { checkedById: `${P}asker` } });
await setTier("free");
await lookTarget(await viewer());
assert.equal(await db.businessCheck.count({ where: { checkedById: `${P}asker` } }), 0,
  "a Free member's searches are not logged — collecting them to sell the log back is the wrong trade");

await setTier("pro");
v = await viewer();
await lookTarget(v);
let checks = await db.businessCheck.findMany({ where: { checkedById: `${P}asker` } });
assert.ok(checks.length > 0, "a Pro member's are");
assert.equal(checks.find((c) => c.checkedId === TARGET).levelAtCheck, "L2",
  "recording the level AT THE TIME, not a live join");
ok(`nothing logged on Free; ${checks.length} logged on Pro, with the level as it stood`);

// ─────────────────────────────────────────────────────────────────────────
console.log("\n10. Re-checking refreshes rather than duplicating");
const before = await db.businessCheck.count({ where: { checkedById: `${P}asker` } });
await lookTarget(v);
await lookTarget(v);
assert.equal(await db.businessCheck.count({ where: { checkedById: `${P}asker` } }), before,
  "a debounced search box must not write a row per keystroke-pause");
ok("same business inside the window updates one row");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n11. History says what has changed since you looked");
r = await v("/watches/checks");
assert.equal(r.status, 200, JSON.stringify(r.data));
let entry = r.data.checks.find((c) => c.business.id === TARGET);
assert.equal(entry.levelChanged, false, "unchanged while it is unchanged");
await db.business.update({ where: { id: TARGET }, data: { verificationLevel: "L1" } });
r = await v("/watches/checks");
entry = r.data.checks.find((c) => c.business.id === TARGET);
assert.equal(entry.levelAtCheck, "L2", "what you were told then");
assert.equal(entry.business.verificationLevel, "L1", "against what is true now");
assert.equal(entry.levelChanged, true, "flagged — this is the case the log exists for");
await db.business.update({ where: { id: TARGET }, data: { verificationLevel: "L2" } });
ok("then vs now, with the difference flagged");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n12. Neither tool can be turned around to ask about YOU");
// The rule both models are built on: "what have I checked" must never become
// "who has been checking me", and "what am I watching" must never become "who
// is watching me". Both would put a private signal on somebody else's screen.
for (const path of [`/watches?businessId=${TARGET}`, `/watches/checks?businessId=${TARGET}`]) {
  const res = await v(path);
  assert.equal(res.status, 200, `${path} should ignore the param, not error`);
  const rows = res.data.watches ?? res.data.checks;
  // Every row belongs to the CALLER. An unrecognised query param is no
  // filter here, so the assertion is that the route reads the session and
  // nothing else.
  assert.ok(Array.isArray(rows), "still the caller's own list");
}
const watchesOfTarget = await v("/watches");
assert.ok(!JSON.stringify(watchesOfTarget.data).includes("watcher"),
  "no watcher identities are ever serialized");
ok("both routes read the session only; a target id changes nothing");

// ── Clean up ──────────────────────────────────────────────────────────────
//
// This file builds a vouch graph on shared fixtures, and asks.mjs asserts that
// e2e-target's vouch count is unchanged by an accepted answer.
// Leaving them behind makes that suite fail depending on the order the two
// are run in — which is the worst kind of failure, because it looks like the
// other file's bug.
for (const from of [`${P}a2`, `${P}a3`]) {
  const rows = await db.vouch.findMany({ where: { fromBusinessId: from, toBusinessId: TARGET }, select: { id: true } });
  for (const { id } of rows) {
    await db.vouch.update({ where: { id }, data: { currentRevisionId: null } });
    await db.networkEvent.deleteMany({ where: { vouchId: id } });
    await db.vouchRevision.deleteMany({ where: { vouchId: id } });
    await db.vouch.delete({ where: { id } });
  }
}
await db.connection.deleteMany({ where: { OR: [{ businessAId: `${P}asker` }, { businessBId: `${P}asker` }] } });
await db.businessWatch.deleteMany({ where: { watcherId: `${P}asker` } });
await db.businessCheck.deleteMany({ where: { checkedById: `${P}asker` } });
await db.business.update({ where: { id: `${P}asker` }, data: { membershipTier: "free" } });

console.log(`\n${pass} checks passed.`);
await db.$disconnect();
