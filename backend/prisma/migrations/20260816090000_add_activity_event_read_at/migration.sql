-- AlterTable
ALTER TABLE "ActivityEvent" ADD COLUMN "readAt" TIMESTAMP(3);

-- Backfill: every event that already exists predates this feature, so the
-- owner has had every chance to see it. Leaving them null would launch the
-- unread badge with a double-digit count of history for every member — a
-- notification for something they read weeks ago is a false alarm, and the
-- first thing it teaches is that the badge can be ignored.
UPDATE "ActivityEvent" SET "readAt" = "createdAt" WHERE "readAt" IS NULL;

-- CreateIndex
CREATE INDEX "ActivityEvent_businessId_readAt_idx" ON "ActivityEvent"("businessId", "readAt");
