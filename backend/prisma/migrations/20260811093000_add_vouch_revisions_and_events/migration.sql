-- Adds immutable testimonial versioning (VouchRevision), a per-vouch audit
-- log (VouchEvent), and attempt scoping so a resubmit after a decline starts
-- a clean slate instead of inheriting the previous attempt's change requests.
--
-- HONEST CAVEAT ON THE BACKFILL: before this migration only the *current*
-- testimonial was stored — every earlier version was overwritten in place by
-- POST /vouches/:id/revise. Those versions are unrecoverable. The backfill
-- below therefore collapses each existing vouch onto a single revision and
-- points every one of its historical notes at it, so pre-existing rows show
-- "this note was about the text as it stands now" rather than the truth.
-- Correct from here forward; approximate for what already happened.

-- AlterTable
ALTER TABLE "Vouch" ADD COLUMN     "attempt" INTEGER NOT NULL DEFAULT 1;

-- AlterTable: revisionId lands nullable so the backfill can populate it,
-- then gets SET NOT NULL at the bottom of this file.
ALTER TABLE "VouchNote" ADD COLUMN     "revisionId" TEXT,
ADD COLUMN     "attempt" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "VouchRevision" (
    "id" TEXT NOT NULL,
    "vouchId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "index" INTEGER NOT NULL,
    "testimonial" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VouchRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VouchEvent" (
    "id" TEXT NOT NULL,
    "vouchId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "actorBusinessId" TEXT,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "revisionId" TEXT,
    "noteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VouchEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VouchRevision_vouchId_idx" ON "VouchRevision"("vouchId");

-- CreateIndex
CREATE UNIQUE INDEX "VouchRevision_vouchId_attempt_index_key" ON "VouchRevision"("vouchId", "attempt", "index");

-- CreateIndex
CREATE INDEX "VouchEvent_vouchId_createdAt_idx" ON "VouchEvent"("vouchId", "createdAt");

-- CreateIndex
CREATE INDEX "VouchNote_vouchId_idx" ON "VouchNote"("vouchId");

-- CreateIndex
CREATE INDEX "VouchFlag_vouchId_idx" ON "VouchFlag"("vouchId");

-- CreateIndex
CREATE INDEX "Vouch_toBusinessId_status_idx" ON "Vouch"("toBusinessId", "status");

-- CreateIndex
CREATE INDEX "Vouch_fromBusinessId_status_idx" ON "Vouch"("fromBusinessId", "status");

-- CreateIndex
CREATE INDEX "ActivityEvent_businessId_createdAt_idx" ON "ActivityEvent"("businessId", "createdAt");

-- AddForeignKey
ALTER TABLE "VouchRevision" ADD CONSTRAINT "VouchRevision_vouchId_fkey" FOREIGN KEY ("vouchId") REFERENCES "Vouch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VouchEvent" ADD CONSTRAINT "VouchEvent_vouchId_fkey" FOREIGN KEY ("vouchId") REFERENCES "Vouch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VouchEvent" ADD CONSTRAINT "VouchEvent_actorBusinessId_fkey" FOREIGN KEY ("actorBusinessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VouchEvent" ADD CONSTRAINT "VouchEvent_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "VouchRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VouchEvent" ADD CONSTRAINT "VouchEvent_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "VouchNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------

-- One revision per existing vouch, standing in for the whole history.
-- COALESCE because Vouch.testimonial is nullable but VouchRevision's isn't —
-- a vouch submitted with no text becomes an empty revision rather than being
-- skipped, so its notes still have something to point at.
INSERT INTO "VouchRevision" ("id", "vouchId", "attempt", "index", "testimonial", "createdAt")
SELECT gen_random_uuid()::text, v."id", 1, 0, COALESCE(v."testimonial", ''), v."createdAt"
FROM "Vouch" v;

UPDATE "VouchNote" n
SET "revisionId" = r."id", "attempt" = 1
FROM "VouchRevision" r
WHERE r."vouchId" = n."vouchId" AND r."attempt" = 1 AND r."index" = 0;

-- Reconstruct the events we can be sure of. Timestamps come from the
-- existing rows, so the ordering is real even though the set is incomplete
-- (a revise that already happened leaves no trace to rebuild from).
INSERT INTO "VouchEvent" ("id", "vouchId", "attempt", "type", "actorBusinessId", "fromStatus", "toStatus", "revisionId", "noteId", "createdAt")
SELECT gen_random_uuid()::text, v."id", 1, 'submitted', v."fromBusinessId", NULL, 'pending', r."id", NULL, v."createdAt"
FROM "Vouch" v
JOIN "VouchRevision" r ON r."vouchId" = v."id" AND r."attempt" = 1 AND r."index" = 0;

INSERT INTO "VouchEvent" ("id", "vouchId", "attempt", "type", "actorBusinessId", "fromStatus", "toStatus", "revisionId", "noteId", "createdAt")
SELECT gen_random_uuid()::text, n."vouchId", 1, 'changes_requested', n."authorBusinessId", 'pending', 'changes_requested', n."revisionId", n."id", n."createdAt"
FROM "VouchNote" n;

-- A published vouch can only have got there via the receiver accepting, so
-- the actor is known. A declined one is ambiguous — receiver decline and the
-- 14-day lazy expiry both land here and are indistinguishable after the
-- fact — so its actor stays NULL rather than guessing.
INSERT INTO "VouchEvent" ("id", "vouchId", "attempt", "type", "actorBusinessId", "fromStatus", "toStatus", "revisionId", "noteId", "createdAt")
SELECT
    gen_random_uuid()::text,
    v."id",
    1,
    CASE v."status" WHEN 'published' THEN 'accepted' ELSE 'declined' END,
    CASE v."status" WHEN 'published' THEN v."toBusinessId" ELSE NULL END,
    NULL,
    v."status",
    NULL,
    NULL,
    v."lastActionAt"
FROM "Vouch" v
WHERE v."status" IN ('published', 'declined');


-- ---------------------------------------------------------------------------
-- Lock in the invariant now that every row is populated
-- ---------------------------------------------------------------------------

ALTER TABLE "VouchNote" ALTER COLUMN "revisionId" SET NOT NULL;

-- The DEFAULT existed only to make the ADD COLUMN above valid against
-- existing rows; the schema declares a bare `attempt Int`, so drop it to
-- keep the DB and schema.prisma in agreement.
ALTER TABLE "VouchNote" ALTER COLUMN "attempt" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "VouchNote" ADD CONSTRAINT "VouchNote_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "VouchRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
