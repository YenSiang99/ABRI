import { prisma } from "../prisma.js";

// The Founding programme (ABRI-launch-access-plan.md step 4).
//
// Everyone whose claim is approved while the programme is open becomes a
// Founding member: the permanent badge (Business.isFoundingMember) and Pro
// until the Founding end date. Then they drop to Free like anyone else, and
// the badge is what a founding discount will be keyed on when billing exists.
//
// Two dates, both admin-editable (PUT /admin/settings/founding), both stored
// in AppSetting so they move without a deploy:
//   closesAt   — launch. Approvals after it are not Founding. Unset = open.
//   proEndsAt  — when Founding Pro ends. Unset = not decided yet, so Pro has
//                no expiry until it is.
// It replaced the founding-100 cap, which turned the 101st business to join
// during seeding away with nothing.

const KEYS = { closesAt: "founding.closesAt", proEndsAt: "founding.proEndsAt" };

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function getFoundingSettings() {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: Object.values(KEYS) } } });
  const read = (key) => parseDate(rows.find((r) => r.key === key)?.value);
  return { closesAt: read(KEYS.closesAt), proEndsAt: read(KEYS.proEndsAt) };
}

function foundingIsOpen(settings, now = new Date()) {
  return !settings.closesAt || now < settings.closesAt;
}

// What an approval right now grants: the Business fields to write.
async function foundingGrantForApproval() {
  const settings = await getFoundingSettings();
  if (!foundingIsOpen(settings)) {
    return { membershipTier: "free", membershipTierGrant: null, membershipTierExpiresAt: null };
  }
  return {
    membershipTier: "pro",
    membershipTierGrant: "founding",
    membershipTierExpiresAt: settings.proEndsAt,
    isFoundingMember: true,
  };
}

// Saves both dates (null clears one). A change to the end date moves every
// business still on its Founding Pro — and only those: a member an admin
// moved by hand, or one who paid, keeps their own dates.
async function setFoundingSettings({ closesAt, proEndsAt }) {
  for (const [field, key] of Object.entries(KEYS)) {
    const value = { closesAt, proEndsAt }[field];
    await prisma.appSetting.upsert({
      where: { key },
      update: { value: value ? value.toISOString() : null },
      create: { key, value: value ? value.toISOString() : null },
    });
  }
  const { count } = await prisma.business.updateMany({
    where: { membershipTierGrant: "founding", membershipTier: "pro" },
    data: { membershipTierExpiresAt: proEndsAt },
  });
  return { ...(await getFoundingSettings()), foundingProMembers: count };
}

export { getFoundingSettings, foundingIsOpen, foundingGrantForApproval, setFoundingSettings, parseDate };
