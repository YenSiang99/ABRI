-- Remove recommendations.
--
-- Accepting an answer on the asks board used to publish a Recommendation on
-- the named business's profile and announce it to the network feed. That is
-- gone: accepting now settles the asker's own ask and publishes nothing.
--
-- AskAnswer.recommendedBusinessId SURVIVES and is deliberately not touched
-- here. It still does its original job — telling the asker who to call — and
-- dropping it would have deleted the content of every answer ever given.

-- 1. The feed rows. Their type no longer appears in NETWORK_EVENT_TYPES, so
--    nothing renders them and nothing ever will; they are deleted rather than
--    left as rows whose type no reader can resolve. Deleted BEFORE the column
--    drop so the FK is still intact while they go.
DELETE FROM "NetworkEvent" WHERE "type" = 'recommendation_published';

-- 2. The two notification types that announced a recommendation to the
--    business that received one. Neither is in ACTIVITY_MESSAGES any longer,
--    and an activity row whose type has no message renders as a blank line in
--    a member's feed.
DELETE FROM "ActivityEvent"
WHERE "type" IN ('ask_recommendation_received', 'recommendations_waiting');

-- 3. The pointer itself. Nothing writes it now that recommendation_published
--    is gone; leaving a nullable column nobody populates is how a schema
--    accumulates fields nobody can explain.
ALTER TABLE "NetworkEvent" DROP CONSTRAINT "NetworkEvent_askAnswerId_fkey";
DROP INDEX "NetworkEvent_askAnswerId_idx";
ALTER TABLE "NetworkEvent" DROP COLUMN "askAnswerId";
