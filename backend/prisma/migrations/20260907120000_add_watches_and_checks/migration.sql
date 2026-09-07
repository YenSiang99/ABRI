-- The two Pro tools on the check-a-business screen.
--
-- BusinessWatch: "tell me when this business gets claimed or verified" — the
-- feature routes/follows.js named as the better version of following an
-- unclaimed listing. Unannounced and one-way, like a follow: the watched
-- business is never told and there is no count anywhere.
--
-- BusinessCheck: the member's own log of what they checked. The direction is
-- load-bearing — it answers "what have I checked?" and must never be able to
-- answer "who has been checking me?", which is the question that would turn a
-- trust directory into surveillance. Every read is keyed off the session.

CREATE TABLE "BusinessWatch" (
    "id" TEXT NOT NULL,
    "watcherId" TEXT NOT NULL,
    "watchedId" TEXT NOT NULL,
    -- The level when the watch was set, so the notifier can say what CHANGED
    -- rather than only what it is now. Rewritten on each notification.
    "lastSeenLevel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessWatch_pkey" PRIMARY KEY ("id")
);

-- Watching twice is the same state as watching once, so POST is idempotent
-- against this rather than erroring.
CREATE UNIQUE INDEX "BusinessWatch_watcherId_watchedId_key" ON "BusinessWatch"("watcherId", "watchedId");
-- The notifier's read: everyone watching the business that just changed.
CREATE INDEX "BusinessWatch_watchedId_idx" ON "BusinessWatch"("watchedId");

CREATE TABLE "BusinessCheck" (
    "id" TEXT NOT NULL,
    "checkedById" TEXT NOT NULL,
    "checkedId" TEXT NOT NULL,
    -- What the level was AT THE TIME. A log that re-read the level live would
    -- rewrite its own history every time a business changed, which is the
    -- property that would make it worthless as a record of what you were told
    -- when you made a decision.
    "levelAtCheck" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessCheck_pkey" PRIMARY KEY ("id")
);

-- The member's own history, newest first.
CREATE INDEX "BusinessCheck_checkedById_createdAt_idx" ON "BusinessCheck"("checkedById", "createdAt");
-- Dedupe: re-checking the same business updates the existing row rather than
-- filling the log with one member's repeated typing.
CREATE INDEX "BusinessCheck_checkedById_checkedId_idx" ON "BusinessCheck"("checkedById", "checkedId");

-- RESTRICT on every business key, matching the rest of this schema: a
-- business with history behind it is unwound deliberately, not swept.
ALTER TABLE "BusinessWatch" ADD CONSTRAINT "BusinessWatch_watcherId_fkey"
  FOREIGN KEY ("watcherId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BusinessWatch" ADD CONSTRAINT "BusinessWatch_watchedId_fkey"
  FOREIGN KEY ("watchedId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BusinessCheck" ADD CONSTRAINT "BusinessCheck_checkedById_fkey"
  FOREIGN KEY ("checkedById") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BusinessCheck" ADD CONSTRAINT "BusinessCheck_checkedId_fkey"
  FOREIGN KEY ("checkedId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
