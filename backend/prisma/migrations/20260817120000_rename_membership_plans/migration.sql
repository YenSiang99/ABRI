-- Renames the membershipPlan value union from the placeholder
-- "basic"/"premium"/"enterprise" to the real billing tiers
-- "free"/"plus"/"pro"/"enterprise", and splits the founding-100 programme
-- out of the plan column into a flag of its own.
--
-- Hand-authored rather than generated: the DDL alone would leave every
-- existing row holding a value that no longer means anything, and the
-- backfill below has to run in a specific order (see the comment on the
-- founding-member UPDATE).

ALTER TABLE "Business" ADD COLUMN     "planStartedAt" TIMESTAMP(3);
ALTER TABLE "Business" ADD COLUMN     "planExpiresAt" TIMESTAMP(3);
ALTER TABLE "Business" ADD COLUMN     "isFoundingMember" BOOLEAN NOT NULL DEFAULT false;

-- MUST run before the rename below, while "premium" still exists to match
-- on. "premium" only ever meant "one of the founding 100" — it was assigned
-- at claim-approval time by approveClaimAndRejectRivals — so this promotes
-- that meaning into its own column before the value it was carried by
-- disappears. That separation is the whole point: a founding member who
-- later upgrades, downgrades or lapses must not lose the status.
UPDATE "Business" SET "isFoundingMember" = true WHERE "membershipPlan" = 'premium';

-- basic   -> free: claimed, never paid. Note this also drops their
--                  vouch-giving cap from 10 to 3 (lib/vouchCap.js), which
--                  is intended — 10 predated the tiers existing.
-- premium -> plus: the founding 100's complimentary first year is Plus.
UPDATE "Business" SET "membershipPlan" = 'free' WHERE "membershipPlan" = 'basic';
UPDATE "Business" SET "membershipPlan" = 'plus' WHERE "membershipPlan" = 'premium';

-- Should match zero rows — the only two writers were the literals handled
-- above. It's here because from this commit on, an off-union value means
-- "capped at the strictest tier forever, with only a log line to say so"
-- (lib/vouchCap.js), and one statement guarantees the column matches its
-- documented union on day one rather than probably matching it.
UPDATE "Business" SET "membershipPlan" = 'free'
WHERE "membershipPlan" NOT IN ('free', 'plus', 'pro', 'enterprise');

-- Last, so the backfill above is what repairs existing rows and this only
-- governs rows inserted from here on.
ALTER TABLE "Business" ALTER COLUMN "membershipPlan" SET DEFAULT 'free';
