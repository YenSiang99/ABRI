const API = "http://localhost:4000";
const P = "e2e-";
async function login(key) {
  // COLD_RETRY: Neon scales the compute to zero, so the first request after an
  // idle gap comes back 503 from the backend's own error handler. Harness
  // concern only — retry the wake-up rather than failing the run.
  let res;
  for (let attempt = 1; attempt <= 8; attempt++) {
    res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `${P}${key}@e2e.test`, password: "e2e-password-123" }),
    });
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

const asker = await login("asker");
const r0 = await asker("/asks", { method: "POST", body: {
  category: "Service requirement", matchCategory: "Accounting & Tax",
  matchLocation: "Petaling Jaya", title: "concurrency: 8 answer at once, cap is 6",
  // EXPLICIT, because the default is null (uncapped) as of Sep 2026. Without
  // this the eight writers all succeed and the suite asserts a cap that this
  // ask never had — it would fail while proving nothing about contention.
  // The race this covers is still real for any ask whose asker sets a limit.
  maxAnswers: 6 } });
const askId = r0.data.ask.id;

// Eight businesses fire simultaneously at a six-slot ask.
const keys = ["t1","a2","a3","a4","a5","a6","a7","target"];
const clients = await Promise.all(keys.map(login));
const results = await Promise.all(
  clients.map((c, i) =>
    c(`/asks/${askId}/answers`, { method: "POST",
      body: { recommendedBusinessId: `${P}target`, comment: `concurrent ${keys[i]}` } })),
);

const codes = {};
results.forEach((r) => { codes[r.status] = (codes[r.status] ?? 0) + 1; });
console.log("response codes:", codes);

const created = results.filter((r) => r.status === 201).length;
const refused = results.filter((r) => r.status === 409).length;
const errored = results.filter((r) => r.status >= 500).length;

const final = await asker(`/asks/${askId}`);
console.log("answers actually stored:", final.data.ask.answerCount, "cap:", final.data.ask.maxAnswers);

let bad = 0;
if (errored > 0) { console.log("✗ FAIL:", errored, "request(s) returned 5xx"); bad++; }
else console.log("✓ no 5xx — no 5xx under contention");
// The documented contract: never an error, and never more than one over.
if (final.data.ask.answerCount > 7) { console.log("✗ FAIL: cap overshot by more than one:", final.data.ask.answerCount); bad++; }
else console.log(`✓ cap held within the documented tolerance (${final.data.ask.answerCount}/6, max allowed 7)`);
if (created + refused !== 8) { console.log("✗ FAIL: some request neither succeeded nor was cleanly refused"); bad++; }
else console.log(`✓ every writer got a clean answer: ${created} created, ${refused} refused with 409`);
process.exit(bad ? 1 : 0);
