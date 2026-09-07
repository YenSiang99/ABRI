-- The Asks board: a demand-only board where a business states a requirement
-- and other businesses answer it by naming somebody who can meet it.
--
-- Generated, then annotated. Three things the generator cannot tell you, and
-- which the next person reading this will otherwise assume are oversights:
--
--   1. Ask.expiresAt is NOT NULL with NO DEFAULT, on purpose. The 30 days
--      belong to ASK_EXPIRY_DAYS in src/lib/askExpiry.js, and a DB-side
--      `now() + interval '30 days'` would be a second, silent copy of that
--      number that nobody would think to change alongside it.
--
--   2. There is deliberately no CHECK constraint forcing exactly one of
--      askId / answerId on AskFlag. Both shapes of report carry askId — an
--      answer report sets BOTH, so the admin queue can show the ask a
--      reported answer sits under in one join. answerId IS NULL is what
--      distinguishes "this ask is a problem" from "this answer is".
--
--   3. AskAnswer.recommendedBusinessId has no tier constraint and cannot
--      have one: it may point at a T0 (unclaimed) listing, which is the one
--      place this feature departs from "unclaimed businesses are refused
--      every relational action". See the model comment in schema.prisma.
--
-- No backfill and no data migration: nothing that exists is an ask.
--
-- AskFlag lands here rather than in a later migration even though the
-- reporting ROUTES ship after the board does. An unused table costs nothing;
-- two migrations against one feature cost a rebase.

-- CreateTable
CREATE TABLE "Ask" (
    "id" TEXT NOT NULL,
    "askedByBusinessId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "matchCategory" TEXT NOT NULL,
    "matchLocation" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "maxAnswers" INTEGER NOT NULL DEFAULT 6,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Ask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AskAnswer" (
    "id" TEXT NOT NULL,
    "askId" TEXT NOT NULL,
    "answeredByBusinessId" TEXT NOT NULL,
    "recommendedBusinessId" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'offered',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "AskAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AskFlag" (
    "id" TEXT NOT NULL,
    "askId" TEXT NOT NULL,
    "answerId" TEXT,
    "raisedByBusinessId" TEXT NOT NULL,
    "againstBusinessId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "outcome" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AskFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Ask_askedByBusinessId_idx" ON "Ask"("askedByBusinessId");

-- CreateIndex
CREATE INDEX "Ask_status_matchCategory_idx" ON "Ask"("status", "matchCategory");

-- CreateIndex
CREATE INDEX "AskAnswer_recommendedBusinessId_status_idx" ON "AskAnswer"("recommendedBusinessId", "status");

-- CreateIndex
CREATE INDEX "AskAnswer_answeredByBusinessId_idx" ON "AskAnswer"("answeredByBusinessId");

-- CreateIndex
CREATE UNIQUE INDEX "AskAnswer_askId_answeredByBusinessId_key" ON "AskAnswer"("askId", "answeredByBusinessId");

-- CreateIndex
CREATE INDEX "AskFlag_askId_idx" ON "AskFlag"("askId");

-- AddForeignKey
ALTER TABLE "Ask" ADD CONSTRAINT "Ask_askedByBusinessId_fkey" FOREIGN KEY ("askedByBusinessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AskAnswer" ADD CONSTRAINT "AskAnswer_askId_fkey" FOREIGN KEY ("askId") REFERENCES "Ask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AskAnswer" ADD CONSTRAINT "AskAnswer_answeredByBusinessId_fkey" FOREIGN KEY ("answeredByBusinessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AskAnswer" ADD CONSTRAINT "AskAnswer_recommendedBusinessId_fkey" FOREIGN KEY ("recommendedBusinessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AskFlag" ADD CONSTRAINT "AskFlag_askId_fkey" FOREIGN KEY ("askId") REFERENCES "Ask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AskFlag" ADD CONSTRAINT "AskFlag_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "AskAnswer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AskFlag" ADD CONSTRAINT "AskFlag_raisedByBusinessId_fkey" FOREIGN KEY ("raisedByBusinessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AskFlag" ADD CONSTRAINT "AskFlag_againstBusinessId_fkey" FOREIGN KEY ("againstBusinessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AskFlag" ADD CONSTRAINT "AskFlag_resolvedByAccountId_fkey" FOREIGN KEY ("resolvedByAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
