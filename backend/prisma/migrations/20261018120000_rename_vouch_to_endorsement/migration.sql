-- Renames the vouch feature to "endorsement", so the database says the same
-- word the product and the code now say.
--
--   Vouch          -> Endorsement
--   VouchRevision  -> EndorsementRevision
--   VouchAction    -> EndorsementAction
--   VouchFlag      -> EndorsementFlag
--   *.vouchId      -> endorsementId   (the three child tables + NetworkEvent)
--
-- and migrates the stored event-type VALUES vouch_* -> endorsement_* in
-- ActivityEvent.type and NetworkEvent.type.
--
-- HAND-AUTHORED, and not optional. `prisma migrate dev` cannot see a rename:
-- it generates DROP TABLE "Vouch" + CREATE TABLE "Endorsement", which deletes
-- every vouch, revision, action and flag — and reports success. If this file
-- is ever regenerated, use --create-only and replace the body. Precedent:
-- 20260831120000_rename_axes_tier_level.
--
-- Every constraint and index is renamed to the name Prisma would generate for
-- the new model, so the next `migrate dev` sees no drift. Postgres keeps a
-- primary key's or unique constraint's index name in step with the constraint
-- when the CONSTRAINT is renamed, so those are renamed once, as constraints;
-- plain indexes are renamed with ALTER INDEX.
--
-- ONE file on purpose: Prisma runs it in a single transaction, so a crash
-- mid-way rolls back rather than leaving half-renamed tables.
--
-- DEPLOY NOTE: as with the tier/level rename, `migrate deploy` runs in the
-- build step while the previous instance still serves. Until the container
-- swaps, old code queries "Vouch", which no longer exists, and every
-- endorsement route 500s. The API paths also move (/vouches -> /endorsements),
-- so frontend and backend must ship together. Ship in an announced window.

-- ─── 1. TABLES ──────────────────────────────────────────────────────────────
ALTER TABLE "Vouch"         RENAME TO "Endorsement";
ALTER TABLE "VouchRevision" RENAME TO "EndorsementRevision";
ALTER TABLE "VouchAction"   RENAME TO "EndorsementAction";
ALTER TABLE "VouchFlag"     RENAME TO "EndorsementFlag";

-- ─── 2. COLUMNS ─────────────────────────────────────────────────────────────
ALTER TABLE "EndorsementRevision" RENAME COLUMN "vouchId" TO "endorsementId";
ALTER TABLE "EndorsementAction"   RENAME COLUMN "vouchId" TO "endorsementId";
ALTER TABLE "EndorsementFlag"     RENAME COLUMN "vouchId" TO "endorsementId";
ALTER TABLE "NetworkEvent"        RENAME COLUMN "vouchId" TO "endorsementId";

-- ─── 3. CONSTRAINTS (pkeys and foreign keys) ────────────────────────────────
ALTER TABLE "Endorsement" RENAME CONSTRAINT "Vouch_pkey"                  TO "Endorsement_pkey";
ALTER TABLE "Endorsement" RENAME CONSTRAINT "Vouch_currentRevisionId_fkey" TO "Endorsement_currentRevisionId_fkey";
ALTER TABLE "Endorsement" RENAME CONSTRAINT "Vouch_fromBusinessId_fkey"    TO "Endorsement_fromBusinessId_fkey";
ALTER TABLE "Endorsement" RENAME CONSTRAINT "Vouch_toBusinessId_fkey"      TO "Endorsement_toBusinessId_fkey";

ALTER TABLE "EndorsementRevision" RENAME CONSTRAINT "VouchRevision_pkey"             TO "EndorsementRevision_pkey";
ALTER TABLE "EndorsementRevision" RENAME CONSTRAINT "VouchRevision_vouchId_fkey"     TO "EndorsementRevision_endorsementId_fkey";
ALTER TABLE "EndorsementRevision" RENAME CONSTRAINT "VouchRevision_createdById_fkey" TO "EndorsementRevision_createdById_fkey";

ALTER TABLE "EndorsementAction" RENAME CONSTRAINT "VouchAction_pkey"                TO "EndorsementAction_pkey";
ALTER TABLE "EndorsementAction" RENAME CONSTRAINT "VouchAction_vouchId_fkey"        TO "EndorsementAction_endorsementId_fkey";
ALTER TABLE "EndorsementAction" RENAME CONSTRAINT "VouchAction_actorId_fkey"        TO "EndorsementAction_actorId_fkey";
ALTER TABLE "EndorsementAction" RENAME CONSTRAINT "VouchAction_actorAccountId_fkey" TO "EndorsementAction_actorAccountId_fkey";
ALTER TABLE "EndorsementAction" RENAME CONSTRAINT "VouchAction_revisionId_fkey"     TO "EndorsementAction_revisionId_fkey";

ALTER TABLE "EndorsementFlag" RENAME CONSTRAINT "VouchFlag_pkey"                     TO "EndorsementFlag_pkey";
ALTER TABLE "EndorsementFlag" RENAME CONSTRAINT "VouchFlag_vouchId_fkey"             TO "EndorsementFlag_endorsementId_fkey";
ALTER TABLE "EndorsementFlag" RENAME CONSTRAINT "VouchFlag_revisionId_fkey"          TO "EndorsementFlag_revisionId_fkey";
ALTER TABLE "EndorsementFlag" RENAME CONSTRAINT "VouchFlag_raisedByBusinessId_fkey"  TO "EndorsementFlag_raisedByBusinessId_fkey";
ALTER TABLE "EndorsementFlag" RENAME CONSTRAINT "VouchFlag_againstBusinessId_fkey"   TO "EndorsementFlag_againstBusinessId_fkey";
ALTER TABLE "EndorsementFlag" RENAME CONSTRAINT "VouchFlag_resolvedByAccountId_fkey" TO "EndorsementFlag_resolvedByAccountId_fkey";

ALTER TABLE "NetworkEvent" RENAME CONSTRAINT "NetworkEvent_vouchId_fkey" TO "NetworkEvent_endorsementId_fkey";

-- ─── 4. INDEXES (unique indexes Prisma created as CREATE UNIQUE INDEX) ──────
ALTER INDEX "Vouch_currentRevisionId_key"                      RENAME TO "Endorsement_currentRevisionId_key";
ALTER INDEX "Vouch_fromBusinessId_toBusinessId_key"            RENAME TO "Endorsement_fromBusinessId_toBusinessId_key";
ALTER INDEX "Vouch_fromBusinessId_status_idx"                  RENAME TO "Endorsement_fromBusinessId_status_idx";
ALTER INDEX "Vouch_toBusinessId_status_idx"                    RENAME TO "Endorsement_toBusinessId_status_idx";
ALTER INDEX "VouchRevision_vouchId_attempt_revisionNumber_key" RENAME TO "EndorsementRevision_endorsementId_attempt_revisionNumber_key";
ALTER INDEX "VouchRevision_vouchId_idx"                        RENAME TO "EndorsementRevision_endorsementId_idx";
ALTER INDEX "VouchAction_vouchId_createdAt_idx"                RENAME TO "EndorsementAction_endorsementId_createdAt_idx";
ALTER INDEX "VouchFlag_vouchId_idx"                            RENAME TO "EndorsementFlag_endorsementId_idx";
ALTER INDEX "NetworkEvent_vouchId_idx"                         RENAME TO "NetworkEvent_endorsementId_idx";

-- ─── 5. STORED VALUES ───────────────────────────────────────────────────────
-- One statement per value, matching the earlier value renames: obviously 1:1
-- and greppable.
UPDATE "ActivityEvent" SET "type" = 'endorsement_submitted'                     WHERE "type" = 'vouch_submitted';
UPDATE "ActivityEvent" SET "type" = 'endorsement_published'                     WHERE "type" = 'vouch_published';
UPDATE "ActivityEvent" SET "type" = 'endorsement_cancelled'                     WHERE "type" = 'vouch_cancelled';
UPDATE "ActivityEvent" SET "type" = 'endorsement_reverted'                      WHERE "type" = 'vouch_reverted';
UPDATE "ActivityEvent" SET "type" = 'endorsement_flagged'                       WHERE "type" = 'vouch_flagged';
UPDATE "ActivityEvent" SET "type" = 'endorsement_revised'                       WHERE "type" = 'vouch_revised';
UPDATE "ActivityEvent" SET "type" = 'endorsement_expired'                       WHERE "type" = 'vouch_expired';
UPDATE "ActivityEvent" SET "type" = 'endorsement_review_cancelled'              WHERE "type" = 'vouch_review_cancelled';
UPDATE "ActivityEvent" SET "type" = 'endorsement_review_sent_back_giver'        WHERE "type" = 'vouch_review_sent_back_giver';
UPDATE "ActivityEvent" SET "type" = 'endorsement_review_sent_back_receiver'     WHERE "type" = 'vouch_review_sent_back_receiver';
UPDATE "ActivityEvent" SET "type" = 'endorsement_review_returned_giver'         WHERE "type" = 'vouch_review_returned_giver';
UPDATE "ActivityEvent" SET "type" = 'endorsement_review_returned_receiver'      WHERE "type" = 'vouch_review_returned_receiver';

UPDATE "NetworkEvent" SET "type" = 'endorsement_published' WHERE "type" = 'vouch_published';

-- Should match zero rows. Any vouch_* type the list above missed would render
-- in the feed with no message and no link, silently; prefix-rewriting the
-- stragglers keeps them meaningful instead.
UPDATE "ActivityEvent" SET "type" = 'endorsement_' || substring("type" from 7) WHERE "type" LIKE 'vouch\_%';
UPDATE "NetworkEvent"  SET "type" = 'endorsement_' || substring("type" from 7) WHERE "type" LIKE 'vouch\_%';
