-- The network feed: one append-only row per thing the whole membership can
-- see happening. Sits beside ActivityEvent rather than inside it — that table
-- has a RECIPIENT, is fanned out per business, is pruned to 50 a head and
-- carries a read flag, and a feed needs none of those three things.
--
-- Hand-authored to match this directory's convention. Nothing is backfilled
-- here: scripts/backfill-network-events.mjs does that, because deriving the
-- rows needs the self-nomination rule from lib/asks.js, which is JS and not
-- expressible in this file.

CREATE TABLE "NetworkEvent" (
    "id" TEXT NOT NULL,
    -- Constrained by NETWORK_EVENT_TYPES in lib/networkEvents.js, not here:
    -- this schema has no enums anywhere, by convention.
    "type" TEXT NOT NULL,
    -- Who it is ABOUT. Always set.
    "subjectBusinessId" TEXT NOT NULL,
    -- Who DID it. Null when an admin did — staff never appear in a members'
    -- feed.
    "actorBusinessId" TEXT,
    -- Pointers to the live content, never copies of it.
    "vouchId" TEXT,
    "askAnswerId" TEXT,
    -- The level reached. A fact about the past that Business.verificationLevel
    -- stops being able to answer the moment the level moves again.
    "toVerificationLevel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NetworkEvent_pkey" PRIMARY KEY ("id")
);

-- The feed's ordering, and the reason id is in it: two events written inside
-- the same millisecond (approving a claim writes one while publishing the
-- recommendations it unblocks writes more) could otherwise swap places
-- between two pages and hand the reader a duplicate.
CREATE INDEX "NetworkEvent_createdAt_id_idx" ON "NetworkEvent"("createdAt", "id");
-- Both ends of the "Following" scope, which matches actor OR subject. Also FK
-- hygiene: Postgres does not index a foreign key for you, so without these the
-- RESTRICT check on a Business delete is a sequential scan.
CREATE INDEX "NetworkEvent_actorBusinessId_idx" ON "NetworkEvent"("actorBusinessId");
CREATE INDEX "NetworkEvent_subjectBusinessId_idx" ON "NetworkEvent"("subjectBusinessId");
-- Serves the backfill's idempotence check.
CREATE INDEX "NetworkEvent_vouchId_idx" ON "NetworkEvent"("vouchId");
CREATE INDEX "NetworkEvent_askAnswerId_idx" ON "NetworkEvent"("askAnswerId");

-- The two BUSINESS keys are RESTRICT, matching every other foreign key in this
-- schema: a business with feed history behind it must be unwound deliberately
-- rather than silently swept.
ALTER TABLE "NetworkEvent" ADD CONSTRAINT "NetworkEvent_subjectBusinessId_fkey"
  FOREIGN KEY ("subjectBusinessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NetworkEvent" ADD CONSTRAINT "NetworkEvent_actorBusinessId_fkey"
  FOREIGN KEY ("actorBusinessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The two CONTENT keys cascade, and the difference is what the row IS. A
-- NetworkEvent is a pointer with no independent content of its own — it says
-- "this vouch went live", and every word it renders is joined through this
-- key. Delete the vouch and there is nothing left to unwind deliberately;
-- there is only an announcement of something that no longer exists.
--
-- RESTRICT here was actively wrong rather than merely strict: routes/asks.js
-- deletes an AskAnswer as the compensating step when one loses the maxAnswers
-- race, so a RESTRICT would have made the feed able to wedge that path.
ALTER TABLE "NetworkEvent" ADD CONSTRAINT "NetworkEvent_vouchId_fkey"
  FOREIGN KEY ("vouchId") REFERENCES "Vouch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NetworkEvent" ADD CONSTRAINT "NetworkEvent_askAnswerId_fkey"
  FOREIGN KEY ("askAnswerId") REFERENCES "AskAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
