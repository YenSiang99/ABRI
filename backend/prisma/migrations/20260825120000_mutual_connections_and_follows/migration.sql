-- Splits "I know this business" into two relationships that were previously
-- one: Connection becomes mutual and needs accepting, and Follow arrives as
-- the one-way, invisible watchlist that Connection had been standing in for.
--
-- Hand-authored rather than generated, for three reasons:
--   1. The PendingConnection -> DeferredConnection rename must be ALTER TABLE
--      RENAME, not DROP + CREATE. A generated migration would happily drop a
--      table holding live queued card taps.
--   2. Connection.requestedById is NOT NULL on a table with existing rows, so
--      it has to be added nullable, backfilled, then constrained.
--   3. Every existing row must land on "accepted" (see below), which is a
--      data decision no generator can make.

-- ─── Connection: status ────────────────────────────────────────────────────
-- Default "accepted", NOT "pending". Every row that exists today was created
-- under the old rule where pressing Connect made the edge immediately, and
-- both businesses have been seeing each other in their networks ever since.
-- Retroactively demoting those to "pending" would empty every member's
-- network overnight and fill their inbox with requests neither side made.
--
-- The default stays "accepted" after this migration on purpose: the NFC-tap
-- path writes accepted rows and says nothing, so the column default matches
-- the case that must never accidentally become a request.
ALTER TABLE "Connection" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'accepted';
ALTER TABLE "Connection" ADD COLUMN "respondedAt" TIMESTAMP(3);

-- ─── Connection: requestedById ─────────────────────────────────────────────
-- Nullable first so the backfill has somewhere to write.
ALTER TABLE "Connection" ADD COLUMN "requestedById" TEXT;

-- businessAId is arbitrary, and that is the honest answer: the A/B columns
-- are ordered lexicographically by id so one row can serve both directions,
-- so nobody ever recorded which end asked. Every row being backfilled is
-- "accepted", where this column is never read — it decides who may accept a
-- pending request and who may withdraw it, and neither applies here.
UPDATE "Connection" SET "requestedById" = "businessAId" WHERE "requestedById" IS NULL;

ALTER TABLE "Connection" ALTER COLUMN "requestedById" SET NOT NULL;
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- FK hygiene only, matching what 20260813 did for businessBId: Postgres does
-- not index a foreign key for you, and without this the RESTRICT check on a
-- Business delete is a sequential scan of the whole table.
--
-- Deliberately NO index on "status". Nothing queries it: GET /connections
-- fetches every edge touching the caller in one go and the client sorts them
-- (see routes/connections.js), so status is only ever read off a row that has
-- already been loaded. A two-value column with no WHERE clause behind it is an
-- index Postgres would decline to use and every write would still pay for.
CREATE INDEX "Connection_requestedById_idx" ON "Connection"("requestedById");

-- ─── Follow ────────────────────────────────────────────────────────────────
-- No backfill. Nothing that exists is a follow: the old Connection rows are
-- mutual edges both sides have already seen, and converting them into
-- one-way invisible ones would silently downgrade real relationships.
CREATE TABLE "Follow" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "followerId" TEXT NOT NULL,
    "followedId" TEXT NOT NULL,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Follow_followerId_followedId_key" ON "Follow"("followerId", "followedId");
CREATE INDEX "Follow_followedId_idx" ON "Follow"("followedId");

ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerId_fkey"
  FOREIGN KEY ("followerId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followedId_fkey"
  FOREIGN KEY ("followedId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── PendingConnection -> DeferredConnection ───────────────────────────────
-- A rename, never a recreate: this table holds card taps queued by people
-- who tapped while logged out and whose claim may still be in review. Those
-- are real intents waiting on a real account; dropping the table would lose
-- them silently, and the member would just never get the connection they
-- asked for.
--
-- Postgres carries the primary key, indexes and foreign keys through
-- ALTER TABLE RENAME, but keeps their old NAMES. Renaming the constraints too
-- keeps the database matching what Prisma generates for a table of this name,
-- so the next `prisma migrate dev` doesn't produce a spurious diff.
ALTER TABLE "PendingConnection" RENAME TO "DeferredConnection";
ALTER TABLE "DeferredConnection" RENAME CONSTRAINT "PendingConnection_pkey" TO "DeferredConnection_pkey";
ALTER TABLE "DeferredConnection" RENAME CONSTRAINT "PendingConnection_accountId_fkey" TO "DeferredConnection_accountId_fkey";
ALTER TABLE "DeferredConnection" RENAME CONSTRAINT "PendingConnection_businessId_fkey" TO "DeferredConnection_businessId_fkey";
ALTER INDEX "PendingConnection_accountId_businessId_key" RENAME TO "DeferredConnection_accountId_businessId_key";
