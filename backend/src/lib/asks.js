// Everything about asks that has to agree across routes lives here rather
// than in routes/asks.js: the four closed vocabularies, the includes the
// serializers can't work without, and the routing rule.
//
// Same role lib/connections.js plays for connections — and the same reason.
// The routing rule in particular is read by three callers (the board filter,
// the dashboard work prompt and the alert count), and the first one to
// re-derive it slightly differently would quietly show a member a different
// set of asks in the notification than on the page it links to.

// Ask.category — ABRI-feature-checklist.md §7, which says of itself "this is
// the only copy". Free text at the DB level (schema.prisma has no Prisma
// enums), so this is what actually constrains it — same role
// CONNECTION_SOURCES plays in lib/connections.js.
//
// Fixed rather than free text because §7 is explicit about why: "matching is
// tag overlap, so the tags have to be a closed list both sides pick from."
import { ASK_POSTING_VERIFICATION_LEVELS } from "./verificationLevels.js";

const ASK_CATEGORIES = [
  "Customer requirement",
  "Supplier requirement",
  "Partnership",
  "Distribution",
  "Export",
  "Service requirement",
  "Collaboration",
];

const ASK_CATEGORY_SET = new Set(ASK_CATEGORIES);

// Ask.status and AskAnswer.status, each enforced in exactly one place.
const ASK_STATUSES = new Set(["open", "answered", "closed", "under_review"]);
const ANSWER_STATUSES = new Set([
  "offered",
  "accepted",
  "withdrawn",
  "under_review",
  "removed",
]);

// Which verification tiers may POST an ask.
//
// This is the board's spam gate, and it is deliberately a VERIFICATION gate
// rather than a plan gate: ABRI-feature-checklist.md §6 lists "verification
// cannot be bought" as non-negotiable, so T2 is the one door money can't
// open. It also points the unverified member at something free and useful
// (get SSM-verified) instead of at a price.
//
// Answering is gated by nothing at all. That asymmetry is the whole design:
// asking is extraction and answering is giving, and the blueprint's founding
// principle #7 says to make giving easier than extracting.
// Imported rather than re-declared. This Set and VOUCHABLE_VERIFICATION_LEVELS
// in routes/vouches.js have always held the same three values, and were two
// independent literals with no way of proving they agreed.
function canPostAsks(business) {
  return ASK_POSTING_VERIFICATION_LEVELS.has(business.verificationLevel);
}

// Which answer statuses occupy one of an ask's maxAnswers slots.
//
// "withdrawn" and "removed" are both absent, but they free the slot to
// different people: a withdrawn row is reusable by its own author (the
// upsert in POST /asks/:id/answers resets it in place), while a removed row
// is not — an admin killed that answer, and letting its author immediately
// re-file would make the removal decorative. The @@unique on AskAnswer is
// what makes both of those a single row rather than a growing pile.
const ANSWER_CAP_STATUSES = ["offered", "accepted", "under_review"];

// AskFlag.reason, split by what is being reported. Kept as two lists because
// "self promotion" is meaningless against an ask and "not a real ask" is
// meaningless against an answer, and one merged list would offer every
// reporter four options of which two are nonsense.
const ASK_FLAG_REASONS = new Set([
  "spam",
  "not_a_real_ask",
  "abusive_content",
  "other",
]);
const ANSWER_FLAG_REASONS = new Set([
  "self_promotion",
  "irrelevant",
  "abusive_content",
  "other",
]);

// The business fields every ask payload carries. Identical today to
// CONNECTION_BUSINESS_SELECT in lib/connections.js, and COPIED rather than
// imported for the reason that constant's own comment gives: it was kept
// separate from vouchTurn.js's BUSINESS_SELECT so that widening one would not
// "silently add a field to every payload for the sake of an unrelated
// consumer". Importing it here would make the next widening of a connection
// card change what the board sends.
//
// Note what it does not select: no contact columns, no membershipTier. That
// is why publicBusinessView is not needed on this path — there is nothing
// here for it to strip.
const ASK_BUSINESS_SELECT = {
  id: true,
  name: true,
  category: true,
  location: true,
  verificationLevel: true,
};

// One include for every ask LIST read. The filtered _count is how the slot
// count is derived — there is no answerCount column, because a stored counter
// is the one thing that can claim an ask is full while four live answers sit
// under it. Precedent: the vouchesReceived _count in routes/businesses.js.
const ASK_INCLUDE = {
  askedByBusiness: { select: ASK_BUSINESS_SELECT },
  _count: { select: { answers: { where: { status: { in: ANSWER_CAP_STATUSES } } } } },
};

// The single-ask read additionally pulls the answers themselves.
//
// Answers are visible to EVERY member, not only to the asker, and that is a
// decision rather than an oversight: a slot count reading "2 of 6 left" is
// meaningless if you can't see what filled the other four, and a private
// answer list turns the board into a funnel where one business collects six
// pitches nobody else can see. That is closer to Thumbtack than to a
// directory, and §6's "never build a marketplace" is the nearest rule.
//
// Withdrawn and removed answers are excluded here rather than filtered on the
// client, so a removed answer cannot be read out of a network response.
const ASK_DETAIL_INCLUDE = {
  askedByBusiness: { select: ASK_BUSINESS_SELECT },
  answers: {
    where: { status: { in: ANSWER_CAP_STATUSES } },
    include: {
      answeredByBusiness: { select: ASK_BUSINESS_SELECT },
      recommendedBusiness: { select: ASK_BUSINESS_SELECT },
    },
    orderBy: { createdAt: "asc" },
  },
};

// How strongly an ask is addressed to a given business.
//
// Two tiers rather than a boolean, and this is the density answer: four
// categories times six locations over twenty-odd businesses means an exact
// category-AND-location match is frequently zero, and a routing rule that
// usually returns nothing is a feed with extra steps.
//
//   "exact"    — same trade AND same locality. The board's "Matches you"
//                filter and the dashboard prompt lead with these.
//   "category" — same trade, different locality. Still your line of work and
//                still answerable at Klang Valley distances. The location is
//                shown on the card so the reader decides, rather than the
//                server deciding for them by hiding it.
//   null       — a different trade. Visible on the board, never surfaced as
//                work.
//
// This is where the density question lives, so it is the file to change if it
// bites. When the corridor SSM import lands and BUSINESS_LOCATIONS grows to
// 15-30 localities, the move is to add a "region" strength between the two.
// What must NOT happen instead is loosening these to substring or fuzzy
// comparisons — that converts a closed list back into free text by the back
// door and takes the silent-miss bug with it.
// "service" SITS ABOVE "exact", and the ordering is the one judgement call in
// this function. A business that does the exact thing being asked for, in the
// next town, is a better answer than one in the same street that merely shares
// a trade — for professional services the skill travels and the distance does
// not matter much. If that stops being true for a category (anything with a
// site visit), the fix is a per-category ordering, not a reshuffle here.
//
// An ask with no matchServices can never reach "service", so every ask written
// before that column existed keeps exactly the two strengths it had.
function matchStrengthFor(ask, business) {
  if (!business || ask.matchCategory !== business.category) return null;
  const wanted = ask.matchServices ?? [];
  if (wanted.length > 0 && (business.services ?? []).some((s) => wanted.includes(s))) {
    return "service";
  }
  return ask.matchLocation === business.location ? "exact" : "category";
}

// The `where` clause for asks addressed to this business. Used by the board's
// match filter and by the alert count.
//
// Callers that COUNT pass expiresAt themselves rather than sweeping — see
// applyExpiryIfNeeded's comment for why a count must not write.
// Ordered widest to narrowest: "category" is every ask in your trade, "exact"
// narrows to your locality, "service" narrows to asks naming something you
// actually do.
//
// `hasSome` is the only operator here that is not equality, and it is still an
// exact one — it asks whether any element of matchServices appears in the
// business's services array, element by element. That is what keeps the
// closed-vocabulary guarantee intact: the join is still on whole canonical
// strings, never on substrings, so lib/businessVocab.js's warning against
// "loosening these to substring or fuzzy comparisons" is honoured.
function matchingAsksWhere(business, { strength = "category" } = {}) {
  return {
    status: "open",
    matchCategory: business.category,
    ...(strength === "exact" ? { matchLocation: business.location } : {}),
    ...(strength === "service"
      ? { matchServices: { hasSome: business.services ?? [] } }
      : {}),
  };
}

// A self-nomination is exactly "the author named themselves". There is no
// `kind` column saying so, on purpose: two foreign keys already carry the
// fact, and a third column restating it is one that can disagree with them.
//
// STILL LABELLED, EVEN THOUGH NOTHING PUBLISHES ANY MORE. Accepting an answer
// stopped producing a public recommendation in Sept 2026 (see routes/asks.js),
// which removed the reason self-nomination was ever GATED — a pitch can no
// longer escape onto a third party's profile because nothing reaches a profile
// at all. What it did not remove is the asker's need to tell the two apart:
// "this firm says they can do it" and "an unrelated member says they can" are
// different claims, and the second is the one worth more. So this survives as
// a labelling rule on the answer card, and nowhere else.
function isSelfNomination(answer) {
  return answer.recommendedBusinessId === answer.answeredByBusinessId;
}

function serializeAnswer(answer) {
  return {
    id: answer.id,
    comment: answer.comment,
    status: answer.status,
    createdAt: answer.createdAt,
    acceptedAt: answer.acceptedAt,
    answeredBy: answer.answeredByBusiness,
    recommended: answer.recommendedBusiness,
    // Resolved server-side so no client has to re-derive the rule: it drives
    // which of two sentences the answer card renders.
    isSelfNomination: isSelfNomination(answer),
  };
}

// viewerBusiness may be null (an account with no business). Everything
// viewer-dependent is resolved here rather than on the client, the same way
// serializeConnection resolves `counterparty` and `requestedByYou`.
function serializeAsk(ask, viewerBusiness) {
  const answerCount = ask._count?.answers ?? ask.answers?.length ?? 0;
  const askedByYou = Boolean(viewerBusiness) && ask.askedByBusinessId === viewerBusiness.id;
  const yourAnswer = ask.answers?.find(
    (a) => viewerBusiness && a.answeredByBusinessId === viewerBusiness.id,
  );

  return {
    id: ask.id,
    category: ask.category,
    matchCategory: ask.matchCategory,
    matchLocation: ask.matchLocation,
    matchServices: ask.matchServices ?? [],
    title: ask.title,
    detail: ask.detail,
    status: ask.status,
    // NULL MEANS UNCAPPED, on both of these, and a client must check before
    // doing arithmetic. `Math.max(0, null - 5)` is 0, which would render as
    // "full" on an ask that accepts everybody — the single worst way to get
    // this wrong, and the reason both are null rather than Infinity or a
    // sentinel number.
    maxAnswers: ask.maxAnswers ?? null,
    answerCount,
    // Derived, never a status. An ask that has filled its slots stops taking
    // answers but stays "open", because the asker still has a decision to
    // make — treating full as closed is the likeliest thing to get wrong here.
    slotsLeft: ask.maxAnswers === null || ask.maxAnswers === undefined
      ? null
      : Math.max(0, ask.maxAnswers - answerCount),
    expiresAt: ask.expiresAt,
    createdAt: ask.createdAt,
    closedAt: ask.closedAt,
    askedBy: ask.askedByBusiness,
    askedByYou,
    matchStrength: viewerBusiness && !askedByYou ? matchStrengthFor(ask, viewerBusiness) : null,
    yourAnswerStatus: yourAnswer?.status ?? null,
    ...(ask.answers ? { answers: ask.answers.map(serializeAnswer) } : {}),
  };
}

export {
  ASK_CATEGORIES,
  ASK_CATEGORY_SET,
  ASK_STATUSES,
  ANSWER_STATUSES,
  ANSWER_CAP_STATUSES,
  ASK_FLAG_REASONS,
  ANSWER_FLAG_REASONS,
  ASK_BUSINESS_SELECT,
  ASK_INCLUDE,
  ASK_DETAIL_INCLUDE,
  canPostAsks,
  matchStrengthFor,
  matchingAsksWhere,
  isSelfNomination,
  serializeAsk,
  serializeAnswer,
};
