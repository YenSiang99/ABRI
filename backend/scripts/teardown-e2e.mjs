// Removes every row the e2e suites create, and nothing else.
//
// Fixtures prefix all their business ids with `e2e-` and all their account
// emails with `@e2e.test` (tests/fixtures.mjs), so those two predicates define
// the whole footprint. Everything below is reachable from them.
//
//   node scripts/teardown-e2e.mjs --dry-run   # count only, no writes
//   node scripts/teardown-e2e.mjs             # delete
//
// ORDER IS LOAD-BEARING. The schema declares only three onDelete: Cascade
// rules, so every other child has to go before its parent or Postgres refuses
// the delete. The one genuine trap is Vouch <-> VouchRevision: the vouch points
// at its current revision and the revision points back at the vouch, so the
// pointer is nulled first and the revisions go before the vouch.
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";

const DRY = process.argv.includes("--dry-run");
const url = fs.readFileSync(new URL("../.env", import.meta.url), "utf8")
  .match(/^DIRECT_URL=(.*)$/m)[1].trim().replace(/^"|"$/g, "");
const db = new PrismaClient({ datasourceUrl: url });

const businesses = await db.business.findMany({ where: { id: { startsWith: "e2e-" } }, select: { id: true } });
const accounts = await db.account.findMany({
  where: { OR: [{ email: { endsWith: "@e2e.test" } }, { businessId: { startsWith: "e2e-" } }] },
  select: { id: true },
});
const bizIds = businesses.map((b) => b.id);
const accIds = accounts.map((a) => a.id);
const biz = { in: bizIds };

if (bizIds.length === 0 && accIds.length === 0) {
  console.log("Nothing to remove — no e2e- businesses and no @e2e.test accounts.");
  await db.$disconnect();
  process.exit(0);
}

// Asks and vouches owned by e2e businesses drag their own children along, so
// their ids are needed before anything is deleted.
const askIds = (await db.ask.findMany({ where: { askedByBusinessId: biz }, select: { id: true } })).map((a) => a.id);
const answerIds = (await db.askAnswer.findMany({
  where: { OR: [{ answeredByBusinessId: biz }, { recommendedBusinessId: biz }, { askId: { in: askIds } }] },
  select: { id: true },
})).map((a) => a.id);
const vouchIds = (await db.vouch.findMany({
  where: { OR: [{ fromBusinessId: biz }, { toBusinessId: biz }] }, select: { id: true },
})).map((v) => v.id);

const steps = [
  ["networkEvent",  { OR: [{ actorBusinessId: biz }, { subjectBusinessId: biz }, { vouchId: { in: vouchIds } }] }],
  ["askFlag",       { OR: [{ askId: { in: askIds } }, { answerId: { in: answerIds } }, { againstBusinessId: biz }, { raisedByBusinessId: biz }, { resolvedByAccountId: { in: accIds } }] }],
  ["askAnswer",     { id: { in: answerIds } }],
  ["ask",           { id: { in: askIds } }],
  ["vouchFlag",     { OR: [{ vouchId: { in: vouchIds } }, { againstBusinessId: biz }, { raisedByBusinessId: biz }, { resolvedByAccountId: { in: accIds } }] }],
  ["vouchAction",   { OR: [{ vouchId: { in: vouchIds } }, { actorAccountId: { in: accIds } }] }],
  // Vouch.currentRevisionId -> VouchRevision.id has no cascade; break it first.
  ["__nullRevisionPointers", null],
  ["vouchRevision", { OR: [{ vouchId: { in: vouchIds } }, { createdById: { in: accIds } }] }],
  ["vouch",         { id: { in: vouchIds } }],
  ["activityEvent", { OR: [{ actorBusinessId: biz }, { businessId: biz }] }],
  ["connection",    { OR: [{ businessAId: biz }, { businessBId: biz }, { requestedById: biz }] }],
  ["follow",        { OR: [{ followerId: biz }, { followedId: biz }] }],
  ["businessWatch", { OR: [{ watcherId: biz }, { watchedId: biz }] }],
  ["businessCheck", { OR: [{ checkedById: biz }, { checkedId: biz }] }],
  // Both directions: an e2e business that looked at a real one, and a real one
  // that looked at an e2e profile. The FK is RESTRICT, so a missed row here
  // blocks the business delete at the bottom of this list rather than being
  // cleaned up by it.
  ["profileView",   { OR: [{ viewerId: biz }, { viewedId: biz }] }],
  // Both ends, plus anything proposed by an e2e business against a real one.
  // Position in this list does not matter for the ask FK — Engagement.askId is
  // SET NULL, so the ask delete above nulls it rather than being blocked by it.
  // It DOES matter for the three business FKs, which are RESTRICT like every
  // other relation here, so this has to run before the business delete.
  ["engagement",    { OR: [{ businessAId: biz }, { businessBId: biz }, { proposedById: biz }] }],
  ["deferredConnection", { OR: [{ accountId: { in: accIds } }, { businessId: biz }] }],
  ["emailVerificationToken", { OR: [{ accountId: { in: accIds } }, { businessId: biz }] }],
  ["account",       { id: { in: accIds } }],
  ["business",      { id: { in: bizIds } }],
];

const run = async (tx) => {
  const report = {};
  for (const [model, where] of steps) {
    if (model === "__nullRevisionPointers") {
      if (!DRY) await tx.vouch.updateMany({ where: { id: { in: vouchIds } }, data: { currentRevisionId: null } });
      continue;
    }
    report[model] = DRY
      ? await tx[model].count({ where })
      : (await tx[model].deleteMany({ where })).count;
  }
  return report;
};

const report = DRY ? await run(db) : await db.$transaction(run);

console.log(DRY ? "\n=== DRY RUN — would delete ===" : "\n=== DELETED ===");
console.table(report);
console.log(`total rows: ${Object.values(report).reduce((a, b) => a + b, 0)}`);

const leftBiz = await db.business.count({ where: { id: { startsWith: "e2e-" } } });
const leftAcc = await db.account.count({ where: { email: { endsWith: "@e2e.test" } } });
const realBiz = await db.business.count({ where: { id: { not: { startsWith: "e2e-" } } } });
const realAcc = await db.account.count({ where: { email: { not: { endsWith: "@e2e.test" } } } });
console.log(`\ne2e remaining:  ${leftBiz} businesses, ${leftAcc} accounts`);
console.log(`real remaining: ${realBiz} businesses, ${realAcc} accounts`);
await db.$disconnect();
