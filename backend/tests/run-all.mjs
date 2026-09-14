import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Runs every suite in this directory, in order, against a RUNNING backend.
//
//   npm run db:start        # Postgres
//   npm run dev             # the API on :4000
//   npm test                # this
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
  "ask-concurrency.mjs",
];

function run(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(here, file)], {
      // Inherited so a failing assertion prints its own stack where you can
      // read it. Capturing and re-printing would bury the one line that says
      // which assertion went.
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code, out }));
  });
}

const label = (f) => f.replace(/\.mjs$/, "").padEnd(28);

console.log("Seeding fixtures…");
const seeded = await run(FIXTURES);
if (seeded.code !== 0) {
  console.error(seeded.out);
  console.error("\nCould not seed fixtures. Is the database up (npm run db:start)?");
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
