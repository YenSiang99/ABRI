import { VOUCHABLE_VERIFICATION_LEVELS } from "@/lib/verificationLevels";
// Extracted out of lib/store/businesses.js (the mock store) so real
// backend-wired components (VouchDialog, BusinessProfile) don't have to
// import tier-gating logic from the mock. Mirrors
// backend/src/routes/vouches.js's VOUCHABLE_VERIFICATION_LEVELS exactly — a business
// must be SSM-verified (T2+) to give or receive a vouch.
// Imported rather than re-declared — mirrors the server's single source.

// The viewer's existing outgoing vouch to `targetId`, or null. Reads
// `vouchedFor` off the logged-in business (see backend lib/accountView.js),
// which lists only non-cancelled outgoing vouches — a cancelled pair is
// free to vouch again, so its absence here is correct rather than missing.
function existingVouchTo(viewerBusiness, targetId) {
  return (viewerBusiness?.vouchedFor ?? []).find((v) => v.businessId === targetId) ?? null;
}

// "Can I submit a vouch for them right now" — the full precondition for
// POST /vouches, not just the tier half of it. Takes the viewer's business
// rather than its id because one vouch per pair is as much a part of the
// rule as tier is, and splitting them across two call sites is what let the
// second one get forgotten: every affordance checked tier, none checked
// whether a vouch already existed, so the button rendered and the API
// answered 409.
function isVouchable(target, viewerBusiness) {
  return (
    Boolean(target) &&
    target.id !== viewerBusiness?.id &&
    VOUCHABLE_VERIFICATION_LEVELS.has(target.verificationLevel) &&
    !existingVouchTo(viewerBusiness, target.id)
  );
}

// The round cap now travels on the vouch itself (Vouch.maxRevisions), so
// there's no constant here to drift from the server's. Falls back to 2 only
// for a payload that predates the field.
const revisionCapFor = (vouch) => vouch.maxRevisions ?? 2;

// Every gate below reads `waitingOn`, which the server computes in
// lib/vouchTurn.js and sends down on each vouch. Deliberately not
// re-derived from status here: when the client had its own opinion about
// who could act, it drifted from the server's and rendered buttons the API
// would reject.
//
// These decide whether an action RENDERS, not whether it's enabled. A
// disabled Accept just raises "why can't I click this?" — when it isn't
// your turn the whole action row is replaced by a line saying whose it is.
const isMyTurn = (vouch) => vouch.waitingOn === "you";
// A flagged vouch is nobody's turn but an admin's — both businesses see it
// and neither can move it.
const isUnderReview = (vouch) => vouch.waitingOn === "admin";

// The receiver's four actions. Three of them are turn-gated together;
// `canFlag` is the odd one out, on purpose — see below.
const canAccept = (vouch) => isMyTurn(vouch) && vouch.role === "receiver";
const canRevert = (vouch) => canAccept(vouch) && vouch.revisionCount < revisionCapFor(vouch);
// Same gate as accept, not a wider one: strict turn-taking means a
// receiver who has sent a vouch back waits for the revision. A vouch stuck
// there resolves through the server's 14-day expiry.
const canCancel = (vouch) => canAccept(vouch);
// Wider than the other three, matching POST /vouches/:id/flag: the
// receiver can report content while the giver holds the turn, because
// "wait 14 days for it to lapse" is not an answer to abuse.
const canFlag = (vouch) =>
  vouch.role === "receiver" && (vouch.status === "pending" || vouch.status === "reverted");
const canRevise = (vouch) => isMyTurn(vouch) && vouch.role === "giver";

export {
  VOUCHABLE_VERIFICATION_LEVELS,
  isVouchable,
  existingVouchTo,
  revisionCapFor,
  isMyTurn,
  isUnderReview,
  canAccept,
  canRevert,
  canCancel,
  canFlag,
  canRevise,
};
