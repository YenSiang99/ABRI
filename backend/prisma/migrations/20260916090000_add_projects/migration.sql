-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "createdById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "askId" TEXT,
    "startedOn" TIMESTAMP(3) NOT NULL,
    "completedOn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectParticipant" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'invited',
    "serviceProvided" TEXT,
    "invitedById" TEXT NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "ProjectParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectUpdate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "authorBusinessId" TEXT,
    "type" TEXT NOT NULL,
    "body" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectUpdate_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Engagement" ADD COLUMN     "serviceProvidedById" TEXT,
ADD COLUMN     "projectId" TEXT;

-- CreateIndex
CREATE INDEX "Project_createdById_idx" ON "Project"("createdById");

-- CreateIndex
CREATE INDEX "Project_askId_idx" ON "Project"("askId");

-- CreateIndex
CREATE INDEX "Project_status_lastActionAt_idx" ON "Project"("status", "lastActionAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectParticipant_projectId_businessId_key" ON "ProjectParticipant"("projectId", "businessId");

-- CreateIndex
CREATE INDEX "ProjectParticipant_businessId_status_idx" ON "ProjectParticipant"("businessId", "status");

-- CreateIndex
CREATE INDEX "ProjectParticipant_invitedById_idx" ON "ProjectParticipant"("invitedById");

-- CreateIndex
CREATE INDEX "ProjectUpdate_projectId_createdAt_idx" ON "ProjectUpdate"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectUpdate_authorBusinessId_idx" ON "ProjectUpdate"("authorBusinessId");

-- CreateIndex
CREATE INDEX "Engagement_serviceProvidedById_idx" ON "Engagement"("serviceProvidedById");

-- CreateIndex
CREATE INDEX "Engagement_projectId_idx" ON "Engagement"("projectId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_askId_fkey" FOREIGN KEY ("askId") REFERENCES "Ask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectParticipant" ADD CONSTRAINT "ProjectParticipant_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectParticipant" ADD CONSTRAINT "ProjectParticipant_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectParticipant" ADD CONSTRAINT "ProjectParticipant_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectUpdate" ADD CONSTRAINT "ProjectUpdate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectUpdate" ADD CONSTRAINT "ProjectUpdate_authorBusinessId_fkey" FOREIGN KEY ("authorBusinessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Engagement" ADD CONSTRAINT "Engagement_serviceProvidedById_fkey" FOREIGN KEY ("serviceProvidedById") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Engagement" ADD CONSTRAINT "Engagement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
