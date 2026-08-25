-- Six nullable contact columns on Business. No backfill: every existing row
-- predates the feature and genuinely has no contact details, so NULL is the
-- true value here, not a gap to paper over.
--
-- The DDL is uniform; the meaning is not. phone/whatsapp/email are withheld
-- from third parties unless the OWNER is on plus or above AND the viewer is
-- logged in (lib/contactVisibility.js); website/address/openingHours never
-- are. Nothing at the database level distinguishes the two groups — that
-- lives entirely in omitContactFields (lib/accountView.js), which is the one
-- thing to read before adding a seventh column here.
--
-- "email" is a published contact address, unrelated to the existing "domain"
-- column two lines above it in the schema. domain feeds matchesBusinessDomain
-- and auto-approves claims; this one is unverified free text the owner types
-- and must never be read by anything that authenticates.
--
-- openingHours is TEXT, not JSONB, on purpose. Nothing queries or computes on
-- opening hours (no "open now", no search filter, no booking), the real
-- answers include "By appointment only", and free text -> JSONB is a
-- migration you can write later while JSONB -> free text is one you would
-- only write because the structured editor was never worth using.
--
-- No index on any of these: nothing filters, sorts or joins on them.

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "phone" TEXT;
ALTER TABLE "Business" ADD COLUMN     "whatsapp" TEXT;
ALTER TABLE "Business" ADD COLUMN     "email" TEXT;
ALTER TABLE "Business" ADD COLUMN     "website" TEXT;
ALTER TABLE "Business" ADD COLUMN     "address" TEXT;
ALTER TABLE "Business" ADD COLUMN     "openingHours" TEXT;
