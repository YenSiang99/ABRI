// The Business.verificationLevel union, and the ONLY place these five strings
// are written down.
//
// schema.prisma has no Prisma enums anywhere, so this module is what actually
// constrains the column — the same role CONNECTION_SOURCES plays for
// Connection.source.
//
// ORDERED, and the order is the meaning: index 0 is "nobody has claimed this
// listing", index 4 is the top. Nothing in this codebase compares these with
// < or > — every call site asks === or Set.has — so the ordering is only ever
// read from this array. That is deliberate, and it is what lets the stored
// values change without touching a single gate.
//
// Before this module existed, the level values appeared as bare literals in
// thirty-odd places across both packages. A value change meant finding all fourteen and getting every
// one right, with a silent failure if you didn't: a business holding a value
// no Set contains is refused vouching and rendered with no badge icon, with
// nothing in the logs to say why.
const VERIFICATION_LEVELS = ["L0", "L1", "L2", "L3", "L4"];

// The three the product actually branches on, so no route hardcodes a level
// string again.
//
// UNCLAIMED is the one that carries a rule rather than a label: a business at
// this level has no owner, which is why it is refused every relational action
// (POST /connections, POST /follows) — there is nobody on the other end.
const UNCLAIMED = VERIFICATION_LEVELS[0];
const CLAIMED = VERIFICATION_LEVELS[1];
const SSM_VERIFIED = VERIFICATION_LEVELS[2];

// SSM-verified and above — the gate on giving and receiving a vouch. Derived
// from the ordered list rather than written out, so it cannot drift from the
// union above: it used to be a bare literal Set in routes/vouches.js with no
// way of proving it agreed with the schema.
const VOUCHABLE_VERIFICATION_LEVELS = new Set(VERIFICATION_LEVELS.slice(2));

function isValidVerificationLevel(value) {
  return VERIFICATION_LEVELS.includes(value);
}

export {
  VERIFICATION_LEVELS,
  UNCLAIMED,
  CLAIMED,
  SSM_VERIFIED,
  VOUCHABLE_VERIFICATION_LEVELS,
  isValidVerificationLevel,
};
