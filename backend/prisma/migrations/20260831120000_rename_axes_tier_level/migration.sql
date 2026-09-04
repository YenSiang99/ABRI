-- Renames all three axes so the product's one naming rule holds in the
-- database as well as in the code: a TIER is bought, a LEVEL is earned or
-- claimed.
--
--   Business.tier            -> verificationLevel        (earned, never for sale)
--   Business.membershipPlan  -> membershipTier           (bought, the only thing for sale)
--   Business.planStartedAt   -> membershipTierStartedAt
--   Business.planExpiresAt   -> membershipTierExpiresAt
--
-- and migrates the verification VALUES T0-T4 -> L0-L4, so the stored data
-- says the same thing the column name now says.
--
-- HAND-AUTHORED, and this one is not optional. `prisma migrate dev` cannot
-- see a rename: it generates DROP COLUMN "tier" + ADD COLUMN
-- "verificationLevel" NOT NULL DEFAULT 'L0', which silently resets every
-- verified business to unclaimed and takes their vouching and ask-posting
-- rights with it — and it reports success. If this file is ever
-- regenerated, use --create-only and replace the body.
-- Precedent for the value half: 20260817120000_rename_membership_plans.
--
-- ONE file on purpose. Postgres DDL is transactional and Prisma wraps a
-- migration file in a single transaction, so the database is never observed
-- with a renamed column still holding T-values, and a crash mid-way rolls
-- the whole thing back rather than leaving a schema no code understands.
--
-- No index, constraint or @map touches these four columns, so a plain
-- RENAME COLUMN is the whole DDL — there is nothing to rebuild.
--
-- DEPLOY NOTE: render.yaml runs `migrate deploy` in the BUILD step while the
-- previous instance is still serving. For the 30-120s until the container
-- swaps, old code selects a column that no longer exists and every route
-- 500s, login included. Every migration before this one was additive or
-- value-only, so that window had never mattered. Ship this in an announced
-- window.

-- ─── 1. VERIFICATION ────────────────────────────────────────────────────────
-- Rename first, so the UPDATEs below read as statements about the new column
-- rather than about a name on its way out.
ALTER TABLE "Business" RENAME COLUMN "tier" TO "verificationLevel";

-- One statement per value rather than a substring() trick, matching the style
-- of the membership-plan rename: five explicit lines are greppable, obviously
-- 1:1, and make the mapping a diff you can read.
UPDATE "Business" SET "verificationLevel" = 'L0' WHERE "verificationLevel" = 'T0';
UPDATE "Business" SET "verificationLevel" = 'L1' WHERE "verificationLevel" = 'T1';
UPDATE "Business" SET "verificationLevel" = 'L2' WHERE "verificationLevel" = 'T2';
UPDATE "Business" SET "verificationLevel" = 'L3' WHERE "verificationLevel" = 'T3';
UPDATE "Business" SET "verificationLevel" = 'L4' WHERE "verificationLevel" = 'T4';

-- Should match zero rows. Here for the reason the membership rename carried
-- its equivalent: from this commit on, an off-union value is a business that
-- fails every Set.has gate silently — refused vouches, refused ask posting,
-- rendered with no badge icon — with nothing in the logs. One statement makes
-- the column match its documented union on day one rather than probably
-- matching it.
UPDATE "Business" SET "verificationLevel" = 'L0'
WHERE "verificationLevel" NOT IN ('L0', 'L1', 'L2', 'L3', 'L4');

-- Last, so the backfill above is what repairs existing rows and this governs
-- only rows inserted from here on. Same ordering the membership rename used.
ALTER TABLE "Business" ALTER COLUMN "verificationLevel" SET DEFAULT 'L0';

-- ─── 2. MEMBERSHIP ──────────────────────────────────────────────────────────
-- Names only. The values free/plus/pro/enterprise were already correct and
-- were renamed into place in 20260817120000_rename_membership_plans, so there
-- is nothing to backfill here.
ALTER TABLE "Business" RENAME COLUMN "membershipPlan" TO "membershipTier";
ALTER TABLE "Business" RENAME COLUMN "planStartedAt"  TO "membershipTierStartedAt";
ALTER TABLE "Business" RENAME COLUMN "planExpiresAt"  TO "membershipTierExpiresAt";

-- ─── 3. VOUCH LEVEL ─────────────────────────────────────────────────────────
-- Nothing, and that absence is the point: the vouch level is derived from a
-- COUNT of published Vouch rows at read time and has never been a column.
-- It is the axis this rename touches most in the code and least in the
-- database, which is exactly what "earned" should look like.
