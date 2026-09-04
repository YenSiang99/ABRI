// The vouch LEVEL — how many verified peers have staked their own name on a
// business. One of the two EARNED axes, and the only one with no column at
// all: it is counted from published Vouch rows every time it is read, so it
// can never drift from the rows it summarises (see schema.prisma).
//
// A LEVEL, not a tier, under the product's one naming rule: a tier is bought
// and a level is earned or claimed. Nobody can buy this one and nobody can
// give it to themselves — vouching for someone raises THEIR level, not the
// giver's.
//
// Renamed from ladderFor()/vouchLadder.js in Aug 2026. "Ladder" was retired
// because it was the vouch axis's private word while "tier" was doing double
// duty for verification and billing; three axes now have three unambiguous
// names.
//
// Takes both counts because the top rung is the one that rewards GIVING.
// "leader" was unreachable for months: the label map carried five rungs and
// this function could only ever return four, so the landing page advertised
// a status nobody could earn. Adding a caller means passing `given` — a
// caller that forgets it silently caps every business at "trusted".
function vouchLevelFor({ received = 0, given = 0 } = {}) {
  // Thresholds from ABRI-master-blueprint.md's vouch ladder. 25 received AND
  // 10 given: the only rung that cannot be reached by being popular alone.
  if (received >= 25 && given >= 10) return "leader";
  if (received >= 10) return "trusted";
  if (received >= 5) return "top20";
  if (received >= 1) return "first";
  return "none";
}

export { vouchLevelFor };
