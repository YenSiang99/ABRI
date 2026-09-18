import fs from "node:fs";

// Where the suites read and write, resolved in ONE place.
//
// WHY THIS FILE EXISTS. Every suite used to carry its own copy of
//
//   fs.readFileSync(new URL("../.env", …)).match(/^DIRECT_URL=(.*)$/m)[1]…
//
// which meant eleven files independently decided which database the tests hit,
// and they all decided "the development one". That is how a browser tab ended
// up showing `e2e-primary` and its fixtures beside real businesses: the suites were never wrong, they were pointed at the wrong
// database, and every `npm test` added another copy of their rows.
//
// TEST_DATABASE_URL is that database now. DIRECT_URL stays as the fallback so
// a checkout without the new .env line still runs — it just runs where it used
// to, which is the behaviour to keep working rather than to fail loudly on.

function fromEnvFile(key) {
  const path = new URL("../.env", import.meta.url);
  if (!fs.existsSync(path)) return null;
  const match = fs
    .readFileSync(path, "utf8")
    .match(new RegExp(`^${key}=(.*)$`, "m"));
  return match ? match[1].trim().replace(/^["']|["']$/g, "") : null;
}

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? fromEnvFile("TEST_DATABASE_URL") ?? fromEnvFile("DIRECT_URL");

if (!TEST_DATABASE_URL) {
  throw new Error(
    "No TEST_DATABASE_URL or DIRECT_URL in backend/.env — see tests/README.md.",
  );
}

// The API the suites drive. run-all.mjs starts a backend of its own against the
// test database and points this at it, so the two never share a port with the
// server you are running in another terminal.
const API = process.env.TEST_API_URL ?? "http://localhost:4000";

export { TEST_DATABASE_URL, API };
