import { CLAIMED, UNCLAIMED } from "@/lib/verificationLevels";

// Which of the three states a business profile is in. Every profile has the
// same sections (components/business/ProfileSections.jsx); the stage decides
// what an empty one says it is waiting for.
export function profileStage(business) {
  if (business.verificationLevel === UNCLAIMED) return "unclaimed";
  if (business.verificationLevel === CLAIMED) return "claimed";
  return "verified";
}

export function formatDate(iso) {
  return iso ? new Date(iso).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" }) : "—";
}
