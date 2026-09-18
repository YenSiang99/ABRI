-- Name which end of an engagement DELIVERED the service.
--
-- Split out of the projects migration when projects was shelved: the fix is
-- independent of that feature and outlives it. Without this column,
-- engagementSummaryFor credits `service` to BOTH ends of the pair, which put
-- "SST advisory" on the public profile of a bakery whose only involvement was
-- paying for it.

-- AlterTable
ALTER TABLE "Engagement" ADD COLUMN     "serviceProvidedById" TEXT;

-- CreateIndex
CREATE INDEX "Engagement_serviceProvidedById_idx" ON "Engagement"("serviceProvidedById");

-- AddForeignKey
ALTER TABLE "Engagement" ADD CONSTRAINT "Engagement_serviceProvidedById_fkey" FOREIGN KEY ("serviceProvidedById") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: name the provider on every engagement that already has a service.
--
-- This is NOT a guess. LogEngagementDialog has only ever offered services from
-- the TARGET's catalogue (frontend/src/pages/app/Profile.jsx — "The service
-- list follows the TARGET's category, not the member's own"), so a stored
-- service can only ever describe the business that did NOT propose the row.
-- That is a structural fact about how every existing row was written.
--
-- Rows with no service stay NULL: "who provided it" means nothing without one.
-- engagementSummaryFor treats a NULL provider as "credit both ends", which is
-- the behaviour those rows have always had, so nothing this misses breaks.
UPDATE "Engagement"
SET "serviceProvidedById" =
  CASE WHEN "proposedById" = "businessAId" THEN "businessBId" ELSE "businessAId" END
WHERE "service" IS NOT NULL;
