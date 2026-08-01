-- DropIndex
DROP INDEX "Account_businessId_key";

-- AlterTable
ALTER TABLE "Business" DROP COLUMN "claimStatus",
DROP COLUMN "verificationMethod";

-- AlterTable
ALTER TABLE "Account" ADD COLUMN "claimStatus" TEXT,
ADD COLUMN "verificationMethod" TEXT;
