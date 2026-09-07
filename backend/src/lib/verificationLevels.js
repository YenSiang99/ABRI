// The Business.verificationLevel union, and the ONLY place these five strings
// are written down.
//
// schema.prisma has no Prisma enums anywhere, so this module is what actually
// constrains the column — the same role ASK_CATEGORIES plays for Ask.category
// in lib/asks.js and CONNECTION_SOURCES plays for Connection.source.
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
// no Set contains is refused vouching, refused ask posting, and rendered with
// no badge icon, with nothing in the logs to say why.
const VERIFICATION_LEVELS = ["L0", "L1", "L2", "L3", "L4"];

// The three the product actually branches on, so no route hardcodes a level
// string again.
//
// UNCLAIMED is the one that carries a rule rather than a label: a business at
// this level has no owner, which is why it is refused every relational action
// (POST /connections, POST /follows) — there is nobody on the other end. The
// one deliberate exception is being RECOMMENDED on the asks board, where the
// answer is addressed to the asker rather than to the business named.
const UNCLAIMED = VERIFICATION_LEVELS[0];
const CLAIMED = VERIFICATION_LEVELS[1];
const SSM_VERIFIED = VERIFICATION_LEVELS[2];

// SSM-verified and above.
//
// Two exports rather than one, even though they hold the same three values
// today. They gate different things — giving a vouch, and posting an ask —
// and the doctrine discusses them separately; keeping them apart means one
// can be widened without silently widening the other. What they must NOT be
// is two independent literals, which is what they were until this module:
// two Sets that were always meant to agree and had no way of proving it.
const VOUCHABLE_VERIFICATION_LEVELS = new Set(VERIFICATION_LEVELS.slice(2));
const ASK_POSTING_VERIFICATION_LEVELS = new Set(VERIFICATION_LEVELS.slice(2));

// Every level from `level` upwards, as an array ready for a Prisma `in`.
//
// The ONE place the ordering above is used for anything but labelling, and it
// reads the order the same way VOUCHABLE_VERIFICATION_LEVELS does — by
// slicing the array — rather than by comparing two stored values with `<`.
// The distinction is the one the header makes: the order lives here and only
// here, so the stored strings stay free to change.
//
// Written for the network feed, where a level announcement stays visible only
// while the business is still at or above the level it announced. That is
// what makes "X is now SSM-Verified" disappear when the verification is
// revoked (L2 -> L1) while surviving an ordinary promotion (L2 -> L3), which
// a plain equality check would get backwards.
function verificationLevelsAtOrAbove(level) {
  const index = VERIFICATION_LEVELS.indexOf(level);
  // An unknown level matches nothing rather than everything. slice(-1) on a
  // -1 index would quietly return the TOP level and make a bad row visible.
  return index === -1 ? [] : VERIFICATION_LEVELS.slice(index);
}

function isValidVerificationLevel(value) {
  return VERIFICATION_LEVELS.includes(value);
}

export {
  VERIFICATION_LEVELS,
  UNCLAIMED,
  CLAIMED,
  SSM_VERIFIED,
  VOUCHABLE_VERIFICATION_LEVELS,
  ASK_POSTING_VERIFICATION_LEVELS,
  verificationLevelsAtOrAbove,
  isValidVerificationLevel,
};
