import assert from "node:assert";
const API = "http://localhost:4000";
const P = "e2e-";
let pass = 0;
const ok = (m) => { console.log("  ✓", m); pass++; };

// A tiny cookie-jar client, one per business, so every call below goes
// through the real session middleware rather than around it.
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
  assert.equal(res.status, 200, `login ${key}: ${res.status} ${await res.text()}`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return async (path, { method = "GET", body } = {}) => {
    const r = await fetch(`${API}${path}`, {
      method, headers: { cookie, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
}

const asker = await login("asker");
const t1 = await login("t1");
const answerers = {};
for (const k of ["a2","a3","a4","a5","a6","a7"]) answerers[k] = await login(k);

console.log("\n1. T2 posts an ask");
// maxAnswers IS EXPLICIT NOW, and that is the point of the change it tracks.
// It used to default to 6 for every ask, so step 4 below tested a cap nobody
// had asked for. The default is null (uncapped) — a first-come lockout selects
// on speed rather than fit, which is the wrong axis for a board that routes
// work — so an ask that wants a limit states one, and this suite still covers
// the capped path because this ask does.
let r = await asker("/asks", { method: "POST", body: {
  category: "Service requirement", matchCategory: "Accounting & Tax",
  matchLocation: "Petaling Jaya", title: "Need an accountant for SSM annual returns",
  maxAnswers: 6,
}});
assert.equal(r.status, 201, JSON.stringify(r.data));
const askId = r.data.ask.id;
ok(`ask created (${askId}), slotsLeft ${r.data.ask.slotsLeft}/${r.data.ask.maxAnswers}`);

console.log("\n2. T1 can still answer — answering is not verificationLevel- or plan-gated");
r = await t1(`/asks/${askId}/answers`, { method: "POST",
  body: { recommendedBusinessId: `${P}target`, comment: "They handled ours last year." } });
assert.equal(r.status, 201, JSON.stringify(r.data));
assert.equal(r.data.answer.isSelfNomination, false);
ok("T1 answered and it names someone else, not a self-nomination");

console.log("\n3. Second answer from the same business is refused");
r = await t1(`/asks/${askId}/answers`, { method: "POST",
  body: { recommendedBusinessId: `${P}a2`, comment: "Also good." } });
assert.equal(r.status, 409, `expected 409, got ${r.status}`);
ok(`one answer per business (409: "${r.data.error}")`);

console.log("\n4. Fill the asker's own cap of 6, then a seventh is refused");
for (const k of ["a2","a3","a4","a5"]) {
  r = await answerers[k](`/asks/${askId}/answers`, { method: "POST",
    body: { recommendedBusinessId: `${P}target`, comment: `Suggesting from ${k}.` } });
  assert.equal(r.status, 201, `${k}: ${JSON.stringify(r.data)}`);
}
// 6th: a self-nomination, which also covers step 5.
r = await answerers.a6(`/asks/${askId}/answers`, { method: "POST",
  body: { recommendedBusinessId: `${P}a6`, comment: "We do exactly this." } });
assert.equal(r.status, 201);
assert.equal(r.data.answer.isSelfNomination, true, "a6 named itself");
ok("self-nomination accepted and flagged isSelfNomination:true");

r = await asker(`/asks/${askId}`);
assert.equal(r.data.ask.answerCount, 6);
assert.equal(r.data.ask.slotsLeft, 0);
assert.equal(r.data.ask.status, "open", "FULL MUST NOT BE A STATUS");
ok("ask is full (6/6, slotsLeft 0) and status is still 'open'");

r = await answerers.a7(`/asks/${askId}/answers`, { method: "POST",
  body: { recommendedBusinessId: `${P}target`, comment: "Seventh." } });
assert.equal(r.status, 409);
ok(`seventh answer refused (409: "${r.data.error}")`);

console.log("\n5. Asker cannot answer their own ask");
r = await asker(`/asks/${askId}/answers`, { method: "POST",
  body: { recommendedBusinessId: `${P}target`, comment: "me" } });
assert.equal(r.status, 400);
ok(`own-ask answer refused ("${r.data.error}")`);

console.log("\n6. Accept one answer");
// Counted before, so the assertion holds however many times this suite has
// been run against the same database.
const before = (await (await fetch(`${API}/businesses/${P}target`)).json()).business;
r = await asker(`/asks/${askId}`);
const chosen = r.data.ask.answers.find((a) => a.answeredBy.id === `${P}a2`);
r = await asker(`/asks/${askId}/answers/${chosen.id}/accept`, { method: "POST" });
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(r.data.ask.status, "answered");
ok("ask moved to 'answered' — accepting settles it");

console.log("\n7. Accepting publishes NOTHING to the business that was named");
// The whole point of the Sept 2026 removal, asserted rather than assumed.
// Accepting an answer used to put a Recommendation on the named business's
// profile and a recommendation_published row in the network feed; a reader
// could arrive at e2e-target's page and find a credential they had no part in
// creating. Now the asker's decision stops with the asker.
const prof = (await (await fetch(`${API}/businesses/${P}target`)).json()).business;
assert.equal(prof.recommendationCount, undefined, "no recommendationCount on the payload");
assert.equal(prof.recommendationsReceived, undefined, "no recommendations list on the payload");
assert.equal(prof.vouchCount, before.vouchCount, "and an accepted answer is not a vouch either");
ok("accepted answer leaves the named business's profile untouched");

// The answer itself still records who was named — that half survived, because
// it is how the ASKER knows who to call.
r = await asker(`/asks/${askId}`);
const accepted = r.data.ask.answers.find((a) => a.id === chosen.id);
assert.equal(accepted.status, "accepted");
assert.equal(accepted.recommended.id, `${P}target`, "the asker can still see who was named");
ok("the named business survives on the answer, for the asker");

console.log("\n8. Posting is refused below T2");
r = await t1("/asks", { method: "POST", body: {
  category: "Service requirement", matchCategory: "Law",
  matchLocation: "Bangsar", title: "T1 should not be able to post this" } });
assert.equal(r.status, 403, `expected 403, got ${r.status}`);
assert.ok(!r.data.requiredMembershipTier, "must be a VERIFICATION gate, not a tier gate");
ok(`T1 refused with 403 and no requiredMembershipTier ("${r.data.error}")`);

console.log("\n9. Routing tiers");
r = await answerers.a2("/asks?matchStrength=exact");   // PJ accountant, ask is PJ accounting
assert.ok(r.data.asks.some((a) => a.id === askId) === false, "answered asks leave the open board");
r = await asker("/asks/mine");
assert.equal(r.data.asks[0].matchStrength, null, "your own ask never counts as work for you");
ok("answered ask left the matches feed; own ask is not self-routed");

console.log("\n10. Closed vocabulary is enforced");
r = await asker("/asks", { method: "POST", body: {
  category: "Service requirement", matchCategory: "Accounting & Tax",
  matchLocation: "PJ", title: "free-text location" } });
assert.equal(r.status, 400);
ok(`"PJ" rejected ("${r.data.error}")`);

console.log(`\n${pass} checks passed.`);
console.log("ASK_ID=" + askId);
