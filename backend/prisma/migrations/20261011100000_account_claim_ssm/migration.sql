-- The SSM number a claimant typed with their claim, kept on the account until
-- approval copies it to the business. See Account.claimSsm in schema.prisma.
ALTER TABLE "Account" ADD COLUMN "claimSsm" TEXT;
