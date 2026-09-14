// Fills the network feed with what already happened, so it isn't empty the
// first time anyone opens it.
//
// Idempotent: every row is keyed to the vouch or answer it points at, and
// this skips anything that already has one. Safe to re-run.
//
// TWO OF THE FOUR TYPES CANNOT BE BACKFILLED, and that is not a gap to fix
// later. business_claimed and business_verified announce a MOVE, and
// Business.verificationLevel is current state — there is no record anywhere of
// when a business reached L1 or L2. Inventing a timestamp (createdAt, say)
// would put "Meridian is now SSM-Verified" at the top of the feed for
// something that happened months ago. Those two types start accumulating from
// the next real claim approval and SSM verification.
//
//   node scripts/backfill-network-events.mjs

import { prisma } from "../src/prisma.js";

async function main() {
  // ── vouch_published ────────────────────────────────────────────────────
  // closedAt is when the vouch reached a terminal status, which for a
  // published one is when it went live. Rows missing it (there should be
  // none) fall back to createdAt rather than being skipped.
  const vouches = await prisma.vouch.findMany({
    where: { status: "published", networkEvents: { none: {} } },
    select: { id: true, fromBusinessId: true, toBusinessId: true, closedAt: true, createdAt: true },
  });

  for (const vouch of vouches) {
    await prisma.networkEvent.create({
      data: {
        type: "vouch_published",
        subjectBusinessId: vouch.toBusinessId,
        actorBusinessId: vouch.fromBusinessId,
        vouchId: vouch.id,
        createdAt: vouch.closedAt ?? vouch.createdAt,
      },
    });
  }

  console.log(`Backfilled ${vouches.length} vouch_published events.`);
  console.log(
    "Level events cannot be backfilled — see the note at the top of this file.",
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
