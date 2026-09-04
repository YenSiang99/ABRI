-- Reverse of migration.sql. Prisma has no `migrate down`, so this is run by
-- hand: psql "$DIRECT_URL" -f DOWN.sql
--
-- Kept beside the migration rather than in a PR description so it cannot be
-- separated from the thing it reverses.
ALTER TABLE "Business" RENAME COLUMN "membershipTierExpiresAt" TO "planExpiresAt";
ALTER TABLE "Business" RENAME COLUMN "membershipTierStartedAt" TO "planStartedAt";
ALTER TABLE "Business" RENAME COLUMN "membershipTier" TO "membershipPlan";

ALTER TABLE "Business" ALTER COLUMN "verificationLevel" DROP DEFAULT;
UPDATE "Business" SET "verificationLevel" = 'T0' WHERE "verificationLevel" = 'L0';
UPDATE "Business" SET "verificationLevel" = 'T1' WHERE "verificationLevel" = 'L1';
UPDATE "Business" SET "verificationLevel" = 'T2' WHERE "verificationLevel" = 'L2';
UPDATE "Business" SET "verificationLevel" = 'T3' WHERE "verificationLevel" = 'L3';
UPDATE "Business" SET "verificationLevel" = 'T4' WHERE "verificationLevel" = 'L4';
ALTER TABLE "Business" RENAME COLUMN "verificationLevel" TO "tier";
ALTER TABLE "Business" ALTER COLUMN "tier" SET DEFAULT 'T0';

-- Also: DELETE FROM "_prisma_migrations"
--       WHERE migration_name = '20260831120000_rename_axes_tier_level';
