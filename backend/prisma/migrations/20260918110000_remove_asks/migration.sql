-- Remove the asks board.
--
-- The team's call, Sept 2026: the network itself is the base. Businesses need
-- to claim, register, follow and connect, and the directory needs real data in
-- it, before a demand board has anyone to serve. The board and its moderation
-- queue are preserved whole on feat/requests-and-projects and can come back
-- when there is density to support them.
--
-- Engagement.askId goes with it. It was provenance only — "this work came out
-- of that ask" — and never load-bearing for trust, so no confirmed engagement
-- loses anything a reader could see.

-- 1. The notifications first, while their types still mean something to a
--    reader of this file. Ten ask_* types were in ACTIVITY_MESSAGES; an
--    activity row whose type has no message renders as "Something happened."
--    with a dead link, so they are deleted rather than orphaned.
DELETE FROM "ActivityEvent" WHERE "type" LIKE 'ask\_%';

-- 2. The provenance pointer, before the table it references goes.
ALTER TABLE "Engagement" DROP CONSTRAINT "Engagement_askId_fkey";
ALTER TABLE "Engagement" DROP COLUMN "askId";

-- 3. The tables, innermost first. AskFlag points at both Ask and AskAnswer,
--    and AskAnswer points at Ask, so this order is the FK order rather than a
--    preference.
DROP TABLE "AskFlag";
DROP TABLE "AskAnswer";
DROP TABLE "Ask";
