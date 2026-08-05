// Mirrors ladderFor() in frontend/src/lib/store/businesses.js — kept as the
// single source of truth now that vouch counts are computed server-side.
function ladderFor(vouchCount) {
  if (vouchCount >= 10) return "trusted";
  if (vouchCount >= 5) return "top20";
  if (vouchCount >= 1) return "first";
  return "none";
}

export { ladderFor };
