-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "privateBrowsing" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ProfileView" ADD COLUMN     "anonymous" BOOLEAN NOT NULL DEFAULT false;

