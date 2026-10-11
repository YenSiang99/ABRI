-- What public registers and datasets say about each business, kept apart
-- from the owner-controlled Business row. See the note on SourceRecord in
-- schema.prisma.
CREATE TABLE "SourceRecord" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "ssm" TEXT,
    "ssmNormalized" TEXT,
    "name" TEXT,
    "category" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "website" TEXT,
    "detail" JSONB,
    "sourceYear" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SourceRecord_source_sourceId_key" ON "SourceRecord"("source", "sourceId");
CREATE INDEX "SourceRecord_businessId_idx" ON "SourceRecord"("businessId");
CREATE INDEX "SourceRecord_ssmNormalized_idx" ON "SourceRecord"("ssmNormalized");

ALTER TABLE "SourceRecord" ADD CONSTRAINT "SourceRecord_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
