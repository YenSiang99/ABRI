-- Gives an admin somewhere to be recorded. Until now a vouch flagged into
-- "under_review" had no exit at all, and the two tables that would have to
-- log the way out couldn't describe one: VouchAction.actorId is a Business
-- FK and admins have no business, and VouchFlag knew only that it had been
-- looked at, never how it was judged.
--
-- Every column is nullable, so nothing is backfilled — existing rows are
-- business/system actions and open reports, all of which are correctly
-- described by NULL here.

-- Which admin made an intervention. actorId stays NULL on those rows: an
-- admin is not a party to the vouch, and "actor is null" already reads as
-- "no business did this" for the expiry.
ALTER TABLE "VouchAction" ADD COLUMN "actorAccountId" TEXT;

ALTER TABLE "VouchAction"
  ADD CONSTRAINT "VouchAction_actorAccountId_fkey"
  FOREIGN KEY ("actorAccountId") REFERENCES "Account"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- How a report was judged. Separate from `status` because "reviewed" and
-- "agreed with" are different facts, and only the second is worth counting
-- when we later score businesses on flags upheld against them.
ALTER TABLE "VouchFlag" ADD COLUMN "outcome" TEXT;
ALTER TABLE "VouchFlag" ADD COLUMN "resolvedAt" TIMESTAMP(3);
ALTER TABLE "VouchFlag" ADD COLUMN "resolvedByAccountId" TEXT;

ALTER TABLE "VouchFlag"
  ADD CONSTRAINT "VouchFlag_resolvedByAccountId_fkey"
  FOREIGN KEY ("resolvedByAccountId") REFERENCES "Account"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
