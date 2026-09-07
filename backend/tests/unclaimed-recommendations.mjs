import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.js";
import { approveClaimAndRejectRivals } from "../src/lib/businessClaim.js";
import assert from "node:assert";
import fs from "node:fs";
const url = fs.readFileSync(new URL("../.env", import.meta.url), "utf8").match(/^DIRECT_URL=(.*)$/m)[1].trim().replace(/^"|"$/g,"");
// This file calls approveClaimAndRejectRivals in-process, and that reaches
// src/prisma.js — a bare PrismaClient with no dotenv behind it. The server
// gets DATABASE_URL from `import "dotenv/config"` in src/index.js; a script
// run with plain `node` does not, and the Prisma client no longer loads .env
// on its own. Set it from the same file the harness already reads.
process.env.DATABASE_URL ??= url;
const db = new PrismaClient({ datasourceUrl: url });
const API = "http://localhost:4000";
const P = "e2e-";
let pass = 0; const ok = (m) => { console.log("  ✓", m); pass++; };

async function login(key) {
  // COLD_RETRY: Neon scales the compute to zero, so the first request after an
  // idle gap comes back 503 from the backend's own error handler. Harness
  // concern only — retry the wake-up rather than failing the run.
  let res;
  for (let attempt = 1; attempt <= 8; attempt++) {
    res = await fetch(`${API}/auth/login`, { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `${P}${key}@e2e.test`, password: "e2e-password-123" }) });
    if (res.status !== 503) break;
    await new Promise((r) => setTimeout(r, 3000));
  }
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return async (path, o = {}) => {
    const r = await fetch(`${API}${path}`, { method: o.method ?? "GET",
      headers: { cookie, ...(o.body ? { "Content-Type": "application/json" } : {}) },
      body: o.body ? JSON.stringify(o.body) : undefined });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
}

// Reset the T0 listing so this is repeatable.
await db.askAnswer.deleteMany({ where: { recommendedBusinessId: `${P}t0` } });
await db.activityEvent.deleteMany({ where: { businessId: `${P}t0` } });
await db.account.deleteMany({ where: { email: `${P}t0-claimer@e2e.test` } });
await db.business.update({ where: { id: `${P}t0` }, data: { verificationLevel: "L0", membershipTier: "free" } });

console.log("\nA. Recommend an UNCLAIMED (T0) listing");
const asker = await login("asker");
let r = await asker("/asks", { method: "POST", body: {
  category: "Service requirement", matchCategory: "Accounting & Tax",
  matchLocation: "Petaling Jaya", title: "T0 hold-and-publish path" } });
const askId = r.data.ask.id;
const a2 = await login("a2");
r = await a2(`/asks/${askId}/answers`, { method: "POST",
  body: { recommendedBusinessId: `${P}t0`, comment: "They're unclaimed but excellent." } });
assert.equal(r.status, 201, JSON.stringify(r.data));
assert.equal(r.data.answer.visibleOnProfile, false, "must be marked unpublished");
ok("a T0 listing can be recommended, and the answer reports published:false");

const answerId = r.data.answer.id;
r = await asker(`/asks/${askId}/answers/${answerId}/accept`, { method: "POST" });
assert.equal(r.status, 200);
ok("asker accepted it");

console.log("\nB. Nothing is published or announced while unclaimed");
const evts = await db.activityEvent.findMany({ where: { businessId: `${P}t0` } });
assert.equal(evts.length, 0, `expected no events, got ${evts.map(e=>e.type)}`);
ok("no ask_recommendation_received — there is no owner to notify");

const t0prof = (await (await fetch(`${API}/businesses/${P}t0`)).json()).business;
assert.equal(t0prof.verificationLevel, "L0");
assert.equal(t0prof.recommendationCount, 1, "the count is the pull");
assert.deepEqual(t0prof.recommendationsReceived, [], "names withheld until they claim");
ok("profile carries the COUNT (1) but not the names");

console.log("\nC. Claiming publishes it");
const hash = await hashPassword("e2e-password-123");
const claimer = await db.account.create({ data: {
  email: `${P}t0-claimer@e2e.test`, phone: "60100000000", name: "T0 Claimer", role: "Owner",
  passwordHash: hash, emailVerified: true, businessId: `${P}t0`, claimStatus: "pending" } });
await approveClaimAndRejectRivals({
  accountId: claimer.id, businessId: `${P}t0`, verificationMethod: "manual" });

const after = (await (await fetch(`${API}/businesses/${P}t0`)).json()).business;
assert.notEqual(after.verificationLevel, "L0", "claim lifts the verificationLevel");
assert.equal(after.recommendationCount, 1);
assert.equal(after.recommendationsReceived.length, 1, "names now visible");
assert.equal(after.recommendationsReceived[0].answeredBy.id, `${P}a2`);
ok(`claimed -> verificationLevel ${after.verificationLevel}, recommendation now visible and attributed`);

const evts2 = await db.activityEvent.findMany({ where: { businessId: `${P}t0` } });
const waiting = evts2.filter((e) => e.type === "recommendations_waiting");
assert.equal(waiting.length, 1, `expected exactly ONE summary event, got ${evts2.map(e=>e.type)}`);
ok("exactly one recommendations_waiting event — one summary, not one per recommendation");

console.log("\nD. Lazy expiry, with no cron");
r = await asker("/asks", { method: "POST", body: {
  category: "Service requirement", matchCategory: "Law",
  matchLocation: "Bangsar", title: "this one is about to lapse" } });
const oldAsk = r.data.ask.id;
await db.ask.update({ where: { id: oldAsk }, data: { expiresAt: new Date(Date.now() - 86400000) } });
await db.activityEvent.deleteMany({ where: { businessId: `${P}asker`, type: "ask_expired" } });

r = await asker(`/asks/${oldAsk}`);          // a read is what triggers it
assert.equal(r.data.ask.status, "closed", "reading an overdue ask closes it");
ok("overdue ask flipped to 'closed' on read — no scheduler involved");

const expEvents = await db.activityEvent.findMany({
  where: { businessId: `${P}asker`, type: "ask_expired" } });
assert.equal(expEvents.length, 1, "exactly one expiry event");
assert.equal(expEvents[0].actorBusinessId, null, "no actor — nobody closed it, it lapsed");
ok("one ask_expired event, with no actor");

r = await asker("/asks");
assert.ok(!r.data.asks.some((a) => a.id === oldAsk), "closed asks leave the board");
ok("the closed ask is off the board");

console.log(`\n${pass} checks passed.`);
await db.$disconnect();
