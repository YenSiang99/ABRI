import { ENDORSABLE_VERIFICATION_LEVELS } from "@/lib/verificationLevels";
// Extracted out of lib/store/businesses.js (the mock store) so real
// backend-wired components (EndorseDialog, BusinessProfile) don't have to
// import tier-gating logic from the mock. Mirrors
// backend/src/routes/endorsements.js's ENDORSABLE_VERIFICATION_LEVELS exactly — a business
// must be SSM-verified (T2+) to give or receive an endorsement.
// Imported rather than re-declared — mirrors the server's single source.
// This Set has always held the same three values as the SSM-verified gate.

// The viewer's existing outgoing endorsement to `targetId`, or null. Reads
// `endorsedFor` off the logged-in business (see backend lib/accountView.js),
// which lists only non-cancelled outgoing endorsements — a cancelled pair is
// free to endorse again, so its absence here is correct rather than missing.
function existingEndorsementTo(viewerBusiness, targetId) {
  return (viewerBusiness?.endorsedFor ?? []).find((v) => v.businessId === targetId) ?? null;
}

// "Can I submit an endorsement of them right now" — the full precondition for
// POST /endorsements, not just the tier half of it. Takes the viewer's business
// rather than its id because one endorsement per pair is as much a part of the
// rule as tier is, and splitting them across two call sites is what let the
// second one get forgotten: every affordance checked tier, none checked
// whether an endorsement already existed, so the button rendered and the API
// answered 409.
function isEndorsable(target, viewerBusiness) {
  return (
    Boolean(target) &&
    target.id !== viewerBusiness?.id &&
    ENDORSABLE_VERIFICATION_LEVELS.has(target.verificationLevel) &&
    !existingEndorsementTo(viewerBusiness, target.id)
  );
}

// The round cap now travels on the endorsement itself (Endorsement.maxRevisions), so
// there's no constant here to drift from the server's. Falls back to 2 only
// for a payload that predates the field.
const revisionCapFor = (endorsement) => endorsement.maxRevisions ?? 2;

// Every gate below reads `waitingOn`, which the server computes in
// lib/endorsementTurn.js and sends down on each endorsement. Deliberately not
// re-derived from status here: when the client had its own opinion about
// who could act, it drifted from the server's and rendered buttons the API
// would reject.
//
// These decide whether an action RENDERS, not whether it's enabled. A
// disabled Accept just raises "why can't I click this?" — when it isn't
// your turn the whole action row is replaced by a line saying whose it is.
const isMyTurn = (endorsement) => endorsement.waitingOn === "you";
// A flagged endorsement is nobody's turn but an admin's — both businesses see it
// and neither can move it.
const isUnderReview = (endorsement) => endorsement.waitingOn === "admin";

// The receiver's four actions. Three of them are turn-gated together;
// `canFlag` is the odd one out, on purpose — see below.
const canAccept = (endorsement) => isMyTurn(endorsement) && endorsement.role === "receiver";
const canRevert = (endorsement) => canAccept(endorsement) && endorsement.revisionCount < revisionCapFor(endorsement);
// Same gate as accept, not a wider one: strict turn-taking means a
// receiver who has sent an endorsement back waits for the revision. An endorsement stuck
// there resolves through the server's 14-day expiry.
const canCancel = (endorsement) => canAccept(endorsement);
// Wider than the other three, matching POST /endorsements/:id/flag: the
// receiver can report content while the giver holds the turn, because
// "wait 14 days for it to lapse" is not an answer to abuse.
const canFlag = (endorsement) =>
  endorsement.role === "receiver" && (endorsement.status === "pending" || endorsement.status === "reverted");
const canRevise = (endorsement) => isMyTurn(endorsement) && endorsement.role === "giver";

export {
  ENDORSABLE_VERIFICATION_LEVELS,
  isEndorsable,
  existingEndorsementTo,
  revisionCapFor,
  isMyTurn,
  isUnderReview,
  canAccept,
  canRevert,
  canCancel,
  canFlag,
  canRevise,
};
