const TIER_FILTERS = [
  { value: "all", label: "All" },
  { value: "T0", label: "Unclaimed" },
  { value: "T1", label: "Claimed" },
  { value: "T2", label: "SSM-Verified" },
];

function filterBusinesses(businesses, { query = "", tierFilter = "all", excludeId } = {}) {
  const q = query.trim().toLowerCase();
  return businesses.filter((b) => {
    if (excludeId && b.id === excludeId) return false;
    const matchesQuery =
      !q || b.name.toLowerCase().includes(q) || b.category.toLowerCase().includes(q);
    const matchesTier = tierFilter === "all" || b.tier === tierFilter;
    return matchesQuery && matchesTier;
  });
}

export { TIER_FILTERS, filterBusinesses };
