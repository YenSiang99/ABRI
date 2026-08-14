-- DropForeignKey
ALTER TABLE "PendingConnection" DROP CONSTRAINT "PendingConnection_accountId_fkey";

-- CreateIndex
CREATE INDEX "Connection_businessBId_idx" ON "Connection"("businessBId");

-- AddForeignKey
ALTER TABLE "PendingConnection" ADD CONSTRAINT "PendingConnection_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
