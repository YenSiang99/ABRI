-- Restructures the vouch feature onto three tables with a single rule: no
-- table holds a text column that is ever UPDATEd.
--
--   Vouch          workflow header, points at the live revision
--   VouchRevision  every version of the giver's text  (insert-only)
--   VouchAction    every transition + the receiver's text (insert-only)
--
-- Replaces VouchNote + VouchEvent with the single VouchAction table, and
-- drops Vouch.testimonial — the denormalized copy that a revise used to
-- overwrite in place, which is what made earlier versions unrecoverable.
--
-- Data-preserving: every existing revision, note and event is carried over
-- rather than dropped and recreated.

-- ---------------------------------------------------------------------------
-- VouchRevision: index -> revisionNumber (0-based -> 1-based), testimonial
-- -> comment, plus the author it was always implicitly attributed to.
-- ---------------------------------------------------------------------------

ALTER TABLE "VouchRevision" RENAME COLUMN "index" TO "revisionNumber";
ALTER TABLE "VouchRevision" RENAME COLUMN "testimonial" TO "comment";

ALTER INDEX "VouchRevision_vouchId_attempt_index_key"
  RENAME TO "VouchRevision_vouchId_attempt_revisionNumber_key";

-- Shift 0-based to 1-based via negative space. A single
-- `SET "revisionNumber" = "revisionNumber" + 1` fails: the unique
-- constraint is checked per row within the statement, so rewriting 0 -> 1
-- collides with the row that is still 1. Negatives can't collide with
-- positives, so two passes get there cleanly.
UPDATE "VouchRevision" SET "revisionNumber" = -"revisionNumber" - 1;
UPDATE "VouchRevision" SET "revisionNumber" = -"revisionNumber";

ALTER TABLE "VouchRevision" ADD COLUMN "createdById" TEXT;
UPDATE "VouchRevision" r SET "createdById" = v."fromBusinessId"
FROM "Vouch" v WHERE v."id" = r."vouchId";
ALTER TABLE "VouchRevision" ALTER COLUMN "createdById" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- Vouch: point at the live revision instead of copying its text.
-- ---------------------------------------------------------------------------

ALTER TABLE "Vouch" ADD COLUMN     "currentRevisionId" TEXT,
ADD COLUMN     "maxRevisions" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "closedAt" TIMESTAMP(3);

-- The highest-numbered revision of the attempt the row is currently on.
UPDATE "Vouch" v SET "currentRevisionId" = (
  SELECT r."id" FROM "VouchRevision" r
  WHERE r."vouchId" = v."id" AND r."attempt" = v."attempt"
  ORDER BY r."revisionNumber" DESC
  LIMIT 1
);

UPDATE "Vouch" SET "closedAt" = "lastActionAt" WHERE "status" IN ('published', 'declined');

ALTER TABLE "Vouch" DROP COLUMN "testimonial";

-- ---------------------------------------------------------------------------
-- VouchAction, absorbing VouchEvent and VouchNote.
-- ---------------------------------------------------------------------------

CREATE TABLE "VouchAction" (
    "id" TEXT NOT NULL,
    "vouchId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "revisionId" TEXT,
    "actorId" TEXT,
    "comment" TEXT,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VouchAction_pkey" PRIMARY KEY ("id")
);

-- One action per event. The receiver's note text folds in from VouchNote
-- via the event's noteId, which is where the two tables were already
-- joined — collapsing them loses nothing.
-- toStatus was nullable on VouchEvent (flag events carried neither status)
-- but is required here, so those fall back to the vouch's own status.
INSERT INTO "VouchAction" ("id", "vouchId", "attempt", "action", "revisionId", "actorId", "comment", "fromStatus", "toStatus", "createdAt")
SELECT
    e."id",
    e."vouchId",
    e."attempt",
    CASE e."type"
        WHEN 'submitted'         THEN 'submit'
        WHEN 'revised'           THEN 'revise'
        WHEN 'changes_requested' THEN 'request_changes'
        WHEN 'accepted'          THEN 'accept'
        WHEN 'declined'          THEN 'decline'
        WHEN 'expired'           THEN 'expire'
        WHEN 'flagged'           THEN 'flag'
        ELSE e."type"
    END,
    e."revisionId",
    e."actorBusinessId",
    n."note",
    e."fromStatus",
    COALESCE(e."toStatus", v."status"),
    e."createdAt"
FROM "VouchEvent" e
JOIN "Vouch" v ON v."id" = e."vouchId"
LEFT JOIN "VouchNote" n ON n."id" = e."noteId";

-- ---------------------------------------------------------------------------
-- VouchFlag: snapshot string -> pointer at the immutable revision.
-- ---------------------------------------------------------------------------

ALTER TABLE "VouchFlag" ADD COLUMN "revisionId" TEXT;

-- Match the old snapshot text back to the revision holding it. Where the
-- text no longer matches any revision the column stays null, which is
-- honest — the string alone can't say which version it came from.
UPDATE "VouchFlag" f SET "revisionId" = (
  SELECT r."id" FROM "VouchRevision" r
  WHERE r."vouchId" = f."vouchId" AND r."comment" = f."testimonialSnapshot"
  ORDER BY r."createdAt" DESC
  LIMIT 1
)
WHERE f."testimonialSnapshot" IS NOT NULL;

ALTER TABLE "VouchFlag" DROP COLUMN "testimonialSnapshot";

-- ---------------------------------------------------------------------------
-- Retire the replaced tables. VouchEvent first — it references VouchNote.
-- ---------------------------------------------------------------------------

DROP TABLE "VouchEvent";
DROP TABLE "VouchNote";

-- ---------------------------------------------------------------------------
-- Indexes and foreign keys
-- ---------------------------------------------------------------------------

-- CreateIndex
CREATE UNIQUE INDEX "Vouch_currentRevisionId_key" ON "Vouch"("currentRevisionId");

-- CreateIndex
CREATE INDEX "VouchAction_vouchId_createdAt_idx" ON "VouchAction"("vouchId", "createdAt");

-- AddForeignKey
ALTER TABLE "Vouch" ADD CONSTRAINT "Vouch_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "VouchRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VouchRevision" ADD CONSTRAINT "VouchRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VouchAction" ADD CONSTRAINT "VouchAction_vouchId_fkey" FOREIGN KEY ("vouchId") REFERENCES "Vouch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VouchAction" ADD CONSTRAINT "VouchAction_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "VouchRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VouchAction" ADD CONSTRAINT "VouchAction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VouchFlag" ADD CONSTRAINT "VouchFlag_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "VouchRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
