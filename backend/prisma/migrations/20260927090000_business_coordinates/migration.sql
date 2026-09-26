-- Coordinates for the profile map, from the seed source's own point.
-- See the note on Business.lat in schema.prisma.
ALTER TABLE "Business" ADD COLUMN "lat" DOUBLE PRECISION;
ALTER TABLE "Business" ADD COLUMN "lng" DOUBLE PRECISION;
