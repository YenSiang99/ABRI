-- CreateTable
CREATE TABLE "Engagement" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "businessAId" TEXT NOT NULL,
    "businessBId" TEXT NOT NULL,
    "proposedById" TEXT NOT NULL,
    "service" TEXT,
    "note" TEXT,
    "occurredOn" TIMESTAMP(3) NOT NULL,
    "askId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "Engagement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Engagement_businessAId_status_idx" ON "Engagement"("businessAId", "status");

-- CreateIndex
CREATE INDEX "Engagement_businessBId_status_idx" ON "Engagement"("businessBId", "status");

-- CreateIndex
CREATE INDEX "Engagement_proposedById_idx" ON "Engagement"("proposedById");

-- AddForeignKey
ALTER TABLE "Engagement" ADD CONSTRAINT "Engagement_businessAId_fkey" FOREIGN KEY ("businessAId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Engagement" ADD CONSTRAINT "Engagement_businessBId_fkey" FOREIGN KEY ("businessBId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Engagement" ADD CONSTRAINT "Engagement_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Engagement" ADD CONSTRAINT "Engagement_askId_fkey" FOREIGN KEY ("askId") REFERENCES "Ask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

