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
  // COLD_RETRY: Neon scales the compute to zero, so the first request after an
  // idle gap comes back 503 from the backend's own error handler. Harness
  // concern only — retry the wake-up rather than failing the run.
  let res;
  for (let attempt = 1; attempt <= 8; attempt++) {
    res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, password: "e2e-password-123" }),
    });
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

// An admin has no business, matching how the app models them.
const hash = await hashPassword("e2e-password-123");
await db.account.upsert({
  where: { email: `${P}admin@e2e.test` },
  update: { isAdmin: true, emailVerified: true, passwordHash: hash, businessId: null },
  create: { email: `${P}admin@e2e.test`, phone: "60100000000", name: "E2E Admin", role: "Admin",
            passwordHash: hash, emailVerified: true, isAdmin: true },
});

const asker = await login(`${P}asker@e2e.test`);
const a2 = await login(`${P}a2@e2e.test`);
const a3 = await login(`${P}a3@e2e.test`);
const admin = await login(`${P}admin@e2e.test`);

console.log("\nA. Reporting an ask freezes it");
let r = await asker("/asks", { method: "POST", body: {
  category: "Service requirement", matchCategory: "Accounting & Tax",
  matchLocation: "Petaling Jaya", title: "moderation: this ask gets reported" } });
const askId = r.data.ask.id;
r = await a2(`/asks/${askId}/flag`, { method: "POST", body: { reason: "spam", note: "looks like spam" } });
assert.equal(r.status, 201, JSON.stringify(r.data));
ok("report accepted");

let ask = await db.ask.findUnique({ where: { id: askId } });
assert.equal(ask.status, "under_review", "a reported live ask freezes");
ok("ask frozen to under_review");

const evt = await db.activityEvent.findFirst({
  where: { businessId: `${P}asker`, type: "ask_flagged" }, orderBy: { createdAt: "desc" } });
assert.ok(evt, "the asker is told their post stopped working");
assert.equal(evt.actorBusinessId, null, "the flagger is NOT named");
ok("asker notified, reporter not named");

console.log("\nB. Frozen content is hidden from everyone but its owner");
r = await a3(`/asks/${askId}`);
assert.equal(r.status, 404, "a third party can't read a frozen ask");
r = await asker(`/asks/${askId}`);
assert.equal(r.status, 200, "but the asker can, to see why it stopped");
ok("hidden from others, visible to its author");

r = await a3(`/asks/${askId}/answers`, { method: "POST",
  body: { recommendedBusinessId: `${P}target`, comment: "should be refused" } });
assert.equal(r.status, 404, "and cannot be answered while frozen");
ok("frozen ask cannot be answered");

console.log("\nC. Flag-griefing guards");
// Once frozen, the ask is hidden from its reporter too — same 404 as any
// other non-owner, so nobody can tell "frozen" from "never existed".
r = await a2(`/asks/${askId}/flag`, { method: "POST", body: { reason: "spam" } });
assert.equal(r.status, 404, "a frozen ask is hidden from the reporter as well");
ok("frozen ask is uniformly hidden — no moderation state leaks");

// The other guards need a live ask to act on.
r = await asker("/asks", { method: "POST", body: {
  category: "Service requirement", matchCategory: "Accounting & Tax",
  matchLocation: "Petaling Jaya", title: "moderation: guards" } });
const liveAsk = r.data.ask.id;
r = await asker(`/asks/${liveAsk}/flag`, { method: "POST", body: { reason: "spam" } });
assert.equal(r.status, 400);
ok("you can't report your own ask");
r = await a3(`/asks/${liveAsk}/flag`, { method: "POST", body: { reason: "made_up_reason" } });
assert.equal(r.status, 400, "reasons come from a closed list");
ok(`invented reasons never reach the queue ("${r.data.error}")`);
// And the dedupe itself, on a SETTLED ask where reporting is tracking-only
// and freezes nothing — so a second attempt actually reaches the guard.
await asker(`/asks/${liveAsk}/close`, { method: "POST" });
r = await a3(`/asks/${liveAsk}/flag`, { method: "POST", body: { reason: "spam" } });
assert.equal(r.status, 201, "a settled ask can still be reported, for the record");
const settled = await db.ask.findUnique({ where: { id: liveAsk } });
assert.equal(settled.status, "closed", "but reporting it freezes nothing");
ok("reporting a settled ask is tracking-only — it does not freeze");
r = await a3(`/asks/${liveAsk}/flag`, { method: "POST", body: { reason: "spam" } });
assert.equal(r.status, 409, "one report per business per target");
ok(`second report from the same business refused ("${r.data.error}")`);

console.log("\nD. The admin queue shows it, frozen first");
r = await admin("/admin/ask-reviews");
assert.equal(r.status, 200, JSON.stringify(r.data));
const row = r.data.reviews.find((x) => x.id === askId);
assert.ok(row, "the frozen ask is in the queue");
assert.equal(row.askFrozen, true);
assert.equal(row.flags[0].reason, "spam");
assert.equal(row.flags[0].raisedBy.id, `${P}a2`);
ok(`queue shows it with the report attached (reason "${row.flags[0].reason}")`);

console.log("\nE. Restoring dismisses the report and restarts the clock");
const before = await db.ask.findUnique({ where: { id: askId } });
r = await admin(`/admin/ask-reviews/asks/${askId}/decide`, { method: "POST", body: { decision: "restore" } });
assert.equal(r.status, 200, JSON.stringify(r.data));
ask = await db.ask.findUnique({ where: { id: askId } });
assert.equal(ask.status, "open", "restored");
assert.ok(ask.expiresAt > before.expiresAt, "deadline restarted, not resumed");
ok("ask reopened and its 30 days restarted");

const flags = await db.askFlag.findMany({ where: { askId, answerId: null } });
assert.equal(flags[0].status, "reviewed");
assert.equal(flags[0].outcome, "dismissed", "outcome DERIVED from the decision");
assert.ok(flags[0].resolvedByAccountId, "the ruling admin is recorded");
ok("report marked reviewed/dismissed, admin recorded");

console.log("\nF. Closing requires a note, and upholds");
r = await a3(`/asks/${askId}/flag`, { method: "POST", body: { reason: "not_a_real_ask" } });
assert.equal(r.status, 201);
r = await admin(`/admin/ask-reviews/asks/${askId}/decide`, { method: "POST", body: { decision: "close" } });
assert.equal(r.status, 400, "a decision that ends someone's content has to say why");
ok(`close without a note refused ("${r.data.error}")`);
r = await admin(`/admin/ask-reviews/asks/${askId}/decide`, {
  method: "POST", body: { decision: "close", note: "Not a genuine requirement." } });
assert.equal(r.status, 200);
ask = await db.ask.findUnique({ where: { id: askId } });
assert.equal(ask.status, "closed");
const f2 = await db.askFlag.findFirst({ where: { askId, raisedByBusinessId: `${P}a3`, answerId: null } });
assert.equal(f2.outcome, "upheld");
ok("closed with a note; that report upheld");

console.log("\nG. Removing an ACCEPTED answer unpublishes it and settles the ask honestly");
r = await asker("/asks", { method: "POST", body: {
  category: "Service requirement", matchCategory: "Accounting & Tax",
  matchLocation: "Petaling Jaya", title: "moderation: accepted answer gets removed" } });
const ask2 = r.data.ask.id;
r = await a2(`/asks/${ask2}/answers`, { method: "POST",
  body: { recommendedBusinessId: `${P}target`, comment: "an answer that will be removed" } });
const ansId = r.data.answer.id;
await asker(`/asks/${ask2}/answers/${ansId}/accept`, { method: "POST" });

const beforeCount = (await (await fetch(`${API}/businesses/${P}target`)).json()).business.recommendationCount;
r = await a3(`/asks/${ask2}/answers/${ansId}/flag`, { method: "POST", body: { reason: "self_promotion" } });
assert.equal(r.status, 201, JSON.stringify(r.data));
ok("an accepted answer is still reportable — it is live public content");

const afterFreeze = (await (await fetch(`${API}/businesses/${P}target`)).json()).business.recommendationCount;
assert.equal(afterFreeze, beforeCount - 1, "freezing pulls it off the profile immediately");
ok("frozen recommendation disappears from the profile");

r = await admin(`/admin/ask-reviews/answers/${ansId}/decide`, {
  method: "POST", body: { decision: "remove", note: "Self-promotion dressed as a recommendation." } });
assert.equal(r.status, 200, JSON.stringify(r.data));
const removed = await db.askAnswer.findUnique({ where: { id: ansId } });
assert.equal(removed.status, "removed");
const parent = await db.ask.findUnique({ where: { id: ask2 } });
assert.equal(parent.status, "closed", "an ask cannot stay 'answered' with no standing accepted answer");
ok("answer removed and the ask settled to 'closed', not left lying as 'answered'");

const finalCount = (await (await fetch(`${API}/businesses/${P}target`)).json()).business.recommendationCount;
assert.equal(finalCount, beforeCount - 1, "and it stays off the profile");
ok("removed recommendation stays unpublished");

console.log("\nH. A removed answer's slot is not reusable by its author");
r = await a2(`/asks/${ask2}/answers`, { method: "POST",
  body: { recommendedBusinessId: `${P}target`, comment: "trying again" } });
assert.equal(r.status, 400, "the ask is closed now anyway");
ok("cannot re-answer a settled ask");

console.log(`\n${pass} checks passed.`);
await db.$disconnect();
