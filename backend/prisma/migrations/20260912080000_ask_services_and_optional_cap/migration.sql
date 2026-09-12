-- AlterTable
ALTER TABLE "Ask" ADD COLUMN     "matchServices" TEXT[] DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "maxAnswers" DROP NOT NULL,
ALTER COLUMN "maxAnswers" DROP DEFAULT;


-- Every existing ask carried maxAnswers = 6 because that was the column
-- default, not because any asker chose it. Leaving those rows at 6 would mean
-- "the cap is removed" was true only for asks posted after this migration,
-- which is the sort of half-change nobody can reason about later. Cleared to
-- NULL so the rule is the same for every ask in the table.
UPDATE "Ask" SET "maxAnswers" = NULL;
