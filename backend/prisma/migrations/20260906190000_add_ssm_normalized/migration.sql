-- The lookup key for a registration number: the same value as "ssm" with
-- every separator removed and upper-cased.
--
-- A second column rather than normalizing "ssm" in place because the two have
-- different readers — an admin needs the number as printed, a lookup needs one
-- canonical form — and Prisma cannot strip punctuation from a column inside a
-- WHERE, so it has to be done on write.
--
-- No backfill: "ssm" is null on every row (nothing has ever written one; the
-- submission route that fills it ships in this same change).
ALTER TABLE "Business" ADD COLUMN "ssmNormalized" TEXT;

CREATE INDEX "Business_ssmNormalized_idx" ON "Business"("ssmNormalized");
