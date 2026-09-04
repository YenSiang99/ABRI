import { UNCLAIMED, CLAIMED, SSM_VERIFIED } from "@/lib/verificationLevels";
// Labels from the single source — this file used to carry its own copy, and
// the three copies disagreed about L0.
import { verificationLevelLabel } from "@/lib/trustLabels";

const VERIFICATION_LEVEL_FILTERS = [
  { value: "all", label: "All" },
  { value: UNCLAIMED, label: verificationLevelLabel[UNCLAIMED] },
  { value: CLAIMED, label: verificationLevelLabel[CLAIMED] },
  { value: SSM_VERIFIED, label: verificationLevelLabel[SSM_VERIFIED] },
];

function filterBusinesses(businesses, { query = "", verificationLevelFilter = "all", excludeId } = {}) {
  const q = query.trim().toLowerCase();
  return businesses.filter((b) => {
    if (excludeId && b.id === excludeId) return false;
    const matchesQuery =
      !q || b.name.toLowerCase().includes(q) || b.category.toLowerCase().includes(q);
    const matchesVerificationLevel = verificationLevelFilter === "all" || b.verificationLevel === verificationLevelFilter;
    return matchesQuery && matchesVerificationLevel;
  });
}

export { VERIFICATION_LEVEL_FILTERS, filterBusinesses };
