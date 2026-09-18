import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { TEST_DATABASE_URL } from "./env.mjs";

// Runs every suite in this directory, in order, against a backend IT STARTS
// ITSELF on TEST_PORT, pointed at TEST_DATABASE_URL.
//
//   npm run db:start        # Postgres
//   npm test                # this — starts its own API, runs, stops it
//
// IT USED TO NEED YOUR DEV SERVER, and that is the thing that changed. The
// suites drove http://localhost:4000, which is the server you run with
// `npm run dev`, which is pointed at the DEVELOPMENT database — so every run
// wrote `e2e-asker`, "concurrency: 8 answer at once, cap is 6" and a fresh
// copy of every moderation fixture into the directory you were looking at in
// the browser. Nothing was broken; the tests were simply aimed at the wrong
// database, and they were aimed there by every suite independently.
//
// Now there is one database for you and one for them, and neither this file
// nor any suite can reach yours: env.mjs resolves TEST_DATABASE_URL, and the
// API below is started with that as its DATABASE_URL on a port your dev server
// does not use. Run `npm run dev` beside this as much as you like.
//
// Each suite drives the real API over HTTP with real sessions and asserts with
// node:assert. There is no test framework — that is deliberate for now, and
// the cost of it is this file: the ordering knowledge below has to live
// somewhere, and until this existed it lived in whoever last ran them.

const here = path.dirname(fileURLToPath(import.meta.url));

// SEEDED FIRST, ALWAYS. Every suite assumes the ten e2e- businesses exist;
// none of them creates its own from scratch. Not a test, which is why it is
// named fixtures.mjs and is not in the list below.
const FIXTURES = "fixtures.mjs";

// ORDER IS LOAD-BEARING. Three real dependencies, each found the hard way:
//
//   tiers.mjs BEFORE OR AFTER asks.mjs — either is fine, but only because
//     tiers.mjs cleans up the vouch graph it builds on e2e-target. asks.mjs
//     asserts that business's vouch count is unchanged by accepting an answer,
//     so a tiers.mjs that skipped its teardown would fail a suite it never
//     touches, and the failure would look like asks' bug.
//
//   lookup.mjs EXHAUSTS ITS OWN RATE-LIMIT BUDGET. Its last step fires 40
//     anonymous lookups to prove the limiter trips — that is the assertion.
//     The limiter is a 60-second window keyed on IP for anonymous callers, so
//     lookup.mjs waits the window out at its start rather than failing on a
//     second run inside a minute.
//
//   ask-concurrency.mjs fires 8 simultaneous answers at one ask. Kept last:
//     it is the only suite that deliberately contends, and giving it a quiet
//     database makes its "no 5xx" assertion mean something.
const SUITES = [
  "asks.mjs",
  "ask-alerts.mjs",
  "ask-moderation.mjs",
  "feed.mjs",
  "ssm-verification.mjs",
  "lookup.mjs",
  "directory.mjs",
  "tiers.mjs",
  // Before ask-concurrency for the reason stated above: that one wants a quiet
  // database. This suite creates and confirms engagements between the e2e
  // businesses and cleans none of them up — they are fixtures' rows to remove,
  // not this file's, and teardown-e2e.mjs knows about the table.
  "engagements.mjs",
  // After engagements.mjs, which is the regression guard on the provider rule:
  // if the null-means-both credit in engagementSummaryFor has been tightened,
  // that suite fails first and says so plainly, rather than this one failing in
  // a way that looks like a projects bug.
  //
  // Before ask-concurrency.mjs for the reason stated above — that one wants a
  // quiet database — even though this suite also contends deliberately (two
  // simultaneous completes). Its contention is against one row it created
  // itself, so it disturbs nothing else.
  "projects.mjs",
  "ask-concurrency.mjs",
];

function run(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(here, file)], {
      // Inherited so a failing assertion prints its own stack where you can
      // read it. Capturing and re-printing would bury the one line that says
      // which assertion went.
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code, out }));
  });
}

const label = (f) => f.replace(/\.mjs$/, "").padEnd(28);

// Not 4000. A dev server on the default port must be able to keep running
// beside this, against its own database, without either noticing the other.
const TEST_PORT = Number(process.env.TEST_PORT ?? 4010);
const TEST_API_URL = `http://localhost:${TEST_PORT}`;

// Passed to every suite through the environment rather than written into a
// file, so nothing here can leave a checkout pointed at the test database.
//
// DATABASE_URL and DIRECT_URL are set here too, not just TEST_DATABASE_URL, and
// that is load-bearing rather than belt-and-braces. Two suites import a src/
// module directly (tiers.mjs reaches for notifyWatchers), and those modules
// construct a bare `new PrismaClient()` that resolves its own connection —
// which lands on the DEVELOPMENT database unless the variable it reads is
// already pointing elsewhere. The symptom when it is not is silent and
// baffling: the suite writes a row through the API, reads it back through its
// own client, and the src/ module sees no row at all, because the three are
// not all looking at the same database.
const childEnv = {
  ...process.env,
  TEST_DATABASE_URL,
  TEST_API_URL,
  DATABASE_URL: TEST_DATABASE_URL,
  DIRECT_URL: TEST_DATABASE_URL,
};

async function startApi() {
  const server = spawn(process.execPath, [path.join(here, "..", "src", "index.js")], {
    env: {
      ...childEnv,
      DATABASE_URL: TEST_DATABASE_URL,
      DIRECT_URL: TEST_DATABASE_URL,
      PORT: String(TEST_PORT),
      // The suites drive the API directly, never a browser, so no origin ever
      // needs to be allowed through CORS.
      FRONTEND_URL: TEST_API_URL,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let log = "";
  server.stdout.on("data", (d) => (log += d));
  server.stderr.on("data", (d) => (log += d));

  // Poll rather than sleep: startup is fast when Postgres is warm and slow the
  // first time Prisma opens a pool, and a fixed wait has to be long enough for
  // the second on every single run.
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      console.error(log);
      throw new Error(`Test API exited with code ${server.exitCode} before it was ready.`);
    }
    try {
      const res = await fetch(`${TEST_API_URL}/health/db`);
      if (res.ok) return server;
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  server.kill("SIGKILL");
  console.error(log);
  throw new Error(`Test API did not become healthy on ${TEST_API_URL} within 30s.`);
}

console.log(`Starting test API on ${TEST_API_URL} (database: abri_test)…`);
const api = await startApi();

// Killed on every exit path, including Ctrl-C, so an interrupted run does not
// leave a server holding the port and the test database open.
const stopApi = () => {
  if (!api.killed) api.kill("SIGTERM");
};
process.on("exit", stopApi);
process.on("SIGINT", () => {
  stopApi();
  process.exit(130);
});

// The 22 base listings, which several suites assume exist rather than create:
// directory.mjs needs the row count to be able to exceed its paging cap, and
// lookup.mjs searches names it does not own. They were always there when the
// tests ran against the development database; on a database of their own they
// have to be put there. Idempotent upserts, so this is free on every run after
// the first.
console.log("Seeding base listings…");
const listings = await new Promise((resolve) => {
  const child = spawn(process.execPath, [path.join(here, "..", "prisma", "seed.js")], {
    env: { ...childEnv, DATABASE_URL: TEST_DATABASE_URL, DIRECT_URL: TEST_DATABASE_URL },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  child.on("close", (code) => resolve({ code, out }));
});
if (listings.code !== 0) {
  console.error(listings.out);
  console.error("\nCould not seed the base listings into the test database.");
  stopApi();
  process.exit(1);
}

console.log("Seeding fixtures…");
const seeded = await run(FIXTURES);
if (seeded.code !== 0) {
  console.error(seeded.out);
  console.error("\nCould not seed fixtures. Is the database up (npm run db:start)?");
  stopApi();
  process.exit(1);
}

const results = [];
for (const suite of SUITES) {
  const { code, out } = await run(suite);
  // Every suite ends with "N checks passed." except ask-concurrency, which
  // prints its own summary lines — so fall back to the exit code rather than
  // insisting on a format none of them agreed to.
  const passed = out.match(/(\d+) checks passed\./)?.[1];
  const ok = code === 0;
  results.push({ suite, ok, passed, out });
  console.log(
    `  ${ok ? "✓" : "✗"} ${label(suite)}${ok ? (passed ? `${passed} checks` : "ok") : "FAILED"}`,
  );
}

// Failures are printed AFTER the whole run, not on first sight, and the run
// never stops early. These suites are largely independent; halting on the
// first would hide the state of the other nine, which is exactly what you
// want to know when something has broken widely.
const failed = results.filter((r) => !r.ok);
for (const r of failed) {
  console.error(`\n${"─".repeat(60)}\n${r.suite}\n${"─".repeat(60)}`);
  console.error(r.out.trimEnd());
}

const total = results.reduce((n, r) => n + Number(r.passed ?? 0), 0);
console.log(
  `\n${results.length - failed.length}/${results.length} suites passed · ${total} checks`,
);
process.exit(failed.length === 0 ? 0 : 1);
