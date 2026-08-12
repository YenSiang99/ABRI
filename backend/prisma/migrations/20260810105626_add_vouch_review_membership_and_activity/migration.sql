-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "membershipPlan" TEXT NOT NULL DEFAULT 'basic';

-- AlterTable
ALTER TABLE "Vouch" ADD COLUMN     "lastActionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "revisionCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'pending';

-- CreateTable
CREATE TABLE "VouchNote" (
    "id" TEXT NOT NULL,
    "vouchId" TEXT NOT NULL,
    "authorBusinessId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VouchNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VouchFlag" (
    "id" TEXT NOT NULL,
    "vouchId" TEXT NOT NULL,
    "raisedByBusinessId" TEXT NOT NULL,
    "againstBusinessId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "testimonialSnapshot" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VouchFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "actorBusinessId" TEXT,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "VouchNote" ADD CONSTRAINT "VouchNote_vouchId_fkey" FOREIGN KEY ("vouchId") REFERENCES "Vouch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VouchNote" ADD CONSTRAINT "VouchNote_authorBusinessId_fkey" FOREIGN KEY ("authorBusinessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VouchFlag" ADD CONSTRAINT "VouchFlag_vouchId_fkey" FOREIGN KEY ("vouchId") REFERENCES "Vouch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VouchFlag" ADD CONSTRAINT "VouchFlag_raisedByBusinessId_fkey" FOREIGN KEY ("raisedByBusinessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VouchFlag" ADD CONSTRAINT "VouchFlag_againstBusinessId_fkey" FOREIGN KEY ("againstBusinessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_actorBusinessId_fkey" FOREIGN KEY ("actorBusinessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;
