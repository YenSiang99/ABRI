// The vouch ladder — the five rungs, what each is reached at, and where the
// member sits on it. Mirrors vouchLevelFor() in backend/src/lib/vouchLevel.js.
//
// These thresholds are the ONLY copy on the client, and they can silently
// drift from the server — a wrong number here tells a member they are three
// vouches away from something they already have. Change both together.
//
// Lived inside pages/app/Levels.jsx while that page was the only thing
// showing them. Extracted when the vouch explainer and the standing strip on
// pages/app/Vouches.jsx both needed the same list, for the same reason
// lib/verificationLevelData.js exists: two explainers giving different
// answers is worse than one.
//
// `given` is set on exactly one rung. That asymmetry is the point of the
// whole ladder: Network Leader is the only level you cannot reach by being
// popular.
const VOUCH_LEVELS = [
  { key: "none", received: 0, given: 0 },
  { key: "first", received: 1, given: 0 },
  { key: "top20", received: 5, given: 0 },
  { key: "trusted", received: 10, given: 0 },
  { key: "leader", received: 25, given: 10 },
];

// How a rung is described in the "Reached at" column.
function reachedAt(level) {
  if (level.received === 0) return "Where everyone starts";
  const base = `${level.received} received`;
  return level.given > 0 ? `${base} AND ${level.given} given` : base;
}

// The next rung the member hasn't met yet, or null once they're at the top.
// Takes the counts rather than a vouchLevel string on purpose: the rung you
// are ON is the server's answer, but the rung you are working TOWARDS is a
// question about numbers, and deriving it from the same numbers the server
// counted is what keeps the hint honest.
//
// Both counts must be PUBLISHED-only, matching what vouchLevelFor() sees.
function nextVouchLevel({ received, given }) {
  return VOUCH_LEVELS.find((l) => received < l.received || given < l.given) ?? null;
}

// What still has to happen to reach `level`, phrased as the gap rather than
// the threshold — "4 more received" is actionable where "5 received" makes
// the member do the subtraction. Returns null when the rung is already met.
function remainingFor(level, { received, given }) {
  const parts = [];
  if (received < level.received) parts.push(`${level.received - received} more received`);
  if (given < level.given) parts.push(`${level.given - given} more given`);
  return parts.length ? parts.join(" and ") : null;
}

export { VOUCH_LEVELS, reachedAt, nextVouchLevel, remainingFor };
