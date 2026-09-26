// The profile map pin — Business.lat/lng. Run e2e-setup.mjs first.
//
// Three things are under test: the pin is public on the profile, a member
// cannot set it through PATCH /me, and changing the address clears it (the
// pin came from a seed source and belongs to the old address) while saving
// the same address again does not.
import { PrismaClient } from "@prisma/client";
import assert from "node:assert";
import { API, TEST_DATABASE_URL } from "./env.mjs";
const db = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
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

const ADDRESS = "1 Jalan SS 2/24, 47300 Petaling Jaya";
const before = await db.business.findUnique({ where: { id: `${P}t1` }, select: { address: true, lat: true, lng: true } });
await db.business.update({ where: { id: `${P}t1` }, data: { address: ADDRESS, lat: 3.118, lng: 101.622 } });

const t1 = await login(`${P}t1@e2e.test`);
const anon = async (path) => {
  const r = await fetch(`${API}${path}`);
  return { status: r.status, data: await r.json().catch(() => null) };
};

try {
  console.log("\n1. The pin is public");
  let r = await anon(`/businesses/${P}t1`);
  assert.equal(r.status, 200);
  assert.equal(r.data.business.lat, 3.118);
  assert.equal(r.data.business.lng, 101.622);
  ok("an anonymous profile read carries lat/lng");

  console.log("\n2. A member cannot set it");
  r = await t1("/businesses/me", { method: "PATCH", body: { lat: 1, lng: 1 } });
  assert.equal(r.status, 400, `PATCH /me must refuse lat/lng, got ${r.status}`);
  ok("PATCH /me refuses lat/lng");

  console.log("\n3. Saving the same address keeps it");
  r = await t1("/businesses/me", { method: "PATCH", body: { address: ADDRESS, openingHours: "Mon–Fri 9–6" } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  let row = await db.business.findUnique({ where: { id: `${P}t1` }, select: { lat: true, lng: true } });
  assert.deepEqual(row, { lat: 3.118, lng: 101.622 });
  ok("an unchanged address keeps its pin");

  console.log("\n4. A new address clears it");
  r = await t1("/businesses/me", { method: "PATCH", body: { address: "2 Jalan Tun Razak, 50400 Kuala Lumpur" } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  row = await db.business.findUnique({ where: { id: `${P}t1` }, select: { lat: true, lng: true } });
  assert.deepEqual(row, { lat: null, lng: null });
  ok("a changed address drops the old pin");
} finally {
  await db.business.update({ where: { id: `${P}t1` }, data: before });
}

console.log(`\n${pass} checks passed.`);
await db.$disconnect();
