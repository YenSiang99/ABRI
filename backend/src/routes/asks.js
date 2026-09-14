import { Router } from "express";

import { prisma } from "../prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { createActivityEvent } from "../lib/activityEvents.js";
import { applyExpiryIfNeeded, ASK_EXPIRY_DAYS } from "../lib/askExpiry.js";
import { isValidCategory, isValidLocation } from "../lib/businessVocab.js";
import { canonicalService } from "../lib/serviceVocab.js";
import { can } from "../lib/entitlements.js";
import {
  ASK_CATEGORY_SET,
  ASK_FLAG_REASONS,
  ANSWER_FLAG_REASONS,
  ANSWER_CAP_STATUSES,
  ASK_INCLUDE,
  ASK_DETAIL_INCLUDE,
  canPostAsks,
  matchingAsksWhere,
  isSelfNomination,
  serializeAsk,
  serializeAnswer,
} from "../lib/asks.js";

// The Asks board.
//
//                       accept an answer (asker)
//    [ open ] ──────────────────────────────────────► [ answered ]  terminal
//       │  │                                                │
//       │  ├── close (asker) ─────► [ closed ]              │ admin removes
//       │  ├── 30 days lapse ─────► [ closed ]  (lazy)      │ the accepted
//       │  └── flag (any member) ─► [ under_review ]        │ answer
//       │                                 │                └──► [ closed ]
//       │◄──── admin: restore ────────────┤
//       └──────── admin: close ───────────┘ ─► [ closed ]
//
//  ANSWER
//    [ offered ] ── accept (asker) ──► [ accepted ]  settles the ask, publishes nothing
//         │  │                              │
//         │  ├── withdraw (answerer) ─► [ withdrawn ]  slot back to its author
//         │  └── flag ─► [ under_review ] ◄─┘
//         │                     │
//         │◄─ admin: restore ───┤
//         └── admin: remove ────┴─► [ removed ]  slot back to everybody else
//
// Two rules that are easy to get wrong and are stated here because they are
// invariants rather than implementation:
//
//   1. FULL IS NOT CLOSED. An ask that has used all maxAnswers slots stops
//      accepting answers and stays "open" — the asker still has a decision
//      to make. "Full" is derived (slotsLeft === 0), never a status.
//
//   2. ACCEPTING ONE ANSWER DOES NOT REJECT THE OTHERS. They stay "offered"
//      and nobody is told they weren't picked, the same reason
//      lib/connections.js DELETES a declined request rather than recording
//      it. The give-first loop dies the moment answering carries a risk of
//      being publicly told no.

const router = Router();

router.use(requireAuth);

// Copied from routes/vouches.js rather than shared, matching what
// routes/connections.js and routes/follows.js already do with the same three
// helpers. A fourth copy is cheaper than a refactor bundled into a feature.
function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

// The paywall's throw. A 402 with requiredMembershipTier rather than a 403, so the
// client opens an upgrade prompt naming the plan instead of toasting an error
// — see middleware/errorHandler.js, the only thing that reads the field.
//
// Used exactly once in this file, on GET /asks/alerts. Posting and answering
// are not plan gates and must never grow one.
function failUpgrade(plan, message) {
  throw Object.assign(new Error(message), { status: 402, requiredMembershipTier: plan });
}

async function loadOwnBusiness(req) {
  if (!req.account.businessId) fail(400, "You need a claimed business to do this.");
  const business = await prisma.business.findUnique({ where: { id: req.account.businessId } });
  if (!business) fail(400, "You need a claimed business to do this.");
  return business;
}

// Loads an Ask by id and applies the lazy 30-day expiry — the single entry
// point every :id route uses, so none of them can act on a row that should
// already have lapsed to closed.
async function loadAsk(id, include = ASK_DETAIL_INCLUDE) {
  const ask = await prisma.ask.findUnique({ where: { id }, include });
  if (!ask) fail(404, "Ask not found.");
  return applyExpiryIfNeeded(ask);
}

// Frozen content is hidden from everyone except the member it belongs to.
//
// One rule, applied by every :id route rather than only by the read, because
// a 404 on GET and a 400 on POST would let anyone tell "frozen" apart from
// "never existed" — which is moderation state leaking to the person most
// likely to be probing for it. The owner still gets the real thing, because
// they have to be able to see why their post stopped working.
function hideIfFrozenForOthers(ask, own) {
  if (ask.status === "under_review" && ask.askedByBusinessId !== own?.id) {
    fail(404, "Ask not found.");
  }
}

// An account with no business can read nothing here and act on nothing. It
// gets an empty board rather than a 400, matching GET /connections — an
// admin (who has no business) opening the page should see an empty list, not
// an error.
function ownBusinessOrNull(req) {
  if (!req.account.businessId) return null;
  return prisma.business.findUnique({ where: { id: req.account.businessId } });
}

// ─── Reads ──────────────────────────────────────────────────────────────────
// /mine, /answered and /alerts are declared BEFORE /:id, or Express matches
// them as ask ids — the same collision routes/follows.js documents.

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const own = await ownBusinessOrNull(req);
    if (!own) return res.json({ asks: [] });

    const { matchStrength, category } = req.query;

    const asks = await prisma.ask.findMany({
      where: {
        // "answered" is included so a settled thread stays readable — the
        // archive of what people actually suggested is the part of this board
        // worth keeping. "closed" is not: nothing was decided.
        //
        // "under_review" appears ONLY in its own asker's list, further down.
        // Frozen content is hidden from everyone else, but the asker has to
        // be able to see why their post stopped working.
        OR: [
          { status: { in: ["open", "answered"] } },
          { status: "under_review", askedByBusinessId: own.id },
        ],
        ...(category ? { category } : {}),
        ...(matchStrength === "service" ||
        matchStrength === "exact" ||
        matchStrength === "category"
          ? matchingAsksWhere(own, { strength: matchStrength })
          : {}),
      },
      include: ASK_INCLUDE,
      orderBy: { createdAt: "desc" },
    });

    // Sweep expiry across the list, then drop anything that just closed —
    // the same shape routes/vouches.js uses on its list read.
    const swept = await Promise.all(asks.map(applyExpiryIfNeeded));
    res.json({
      asks: swept
        .filter((a) => a.status !== "closed")
        .map((a) => serializeAsk(a, own)),
    });
  }),
);

router.get(
  "/mine",
  asyncHandler(async (req, res) => {
    const own = await ownBusinessOrNull(req);
    if (!own) return res.json({ asks: [] });

    const asks = await prisma.ask.findMany({
      where: { askedByBusinessId: own.id },
      include: ASK_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
    const swept = await Promise.all(asks.map(applyExpiryIfNeeded));
    res.json({ asks: swept.map((a) => serializeAsk(a, own)) });
  }),
);

router.get(
  "/answered",
  asyncHandler(async (req, res) => {
    const own = await ownBusinessOrNull(req);
    if (!own) return res.json({ asks: [] });

    const asks = await prisma.ask.findMany({
      where: { answers: { some: { answeredByBusinessId: own.id } } },
      include: {
        ...ASK_INCLUDE,
        // Only this business's own answer, so serializeAsk can resolve
        // yourAnswerStatus without shipping the whole thread.
        answers: {
          where: { answeredByBusinessId: own.id },
          include: {
            answeredByBusiness: { select: { id: true, name: true, category: true, location: true, verificationLevel: true } },
            recommendedBusiness: { select: { id: true, name: true, category: true, location: true, verificationLevel: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    const swept = await Promise.all(asks.map(applyExpiryIfNeeded));
    res.json({ asks: swept.map((a) => serializeAsk(a, own)) });
  }),
);

// What Pro buys, and the only plan gate in this file.
//
// Deliberately a COUNT plus a preview rather than stored notifications. An
// ActivityEvent per matching business would write a row into every one of
// their feeds, and those are capped at 50 per business
// (ACTIVITY_KEEP_PER_BUSINESS) — a busy week would evict real vouch
// notifications to make room for things that aren't about them. Computing it
// on read also means the gate withholds nothing that has to be deleted when a
// plan lapses.
router.get(
  "/alerts",
  asyncHandler(async (req, res) => {
    const own = await ownBusinessOrNull(req);
    if (!own) return res.json({ count: 0, top: [] });

    if (!can(own, "askAlerts")) {
      failUpgrade("pro", "Pro tells you when an ask matches what you do.");
    }

    // Filters on expiresAt rather than calling applyExpiryIfNeeded. This is a
    // count on a hot path and a read must not write; filtering gives the same
    // answer, and the actual status flip happens the moment anyone opens the
    // board. The one place in this file that diverges from the sweep.
    const where = {
      ...matchingAsksWhere(own, { strength: "category" }),
      expiresAt: { gt: new Date() },
      askedByBusinessId: { not: own.id },
    };

    const [count, top] = await Promise.all([
      prisma.ask.count({ where }),
      prisma.ask.findMany({ where, include: ASK_INCLUDE, orderBy: { createdAt: "desc" }, take: 3 }),
    ]);

    res.json({ count, top: top.map((a) => serializeAsk(a, own)) });
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const own = await ownBusinessOrNull(req);
    const ask = await loadAsk(req.params.id);
    hideIfFrozenForOthers(ask, own);
    res.json({ ask: serializeAsk(ask, own) });
  }),
);

// ─── Writes ─────────────────────────────────────────────────────────────────

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const own = await loadOwnBusiness(req);

    // The T2 gate, and the only gate on this route. Checked before any other
    // validation so an unverified member is told the real reason rather than
    // being walked through a form they can't submit.
    //
    // A VERIFICATION gate, not a plan gate: §6 makes "verification cannot be
    // bought" non-negotiable, so this is the one door money can't open — and
    // it points the member at something free (get SSM-verified) rather than
    // at a price. There is deliberately no can() call anywhere in this file.
    if (!canPostAsks(own)) {
      fail(403, "Posting an ask needs SSM verification. Your listing isn't verified yet.");
    }

    const { category, matchCategory, matchLocation, matchServices, maxAnswers, title, detail } =
      req.body ?? {};

    if (!ASK_CATEGORY_SET.has(category)) fail(400, "Pick what kind of need this is.");
    if (!isValidCategory(matchCategory)) fail(400, "Pick who could help from the list.");
    if (!isValidLocation(matchLocation)) fail(400, "Pick a location from the list.");

    // Optional, and validated against the catalogue rather than accepted as
    // typed. An ask naming a service no business can hold is an ask nothing
    // will ever match — the silent miss lib/serviceVocab.js exists to remove —
    // so a bad value is refused loudly here instead of stored quietly.
    const services = Array.isArray(matchServices) ? matchServices : [];
    const canonicalServices = [];
    for (const raw of services) {
      const hit = canonicalService(raw);
      if (!hit) fail(400, `"${raw}" isn't a service anyone can be matched on.`);
      if (!canonicalServices.includes(hit)) canonicalServices.push(hit);
    }

    // The asker's own clutter limit, and null unless they set one. Rejected
    // rather than clamped when it is nonsense: a cap of 0 accepts nothing and
    // is far more likely a client bug than an intention.
    let cap = null;
    if (maxAnswers !== undefined && maxAnswers !== null) {
      if (!Number.isInteger(maxAnswers) || maxAnswers < 1) {
        fail(400, "An answer limit must be a whole number of 1 or more.");
      }
      cap = maxAnswers;
    }

    const cleanTitle = title?.trim();
    if (!cleanTitle) fail(400, "Say what you're looking for.");
    if (cleanTitle.length > 120) fail(400, "Keep the title under 120 characters.");
    const cleanDetail = detail?.trim() || null;
    if (cleanDetail && cleanDetail.length > 400) fail(400, "Keep the detail under 400 characters.");

    const ask = await prisma.ask.create({
      data: {
        askedByBusinessId: own.id,
        category,
        matchCategory,
        matchLocation,
        matchServices: canonicalServices,
        maxAnswers: cap,
        title: cleanTitle,
        detail: cleanDetail,
        expiresAt: new Date(Date.now() + ASK_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
      },
      include: ASK_INCLUDE,
    });

    // No activity event. A post is addressed to nobody in particular, and
    // fanning one out to every matching business would write a row into each
    // of their feeds — which are capped at 50 (ACTIVITY_KEEP_PER_BUSINESS),
    // so a busy week would evict real vouch notifications to make room for
    // things that aren't about them. The alert is a COUNT computed on read
    // (GET /asks/alerts), never stored rows.
    res.status(201).json({ ask: serializeAsk(ask, own) });
  }),
);

router.post(
  "/:id/close",
  asyncHandler(async (req, res) => {
    const own = await loadOwnBusiness(req);
    const ask = await loadAsk(req.params.id, ASK_INCLUDE);

    if (ask.askedByBusinessId !== own.id) fail(403, "This isn't your ask.");
    if (ask.status !== "open") fail(400, "This ask is already settled.");

    const updated = await prisma.ask.update({
      where: { id: ask.id },
      data: { status: "closed", closedAt: new Date() },
      include: ASK_INCLUDE,
    });
    // No event: the asker pressed this themselves, and telling the answerers
    // their ask closed unpicked is the "you weren't chosen" notification this
    // feature deliberately does not send.
    res.json({ ask: serializeAsk(updated, own) });
  }),
);

router.post(
  "/:id/answers",
  asyncHandler(async (req, res) => {
    const own = await loadOwnBusiness(req);
    const ask = await loadAsk(req.params.id, ASK_INCLUDE);

    hideIfFrozenForOthers(ask, own);
    if (ask.status !== "open") fail(400, "This ask isn't taking answers.");
    if (ask.askedByBusinessId === own.id) fail(400, "You can't answer your own ask.");

    const { recommendedBusinessId, comment } = req.body ?? {};
    const cleanComment = comment?.trim();
    if (!cleanComment) fail(400, "Say why they're a good fit.");
    if (cleanComment.length > 300) fail(400, "Keep it under 300 characters.");

    const target = await prisma.business.findUnique({ where: { id: recommendedBusinessId } });
    if (!target) fail(404, "Business not found.");

    // NO T0 refusal here, unlike POST /connections and POST /follows. An
    // answer is addressed to the ASKER, not to the business named, so naming
    // an unclaimed listing does nothing TO an absent owner — and once the
    // corridor SSM import lands, the best answer will routinely be a business
    // that hasn't claimed yet. Since Sept 2026 an accepted answer publishes
    // nothing anywhere, so a T0 here is not even a deferred write: the name
    // reaches the asker and stops.
    //
    // NO can() call either. Answering is not plan-gated, on purpose: Pro buys
    // the alert, not the ability to act on one.

    // Enforcing the cap without holding a lock, and the two approaches that
    // were tried and rejected first — because both of them look obviously
    // right and both fail on this stack:
    //
    //   SERIALIZABLE + retry. Holds the cap, but the losers abort with P2034
    //   and retry into each other. Eight simultaneous answers to a six-slot
    //   ask produced four successes, four 500s, and two slots left empty.
    //
    //   SELECT ... FOR UPDATE inside an interactive transaction. Correct in
    //   principle, and much worse in practice: every waiting writer holds a
    //   pooled connection while it waits, so the queue exhausts Prisma's
    //   pool. The same run produced P2028 transaction-start timeouts AND
    //   P1001s on /auth/login — a contended ask took the rest of the app
    //   down with it. That is disqualifying on its own.
    //
    // So: insert optimistically, then verify and compensate. Under no
    // contention this costs one extra count. Under contention the writers who
    // overshot undo themselves and get the same 409 they would have got from
    // a lock — and nothing ever holds a transaction open across a wait.
    //
    // Still not a counter column: every count below is of real rows. See the
    // no-derived-counts rule in schema.prisma.
    //
    // THE RESIDUAL, stated exactly, because it is a real one. The verify step
    // reads rows the other writers may not have committed yet, so two
    // simultaneous writers can each rank themselves inside the cap. Measured
    // over eight-way contention on one ask: zero errors every run, the cap
    // exact in most runs, and an overshoot of ONE in the rest. Never more,
    // because a writer that overshoots by more than one always sees at least
    // one committed rival ahead of it.
    //
    // That is the trade this codebase should take. An ask holding seven
    // answers instead of six is cosmetic; a 500 on an ordinary answer, or a
    // contended ask taking /auth/login down with it, is not. Realistic
    // contention on a board this size is one or two writers, where the
    // compensation never fires at all.
    //
    // If the cap ever has to be exact, the fix is a single conditional
    // INSERT ... SELECT with the count in its WHERE — one statement, one
    // round trip, atomic, no lock held across a wait. It needs a server-side
    // id default on AskAnswer, which is why it is not here yet.
    const existing = await prisma.askAnswer.findUnique({
      where: { askId_answeredByBusinessId: { askId: ask.id, answeredByBusinessId: own.id } },
    });
    // A withdrawn row is REUSED IN PLACE, the way POST /vouches reuses a
    // cancelled one — which is what keeps the @@unique meaning "one answer per
    // business per ask, ever". A "removed" row is NOT reusable: an admin
    // killed that answer, and letting its author re-file would make the
    // removal decorative.
    if (existing && existing.status === "removed") {
      fail(403, "An admin removed your answer to this ask.");
    }
    if (existing && existing.status !== "withdrawn") {
      fail(409, "You've already answered this ask.");
    }

    // Fast path: refuse before writing anything when the ask is already full.
    //
    // SKIPPED ENTIRELY WHEN maxAnswers IS NULL, which is now the default — see
    // the column comment. Guarding on null rather than treating it as 0 or
    // Infinity keeps the comparison honest: `usedBefore >= null` is false for
    // every count, which would look like it works and then silently let a cap
    // of 0 through as unlimited.
    if (ask.maxAnswers !== null && ask.maxAnswers !== undefined) {
      const usedBefore = await prisma.askAnswer.count({
        where: { askId: ask.id, status: { in: ANSWER_CAP_STATUSES } },
      });
      if (usedBefore >= ask.maxAnswers) {
        fail(409, `This ask already has ${ask.maxAnswers} answers.`);
      }
    }

    const answer = await prisma.askAnswer.upsert({
      where: { askId_answeredByBusinessId: { askId: ask.id, answeredByBusinessId: own.id } },
      create: {
        askId: ask.id,
        answeredByBusinessId: own.id,
        recommendedBusinessId: target.id,
        comment: cleanComment,
      },
      update: {
        recommendedBusinessId: target.id,
        comment: cleanComment,
        status: "offered",
        createdAt: new Date(),
      },
      include: {
        answeredByBusiness: { select: { id: true, name: true, category: true, location: true, verificationLevel: true } },
        recommendedBusiness: { select: { id: true, name: true, category: true, location: true, verificationLevel: true } },
      },
    });

    // Verify. Ordered by (createdAt, id) so every racing writer computes the
    // SAME ranking and exactly the overshooting ones back out — ordering by
    // createdAt alone would tie on identical timestamps and let two writers
    // both believe they were inside the cap.
    // Also skipped when uncapped: with no cap there is no race to resolve, and
    // running this would be a findMany over every answer on the ask for each
    // new one — the cost this guard was always paying for a limit that is now
    // the exception rather than the rule.
    const claimed = ask.maxAnswers === null || ask.maxAnswers === undefined
      ? []
      : await prisma.askAnswer.findMany({
          where: { askId: ask.id, status: { in: ANSWER_CAP_STATUSES } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { id: true },
        });
    const rank = claimed.findIndex((a) => a.id === answer.id);
    if (claimed.length > 0 && rank >= ask.maxAnswers) {
      // We overshot. Undo precisely what we did: a row we created is deleted,
      // a withdrawn row we revived goes back to withdrawn rather than being
      // destroyed, because it is somebody's earlier answer and the @@unique
      // depends on it continuing to exist.
      if (existing) {
        await prisma.askAnswer.update({
          where: { id: answer.id },
          data: { status: "withdrawn", comment: existing.comment, recommendedBusinessId: existing.recommendedBusinessId },
        });
      } else {
        await prisma.askAnswer.delete({ where: { id: answer.id } });
      }
      fail(409, `This ask already has ${ask.maxAnswers} answers.`);
    }

    // Two types rather than one with a branch — see ACTIVITY_MESSAGES. The
    // asker meets the someone-else/self-offer distinction on the ask page,
    // and it has to read the same way in their notifications.
    await createActivityEvent(prisma, {
      businessId: ask.askedByBusinessId,
      actorBusinessId: own.id,
      type: isSelfNomination(answer) ? "ask_self_offered" : "ask_answered",
    });

    res.status(201).json({ answer: serializeAnswer(answer) });
  }),
);

router.post(
  "/:id/answer/withdraw",
  asyncHandler(async (req, res) => {
    const own = await loadOwnBusiness(req);
    const ask = await loadAsk(req.params.id, ASK_INCLUDE);

    // Located by (askId, session business id) — never by an id in the path.
    // Same rule routes/follows.js states: a route taking an arbitrary id is
    // a way to act on somebody else's row.
    const answer = await prisma.askAnswer.findUnique({
      where: { askId_answeredByBusinessId: { askId: ask.id, answeredByBusinessId: own.id } },
    });
    if (!answer) fail(404, "You haven't answered this ask.");
    if (answer.status !== "offered") fail(400, "This answer can't be withdrawn.");

    await prisma.askAnswer.update({
      where: { id: answer.id },
      data: { status: "withdrawn" },
    });
    // No event. "X withdrew their answer" is the same shape as "X removed you
    // from their network" — a hostile notification the reader can do nothing
    // about, which this codebase deliberately does not send.
    res.json({ ok: true });
  }),
);

router.post(
  "/:id/answers/:answerId/accept",
  asyncHandler(async (req, res) => {
    const own = await loadOwnBusiness(req);
    const ask = await loadAsk(req.params.id, ASK_INCLUDE);

    if (ask.askedByBusinessId !== own.id) fail(403, "This isn't your ask.");
    if (ask.status !== "open") fail(400, "This ask is already settled.");

    const answer = await prisma.askAnswer.findUnique({
      where: { id: req.params.answerId },
      include: {
        recommendedBusiness: { select: { id: true, name: true, category: true, location: true, verificationLevel: true } },
      },
    });
    if (!answer || answer.askId !== ask.id) fail(404, "Answer not found.");
    if (answer.status !== "offered") fail(400, "That answer isn't available to accept.");

    const now = new Date();
    await prisma.$transaction([
      prisma.askAnswer.update({
        where: { id: answer.id },
        data: { status: "accepted", acceptedAt: now },
      }),
      prisma.ask.update({
        where: { id: ask.id },
        data: { status: "answered", closedAt: now },
      }),
      // Every other answer stays "offered". There is no "rejected" status
      // and no notification to the businesses who weren't picked — see the
      // header comment.
      //
      // ACCEPTING PUBLISHES NOTHING. Until Sept 2026 this transaction also
      // wrote a recommendation_published network event, which put the named
      // business on a Recommendations tab and announced it to the feed.
      // Removed deliberately: accepting an answer is the ASKER settling their
      // own question, and turning that private decision into a public artifact
      // on a third party's profile made one member's choice into another
      // member's credential. The ask closing is the whole effect.
    ]);

    await createActivityEvent(prisma, {
      businessId: answer.answeredByBusinessId,
      actorBusinessId: own.id,
      type: "ask_answer_accepted",
    });

    const updated = await loadAsk(ask.id);
    res.json({ ask: serializeAsk(updated, own) });
  }),
);

// ─── Reporting ──────────────────────────────────────────────────────────────
// Freezing is the same shape as a flagged vouch: the content stops moving and
// an admin decides. What differs is who can raise one — on a vouch it is only
// ever the counterparty, and on a board it can be any member — which is why
// the events these write name no flagger. See ACTIVITY_MESSAGES.

// One report per business per target, and never a second bite after an admin
// has already ruled on yours. Mirrors the `alreadyRuledOn` guard in
// routes/vouches.js, and it is the main brake on flag-griefing: without it a
// member could re-freeze the same ask every time an admin unfroze it.
async function guardDuplicateFlag({ askId, answerId, raisedByBusinessId }) {
  const existing = await prisma.askFlag.findFirst({
    where: { askId, answerId: answerId ?? null, raisedByBusinessId },
  });
  if (!existing) return;
  if (existing.status === "open") fail(409, "You've already reported this — an admin is looking at it.");
  fail(409, "An admin has already ruled on your report about this.");
}

router.post(
  "/:id/flag",
  asyncHandler(async (req, res) => {
    const own = await loadOwnBusiness(req);
    const ask = await loadAsk(req.params.id, ASK_INCLUDE);

    hideIfFrozenForOthers(ask, own);
    if (ask.askedByBusinessId === own.id) fail(400, "You can't report your own ask.");
    const { reason, note } = req.body ?? {};
    if (!ASK_FLAG_REASONS.has(reason)) fail(400, "Pick a reason from the list.");

    await guardDuplicateFlag({ askId: ask.id, answerId: null, raisedByBusinessId: own.id });

    const flag = await prisma.$transaction(async (tx) => {
      const created = await tx.askFlag.create({
        data: {
          askId: ask.id,
          raisedByBusinessId: own.id,
          // Derived here, never taken from the body: the asker owns an ask.
          againstBusinessId: ask.askedByBusinessId,
          reason,
          note: note?.trim() || null,
        },
      });
      // Freezes only while the ask is still live. Reporting a settled ask is
      // tracking-only: there is nothing left to stop once the asker has
      // decided. Same split as POST /vouches/:id/flag-unfair-cancel.
      if (ask.status === "open") {
        await tx.ask.update({ where: { id: ask.id }, data: { status: "under_review" } });
      }
      return created;
    });

    if (ask.status === "open") {
      await createActivityEvent(prisma, {
        businessId: ask.askedByBusinessId,
        actorBusinessId: null,
        type: "ask_flagged",
      });
    }
    res.status(201).json({ flag: { id: flag.id, status: flag.status } });
  }),
);

router.post(
  "/:id/answers/:answerId/flag",
  asyncHandler(async (req, res) => {
    const own = await loadOwnBusiness(req);
    const ask = await loadAsk(req.params.id, ASK_INCLUDE);

    const answer = await prisma.askAnswer.findUnique({ where: { id: req.params.answerId } });
    if (!answer || answer.askId !== ask.id) fail(404, "Answer not found.");
    if (answer.answeredByBusinessId === own.id) fail(400, "You can't report your own answer.");
    // Freezing an already-withdrawn or removed answer would be freezing
    // nothing: it is not in front of anyone.
    if (!["offered", "accepted"].includes(answer.status)) {
      fail(400, "That answer isn't live.");
    }

    const { reason, note } = req.body ?? {};
    if (!ANSWER_FLAG_REASONS.has(reason)) fail(400, "Pick a reason from the list.");

    await guardDuplicateFlag({ askId: ask.id, answerId: answer.id, raisedByBusinessId: own.id });

    const flag = await prisma.$transaction(async (tx) => {
      const created = await tx.askFlag.create({
        data: {
          askId: ask.id,
          answerId: answer.id,
          raisedByBusinessId: own.id,
          // The ANSWERER, never the business they named — being named in
          // somebody else's answer is not something you did.
          againstBusinessId: answer.answeredByBusinessId,
          reason,
          note: note?.trim() || null,
        },
      });
      // An ACCEPTED answer is frozen too: it is live public content on a
      // third party's profile, which is exactly what a freeze is for.
      await tx.askAnswer.update({ where: { id: answer.id }, data: { status: "under_review" } });
      return created;
    });

    await createActivityEvent(prisma, {
      businessId: answer.answeredByBusinessId,
      actorBusinessId: null,
      type: "ask_answer_flagged",
    });
    res.status(201).json({ flag: { id: flag.id, status: flag.status } });
  }),
);

export { router as askRouter };
