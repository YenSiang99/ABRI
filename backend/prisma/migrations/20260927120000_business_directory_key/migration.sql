-- The directory's daily browse order. See lib/directoryOrder.js.
ALTER TABLE "Business" ADD COLUMN "directoryKey" INTEGER;
CREATE INDEX "Business_directoryKey_id_idx" ON "Business"("directoryKey", "id");
