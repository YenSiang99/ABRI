-- One-time codes sent to a listing's email on file, so a pending claimant who
-- can read that inbox is approved at once. See the note on ClaimCode in
-- schema.prisma.
CREATE TABLE "ClaimCode" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "sentTo" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimCode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClaimCode_accountId_createdAt_idx" ON "ClaimCode"("accountId", "createdAt");
CREATE INDEX "ClaimCode_businessId_createdAt_idx" ON "ClaimCode"("businessId", "createdAt");

ALTER TABLE "ClaimCode" ADD CONSTRAINT "ClaimCode_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClaimCode" ADD CONSTRAINT "ClaimCode_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
