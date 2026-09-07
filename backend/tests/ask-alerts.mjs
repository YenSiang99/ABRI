import { PrismaClient } from "@prisma/client";
import assert from "node:assert";
import fs from "node:fs";
const url = fs.readFileSync(new URL("../.env", import.meta.url), "utf8").match(/^DIRECT_URL=(.*)$/m)[1].trim().replace(/^"|"$/g,"");
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

// Neon scales the compute to zero; the first connection has to wake it.
for (let i = 1; i <= 6; i++) {
  try { await db.$queryRaw`select 1`; break; }
  catch { await new Promise((r) => setTimeout(r, 4000)); }
}

// a2 is an Accounting & Tax business in Petaling Jaya.
await db.business.update({ where: { id: `${P}a2` }, data: { membershipTier: "free" } });
const asker = await login("asker");
const a2 = await login("a2");

console.log("\nA. Below Pro the alert is withheld — with a price, not an error");
let r = await a2("/asks/alerts");
assert.equal(r.status, 402, `expected 402, got ${r.status}`);
assert.equal(r.data.requiredMembershipTier, "pro", "must name the plan so the client can price it");
ok(`Free gets 402 requiredMembershipTier:"pro" ("${r.data.error}")`);

console.log("\nB. ...but the board itself is NOT withheld");
r = await a2("/asks");
assert.equal(r.status, 200, "a Free member must still be able to read the board");
ok("Free reads the board fine — the gate sells timing, not access");

console.log("\nC. On Pro the alert is delivered, and it is routed");
await db.business.update({ where: { id: `${P}a2` }, data: { membershipTier: "pro" } });
const a2pro = await login("a2");
const fresh = await asker("/asks", { method: "POST", body: {
  category: "Service requirement", matchCategory: "Accounting & Tax",
  matchLocation: "Petaling Jaya", title: "alerts: needs an accountant in PJ" } });
assert.equal(fresh.status, 201, `post ask failed: ${fresh.status} ${JSON.stringify(fresh.data)}`);
r = await a2pro("/asks/alerts");
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.ok(r.data.count >= 1, "the matching ask is counted");
assert.ok(r.data.top.some((a) => a.id === fresh.data.ask.id), "and previewed");
ok(`Pro gets count=${r.data.count} with a preview of the matching ask`);

console.log("\nD. It only counts asks it can actually answer");
// An ask in a different trade must not appear.
const offTrade = await asker("/asks", { method: "POST", body: {
  category: "Service requirement", matchCategory: "IT Consulting",
  matchLocation: "Petaling Jaya", title: "alerts: needs IT, not accounting" } });
r = await a2pro("/asks/alerts");
assert.ok(!r.data.top.some((a) => a.id === offTrade.data.ask.id), "a different trade must not route here");
ok("an ask in another category is not surfaced as your work");

// Your own ask is never your own alert.
const ownAsk = await a2pro("/asks", { method: "POST", body: {
  category: "Service requirement", matchCategory: "Accounting & Tax",
  matchLocation: "Petaling Jaya", title: "alerts: my own ask" } });
r = await a2pro("/asks/alerts");
assert.ok(!r.data.top.some((a) => a.id === ownAsk.data.ask.id), "own ask must not self-route");
ok("your own ask is never surfaced back to you as work");

// An expired ask must not be counted — the count filters instead of sweeping.
await db.ask.update({ where: { id: fresh.data.ask.id }, data: { expiresAt: new Date(Date.now() - 86400000) } });
r = await a2pro("/asks/alerts");
assert.ok(!r.data.top.some((a) => a.id === fresh.data.ask.id), "lapsed ask must drop out of the count");
const stillOpen = await db.ask.findUnique({ where: { id: fresh.data.ask.id } });
assert.equal(stillOpen.status, "open", "the COUNT must not have written — a hot-path read stays a read");
ok("lapsed ask excluded from the count, and the count did not write to it");

await db.business.update({ where: { id: `${P}a2` }, data: { membershipTier: "free" } });
console.log(`\n${pass} checks passed.`);
await db.$disconnect();
