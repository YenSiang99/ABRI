-- Rename Engagement to PortfolioEntry.
--
-- The word changed in the product first: the profile panel is a Portfolio now,
-- read the way an experience section reads, and "engagement" was never what
-- anyone called it out loud — the UI already said "Worked with" and "Log work".
--
-- A REAL RENAME rather than @@map("Engagement"). A map would have been free and
-- would have left the next person reading this schema with a table whose name
-- no screen, route or component still uses. The data is disposable at this
-- stage, so the cheap moment to do this properly is now.
--
-- RENAME rather than create-copy-drop: Postgres carries the rows, the primary
-- key and the foreign keys pointing at it across an ALTER ... RENAME, so no
-- data moves and nothing has to be backfilled.

ALTER TABLE "Engagement" RENAME TO "PortfolioEntry";

-- Constraints and indexes keep their old names through a table rename, which
-- leaves a schema where every index on PortfolioEntry is called Engagement_*.
-- Prisma will not notice, a human reading psql will.
ALTER TABLE "PortfolioEntry" RENAME CONSTRAINT "Engagement_pkey" TO "PortfolioEntry_pkey";
ALTER TABLE "PortfolioEntry" RENAME CONSTRAINT "Engagement_businessAId_fkey" TO "PortfolioEntry_businessAId_fkey";
ALTER TABLE "PortfolioEntry" RENAME CONSTRAINT "Engagement_businessBId_fkey" TO "PortfolioEntry_businessBId_fkey";
ALTER TABLE "PortfolioEntry" RENAME CONSTRAINT "Engagement_proposedById_fkey" TO "PortfolioEntry_proposedById_fkey";
ALTER TABLE "PortfolioEntry" RENAME CONSTRAINT "Engagement_serviceProvidedById_fkey" TO "PortfolioEntry_serviceProvidedById_fkey";

ALTER INDEX "Engagement_businessAId_status_idx" RENAME TO "PortfolioEntry_businessAId_status_idx";
ALTER INDEX "Engagement_businessBId_status_idx" RENAME TO "PortfolioEntry_businessBId_status_idx";
ALTER INDEX "Engagement_proposedById_idx" RENAME TO "PortfolioEntry_proposedById_idx";
ALTER INDEX "Engagement_serviceProvidedById_idx" RENAME TO "PortfolioEntry_serviceProvidedById_idx";

-- The stored notification types. These are read by ACTIVITY_MESSAGES in
-- backend/src/lib/activityEvents.js and matched by PORTFOLIO_TYPES in
-- frontend/src/lib/activityLinks.js; an event whose type neither recognises
-- renders as "Something happened." with a dead link.
UPDATE "ActivityEvent" SET "type" = 'portfolio_proposed'  WHERE "type" = 'engagement_proposed';
UPDATE "ActivityEvent" SET "type" = 'portfolio_confirmed' WHERE "type" = 'engagement_confirmed';
UPDATE "ActivityEvent" SET "type" = 'portfolio_declined'  WHERE "type" = 'engagement_declined';
UPDATE "ActivityEvent" SET "type" = 'portfolio_expired'   WHERE "type" = 'engagement_expired';
