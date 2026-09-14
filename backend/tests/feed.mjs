// The network feed. Run e2e-setup.mjs first, with the backend up.
//
// What these assertions are really protecting is ONE property: a NetworkEvent
// is a pointer, never a copy, so the feed inherits moderation for free. Steps
// 2, 4 and 6 each undo something at its source and assert the announcement
// retracts itself, with nothing anywhere having written a compensating row.
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

// A clean slate for the businesses this file touches, so a re-run doesn't
// read a previous run's rows. Only ever e2e- ids.
const CAST = ["asker", "a2", "a3", "a4", "target", "t0", "t1"].map((k) => P + k);
await db.networkEvent.deleteMany({ where: { OR: [
  { subjectBusinessId: { in: CAST } }, { actorBusinessId: { in: CAST } },
] } });

const asker = await login(`${P}asker@e2e.test`);
const a2 = await login(`${P}a2@e2e.test`);
const a3 = await login(`${P}a3@e2e.test`);
const admin = await login(`${P}admin@e2e.test`);

const feed = async (client, scope = "network") => (await client(`/feed?scope=${scope}`)).data.events;
const findByVouch = (events, id) => events.find((e) => e.type === "vouch_published" && e.id === id);

// ─────────────────────────────────────────────────────────────────────────
console.log("\n1. Publishing a vouch puts it in the feed, with its testimonial");
// Plus, because acceptVouch is a Plus feature and this is about the feed.
await db.business.updateMany({ where: { id: { in: [`${P}a2`, `${P}asker`] } }, data: { membershipTier: "plus" } });
// A Vouch has four children plus a self-reference (currentRevisionId), so a
// bare deleteMany trips VouchRevision_vouchId_fkey. Unwind in dependency
// order, newest pointer first.
const stale = await db.vouch.findMany({
  where: { fromBusinessId: `${P}a2`, toBusinessId: `${P}asker` }, select: { id: true },
});
for (const { id } of stale) {
  await db.vouch.update({ where: { id }, data: { currentRevisionId: null } });
  await db.networkEvent.deleteMany({ where: { vouchId: id } });
  await db.vouchAction.deleteMany({ where: { vouchId: id } });
  await db.vouchFlag.deleteMany({ where: { vouchId: id } });
  await db.vouchRevision.deleteMany({ where: { vouchId: id } });
  await db.vouch.delete({ where: { id } });
}

let r = await a2("/vouches", { method: "POST", body: {
  toBusinessId: `${P}asker`, testimonial: "Sharpest corporate lawyers we have worked with." } });
assert.equal(r.status, 201, JSON.stringify(r.data));
const vouchId = r.data.vouch.id;
r = await asker(`/vouches/${vouchId}/accept`, { method: "POST" });
assert.equal(r.status, 200, JSON.stringify(r.data));

let events = await feed(asker);
let vouchEvent = events.find((e) => e.type === "vouch_published" && e.subject.id === `${P}asker`);
assert.ok(vouchEvent, "published vouch is in the feed");
assert.equal(vouchEvent.actor.id, `${P}a2`, "actor is the giver");
assert.equal(vouchEvent.quote, "Sharpest corporate lawyers we have worked with.");
ok(`vouch_published in feed, quoting VouchRevision (not a copy)`);

// ─────────────────────────────────────────────────────────────────────────
console.log("\n2. A vouch that stops being published drops out — no compensating write");
// Driven against the column rather than through a route, deliberately:
// "published" is TERMINAL today, so no endpoint can un-publish a vouch and
// there is no flow to exercise. What is being guarded here is the READ RULE
// in visibleNetworkEventsWhere, so that the day an admin decision or a
// retraction feature does move a published vouch, the feed already follows it
// without anybody remembering to write an un-announce. Step 4 exercises the
// same property through a real API path, where one exists.
const eventsBefore = await db.networkEvent.count({ where: { vouchId } });
await db.vouch.update({ where: { id: vouchId }, data: { status: "under_review" } });

events = await feed(asker);
assert.ok(!events.some((e) => e.id === vouchEvent.id), "an unpublished vouch is gone from the feed");
assert.equal(await db.networkEvent.count({ where: { vouchId } }), eventsBefore,
  "the NetworkEvent row is untouched — visibility is a read-time join, not a delete");

await db.vouch.update({ where: { id: vouchId }, data: { status: "published" } });
events = await feed(asker);
assert.ok(events.some((e) => e.id === vouchEvent.id), "and it comes back when the source does");
ok("feed follows the vouch's status both ways; its row never moves");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n3. Accepting an ask answer writes nothing to the feed");
// Until Sept 2026 this wrote recommendation_published and the accepted answer
// appeared here. The feature was removed: accepting is the asker settling
// their own question, and broadcasting it made one member's private choice
// into a public credential for another. Asserted rather than assumed, because
// "no row was written" is exactly the kind of absence that quietly comes back.
r = await asker("/asks", { method: "POST", body: {
  category: "Service requirement", matchCategory: "Accounting & Tax",
  matchLocation: "Petaling Jaya", title: "Feed test — need an accountant" } });
assert.equal(r.status, 201, JSON.stringify(r.data));
const askId = r.data.ask.id;

r = await a2(`/asks/${askId}/answers`, { method: "POST",
  body: { recommendedBusinessId: `${P}target`, comment: "They did our annual returns." } });
assert.equal(r.status, 201, JSON.stringify(r.data));
const answerId = r.data.answer.id;

const feedBefore = (await feed(asker)).length;
r = await asker(`/asks/${askId}/answers/${answerId}/accept`, { method: "POST" });
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(r.data.ask.status, "answered", "the ask is settled");

events = await feed(asker);
assert.equal(events.length, feedBefore, "the feed did not grow");
assert.equal(
  await db.networkEvent.count({ where: { subjectBusinessId: `${P}target`, type: "recommendation_published" } }),
  0,
  "no recommendation_published row exists for the named business",
);
ok("accepting settles the ask and writes no network event");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n6. Verification is announced, and revoking it retracts the announcement");
await db.business.update({ where: { id: `${P}t1` }, data: { verificationLevel: "L1" } });
await db.networkEvent.deleteMany({ where: { subjectBusinessId: `${P}t1` } });
r = await admin(`/admin/businesses/${P}t1/verify-ssm`, { method: "POST" });
assert.equal(r.status, 200, JSON.stringify(r.data));

events = await feed(asker);
const verified = events.find((e) => e.type === "business_verified" && e.subject.id === `${P}t1`);
assert.ok(verified, "business_verified is in the feed");
assert.equal(verified.actor, null, "no actor — an admin did this, and staff are not members");
assert.equal(verified.toVerificationLevel, "L2");

// A promotion must NOT retract it; only a revocation may. This is the case a
// plain equality check against toVerificationLevel would get backwards.
await db.business.update({ where: { id: `${P}t1` }, data: { verificationLevel: "L3" } });
events = await feed(asker);
assert.ok(events.some((e) => e.id === verified.id), "L2 -> L3 leaves the announcement standing");

// Back to L2 so the route's own guard passes — it refuses to revoke anything
// that isn't currently SSM-verified.
await db.business.update({ where: { id: `${P}t1` }, data: { verificationLevel: "L2" } });
r = await admin(`/admin/businesses/${P}t1/revoke-ssm`, { method: "POST" });
assert.equal(r.status, 200, JSON.stringify(r.data));
events = await feed(asker);
assert.ok(!events.some((e) => e.id === verified.id), "revoking SSM retracts the announcement");
ok("business_verified survives promotion, retracts on revocation");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n7. The feed is never plan-gated");
await db.business.update({ where: { id: `${P}a3` }, data: { membershipTier: "free" } });
const freeRes = await a3("/feed");
assert.equal(freeRes.status, 200, `a Free member must get 200, got ${freeRes.status}`);
assert.notEqual(freeRes.data.events.length, 0, "and must see the same rows, not an empty list");
ok(`Free member reads the feed (${freeRes.data.events.length} events, no 402)`);

// ─────────────────────────────────────────────────────────────────────────
console.log("\n8. Connections and follows never appear, in either scope");
// Clear a3's follows first rather than assuming it starts with none. The
// scope assertion below is exact — every row must touch a followed business —
// so any follow this file did not create (a leftover from manual testing, or
// from a previous run) would make a legitimately-correct row look like a leak.
await db.follow.deleteMany({ where: { followerId: `${P}a3` } });
await a3("/follows", { method: "POST", body: { businessId: `${P}a2` } });
await a3("/connections", { method: "POST", body: { businessId: `${P}a2`, source: "directory" } });
for (const scope of ["network", "following"]) {
  const rows = await feed(a3, scope);
  assert.ok(!rows.some((e) => /connection|follow/.test(e.type)),
    `no connection/follow event in scope=${scope}`);
}
const followingRows = await feed(a3, "following");
assert.ok(followingRows.length > 0, "following a business with feed history must return rows");
assert.ok(followingRows.every((e) => e.actor?.id === `${P}a2` || e.subject.id === `${P}a2`),
  "the Following scope only returns rows touching a followed business");
ok("follows filter the feed and never fill it; connections appear nowhere");

// ─────────────────────────────────────────────────────────────────────────
console.log("\n9. Cursor paging returns no duplicates and no gaps");
// Seeded rather than assumed, because the steps above deliberately retract
// most of what they create. Two of these share an identical createdAt on
// purpose: a millisecond tie is exactly what @@index([createdAt, id]) and the
// id in the ORDER BY exist to resolve, and it is the case a createdAt-only
// cursor would silently drop or duplicate a row on.
const PAGING_SUBJECTS = ["a2", "a3", "a4", "a5", "a6", "a7"].map((k) => P + k);
await db.networkEvent.deleteMany({
  where: { type: "business_claimed", subjectBusinessId: { in: PAGING_SUBJECTS } },
});
const tie = new Date("2026-09-01T10:00:00.000Z");
for (const [i, id] of PAGING_SUBJECTS.entries()) {
  await db.networkEvent.create({ data: {
    type: "business_claimed", subjectBusinessId: id, toVerificationLevel: "L1",
    // The last two collide; the rest are a second apart.
    createdAt: i >= PAGING_SUBJECTS.length - 2 ? tie : new Date(tie.getTime() - (i + 1) * 1000),
  } });
}

// THE BASELINE IS A PREFIX, NOT "EVERYTHING", and the difference is what this
// assertion got wrong for a while. 50 is MAX_LIMIT in routes/feed.js, so this
// call returns AT MOST 50 rows however many exist — it was a stand-in for the
// whole feed only while the database held fewer than 50 visible events.
// scripts/seed-demo.mjs adds 48 on its own, which pushed a real feed to 56 and
// made this suite fail with a diff whose first divergence was at index 50: the
// end of the truncated list, not a paging fault. Paging was correct the whole
// time — no duplicates, no gaps, same order for all 50 it could compare.
//
// So the invariant is a PREFIX one: walking the feed two at a time must
// reproduce the first N ids of a single large read, for as far as that read
// goes. Asserting more than that would be asserting how much demo data happens
// to be loaded, which is not a property of the feed.
const all = (await asker(`/feed?limit=50`)).data;
assert.ok(all.events.length >= 6, `expected at least 6 events, got ${all.events.length}`);
// The loop runs until the cursor says stop. MAX_PAGES is a runaway guard, not
// a page budget — it was 20, which at two per page could only ever see 40
// events, so a feed larger than that ended the walk early and silently. That
// is the same fault as the baseline above: a constant sized for whatever the
// database happened to hold when it was written. Derived from the feed's own
// length so it scales with the data, with room to spare.
const MAX_PAGES = all.events.length * 2 + 20;
const seenEvents = [];
let cursor = null;
let pages = 0;
for (; pages < MAX_PAGES; pages++) {
  const res = await asker(`/feed?limit=2${cursor ? `&cursor=${cursor}` : ""}`);
  seenEvents.push(...res.data.events);
  cursor = res.data.nextCursor;
  if (!cursor) break;
}
const seen = seenEvents.map((e) => e.id);
// Hitting the guard means the cursor never returned null — a paging bug that
// would otherwise look like a short walk.
assert.ok(pages < MAX_PAGES, `cursor never terminated after ${MAX_PAGES} pages`);
assert.equal(new Set(seen).size, seen.length, "no id appears on two pages");
// Paging must reach at least as far as the capped read did, or it dropped rows.
assert.ok(
  seen.length >= all.events.length,
  `paging returned ${seen.length} events, fewer than the ${all.events.length} a single read saw`,
);
assert.deepEqual(
  seen.slice(0, all.events.length),
  all.events.map((e) => e.id),
  "paged order matches the unpaged order exactly",
);
// Checks the WHOLE walk, not just the prefix a capped read can cover — every
// row past index MAX_LIMIT is otherwise unverified, and those are exactly the
// rows only paging can reach. The order is the one routes/feed.js declares:
// createdAt descending, id descending to break a millisecond tie.
for (let i = 1; i < seenEvents.length; i++) {
  const prev = seenEvents[i - 1];
  const curr = seenEvents[i];
  const prevAt = new Date(prev.createdAt).getTime();
  const currAt = new Date(curr.createdAt).getTime();
  assert.ok(
    prevAt > currAt || (prevAt === currAt && prev.id > curr.id),
    `paging broke the sort between ${prev.id} (${prev.createdAt}) and ${curr.id} (${curr.createdAt})`,
  );
}
const tied = all.events.filter((e) => new Date(e.createdAt).getTime() === tie.getTime());
assert.equal(tied.length, 2, "both same-millisecond events survived paging");
ok(`paged ${seen.length} events two at a time — no duplicates, same order, ties held`);

console.log("\n10. Every row carries what a vouch button needs, and nothing more");
// The feed's action buttons make NO extra request: isVouchable reads
// target.id + target.verificationLevel, and VouchDialog renders name and
// category. The whole "no backend change" claim rests on those four fields
// being present on every row, so assert it rather than assume it.
for (const e of all.events) {
  for (const key of ["id", "name", "category", "location", "verificationLevel"]) {
    assert.ok(e.subject?.[key], `subject.${key} missing on a ${e.type} row`);
  }
  // The actor is null on the two level types (an admin did those) and a full
  // business on the two content types. Never a bare id.
  if (e.actor !== null) assert.ok(e.actor.id && e.actor.name, "an actor must be a business, not an id");
}
ok(`all ${all.events.length} rows carry a complete subject business`);

console.log("\n11. No contact detail or membership tier crosses the wire");
const raw = JSON.stringify(all);
for (const key of ["phone", "whatsapp", "membershipTier", "passwordHash", "email"]) {
  assert.ok(!raw.includes(`"${key}"`), `feed payload must not carry ${key}`);
}
ok("payload carries id/name/category/location/verificationLevel and nothing else");

console.log(`\n${pass} checks passed.`);
await db.$disconnect();
