// The Ask ABRI chat: POST /ask's validation and its "not set up" answer over
// HTTP (run-all.mjs starts the API with GEMINI_API_KEY blank), then the model
// call itself in-process with fetch stubbed, so no run spends real quota.
import assert from "node:assert";
import { API } from "./env.mjs";

let pass = 0; const ok = (m) => { console.log("  ✓", m); pass++; };
const ask = async (body) => {
  const r = await fetch(`${API}/ask`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, data: await r.json().catch(() => null) };
};

// 1. Over HTTP, no key.
{
  const r = await fetch(`${API}/ask/status`).then((r) => r.json());
  assert.deepStrictEqual(r, { enabled: false }); ok("status says disabled with no key");
  assert.strictEqual((await ask({})).status, 400); ok("missing question → 400");
  assert.strictEqual((await ask({ question: "   " })).status, 400); ok("blank question → 400");
  assert.strictEqual((await ask({ question: "x".repeat(501) })).status, 400); ok("501 chars → 400");
  assert.strictEqual((await ask({ question: "What is ABRI?" })).status, 503); ok("valid question, no key → 503");
}

// 2. In-process, fetch stubbed.
{
  process.env.GEMINI_API_KEY = "test-key";
  const { askModel, askModelConfigured } = await import("../src/lib/askModel.js");
  assert.ok(askModelConfigured());

  let sent;
  globalThis.fetch = async (url, init) => {
    sent = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: " A trusted business network. " }] } }] }));
  };
  assert.strictEqual(await askModel("What is ABRI?"), "A trusted business network."); ok("returns the model's trimmed answer");
  assert.strictEqual(sent.init.headers["x-goog-api-key"], "test-key"); ok("key sent as a header, not in the URL");
  assert.ok(!sent.url.includes("test-key"));
  assert.match(sent.body.systemInstruction.parts[0].text, /SSM-Verified/); ok("knowledge file is in the instructions");
  assert.strictEqual(sent.body.contents[0].parts[0].text, "What is ABRI?"); ok("question sent as the user turn");

  await askModel("How long does that take?", [
    { role: "user", text: "How do I get verified?" },
    { role: "assistant", text: "Claim your listing with your SSM number." },
  ]);
  assert.deepStrictEqual(sent.body.contents.map((c) => c.role), ["user", "model", "user"]); ok("history sent before the question, assistant as model");

  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: "quota" } }), { status: 429 });
  await assert.rejects(askModel("hi"), (e) => e.status === 503); ok("provider error → 503 for the visitor");

  globalThis.fetch = async () => new Response(JSON.stringify({ candidates: [] }));
  await assert.rejects(askModel("hi"), (e) => e.status === 502); ok("empty answer → 502");
}

console.log(`\n${pass} checks passed.`);
