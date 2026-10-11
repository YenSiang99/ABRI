-- Founding = Pro until a date an admin sets (ABRI-launch-access-plan.md
-- step 4), and a paid tier that waits for SSM verification (step 6).
ALTER TABLE "Business" ADD COLUMN "membershipTierGrant" TEXT;
ALTER TABLE "Business" ADD COLUMN "pendingMembershipTier" TEXT;

CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- Founding members were given Plus with no end. Founding now means Pro until
-- the Founding end date, which is not set yet, so they move to Pro with no
-- expiry, marked as granted by the programme so that setting the date later
-- reaches them.
UPDATE "Business"
SET "membershipTier" = 'pro', "membershipTierGrant" = 'founding'
WHERE "isFoundingMember" = true AND "membershipTier" = 'plus' AND "membershipTierExpiresAt" IS NULL;
