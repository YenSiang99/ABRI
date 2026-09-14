import { Router } from "express";

import { prisma } from "../prisma.js";
import { hashPassword } from "../lib/password.js";
import { matchesBusinessDomain } from "../lib/domainVerification.js";
import { findOrCreateClaimTarget } from "../lib/businessClaim.js";
import { serializeAccount } from "../lib/serialize.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sendVerificationEmail } from "../lib/mailer.js";
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { messageFor, pruneActivityEvents } from "../lib/activityEvents.js";
import { vouchLevelFor } from "../lib/vouchLevel.js";
import { publicBusinessView } from "../lib/accountView.js";
import { can } from "../lib/entitlements.js";
import { contactVisibility } from "../lib/contactVisibility.js";
import { normalizeBusinessEdit } from "../lib/contactFields.js";
import { isValidCategory, isValidLocation } from "../lib/businessVocab.js";
import { serviceCatalogueFor, canonicalService } from "../lib/serviceVocab.js";
import { loadAccountView } from "../lib/accountView.js";
import { UNCLAIMED, CLAIMED } from "../lib/verificationLevels.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { vouchersInNetworkFor } from "../lib/networkOverlap.js";
import { recordChecks } from "../lib/businessCheck.js";
import { recordProfileView } from "../lib/profileView.js";
import { verificationTimelineFor } from "../lib/verificationTimeline.js";
import { confirmedEngagementsFor, engagementSummaryFor, serializeEngagement } from "../lib/engagements.js";
import {
  LOOKUP_LIMIT,
  MIN_QUERY_LENGTH,
  lookupWhere,
  matchReasonFor,
  normalizeSsm,
  rankMatches,
  standingFor,
} from "../lib/businessLookup.js";

const router = Router();

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const CLAIM_TOKEN_TTL_MS = 15 * 60 * 1000;

// Validates the "connect me to this business once I'm in" hint that rides
// along with a claim submitted off a card tap. Returns the id if it's still
// worth acting on, or null — never throws, because every way this can fail
// is somebody else's stale link, not a problem with the claim being made.
async function resolveConnectTarget(connectTargetId, claimedBusinessId) {
  if (!connectTargetId || connectTargetId === claimedBusinessId) return null;
  const target = await prisma.business.findUnique({ where: { id: connectTargetId } });
  // T0 means unclaimed, and POST /connections refuses those too — no point
  // queueing an intent that would be dropped on the way out.
  if (!target || target.verificationLevel === UNCLAIMED) return null;
  return target.id;
}

// The VIEWER's own business row, or null.
//
// optionalAuth puts an Account on the request, and an Account carries no
// membershipTier — the tier lives on the Business. Every viewer-side gate
// therefore needs this one extra read, and it only happens for a logged-in
// caller: an anonymous request never touches the database for it.
//
// Returns null rather than throwing for an account with no business (an admin
// legitimately has none), so callers can treat "no viewer business" and "not
// logged in" as the same thing — which for these gates they are.
async function loadViewerBusiness(req) {
  if (!req.account?.businessId) return null;
  return prisma.business.findUnique({
    where: { id: req.account.businessId },
    // privateBrowsing rides along because GET /:id needs it on the same read
    // that the gates need membershipTier — fetching it separately would be a
    // second query on the most-hit route in the app.
    select: { id: true, membershipTier: true, privateBrowsing: true },
  });
}

// The vouch numbers, or nothing.
//
// THE ONE RUNG BETWEEN A STRANGER AND A MEMBER, and it is deliberately the
// only thing on that rung. An anonymous visitor still gets the verification
// level everywhere — that is the honest answer to "are they real", it is the
// whole promise of the check-a-business screen, and "verification cannot be
// bought" means it is never for sale or for trade. What a free account buys
// is the DEPTH: how many peers have staked their reputation on this business.
//
// Absent keys, never zeros. A withheld count and a genuine zero must not
// render the same — BusinessCard has three strings for three states, and a
// zeroed-out withheld count would show "No vouches yet" about a business with
// forty. Same rule the contact gate follows: the key is missing, not masked.
//
// Shared by both routes so the directory and the lookup cannot disagree about
// what a stranger is worth showing.
function vouchFieldsFor(counts, viewer) {
  if (!viewer) return {};
  return {
    vouchCount: counts.vouchesReceived,
    vouchLevel: vouchLevelFor({
      received: counts.vouchesReceived,
      given: counts.vouchesGiven,
    }),
  };
}

// Directory paging. A page size a browse screen can render, and a hard cap so
// a caller cannot ask for the whole table by setting limit=100000 — which is
// what this route did on every request before it had one.
const DIRECTORY_PAGE_SIZE = 24;
const DIRECTORY_MAX_PAGE_SIZE = 50;

// The directory: browse, filter, act.
//
// optionalAuth is NEW, and so is paging. This route used to have no auth
// middleware at all and no take/skip/cursor, which meant one unauthenticated
// request returned the entire member list — 34 rows of 16 fields today, and
// the whole trust graph in a single call at any size worth having. It is the
// asset the product sells, and it was a `curl` away.
//
// It now matches registration numbers and domains too, via the same builder
// the lookup uses. See lib/businessLookup.js for why that clause is shared
// now when this file previously argued it must not be: a logged-in member had
// ended up with two search boxes, and one box has to answer both questions.
router.get(
  "/",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { search, verificationLevel, service } = req.query;
    // Only meaningful alongside `service` — there is no such thing as being
    // confirmed in general, only confirmed for something.
    const confirmedOnly = req.query.confirmedOnly === "true";

    // Canonicalised, not trusted. A member typing "ssm filings" into a URL
    // means the catalogue entry "SSM filings", and `has` is an exact array
    // match — so an uncanonicalised value would silently return nothing and
    // read as "no business does this" rather than "you typed it differently".
    // That is the same silent miss lib/serviceVocab.js exists to remove.
    //
    // An unknown service is a 400 rather than an empty list, for the reason
    // the comment below gives about silent filters: "no results" and "your
    // filter was nonsense" must not look the same.
    let canonicalServiceFilter = null;
    if (service) {
      canonicalServiceFilter = canonicalService(service);
      if (!canonicalServiceFilter) {
        return res.status(400).json({ error: `"${service}" isn't a service in the catalogue.` });
      }
    }

    // Clamped, not honoured. A limit is a courtesy to the client; the cap is
    // the thing that actually bounds the response.
    const limit = Math.min(
      Number(req.query.limit) || DIRECTORY_PAGE_SIZE,
      DIRECTORY_MAX_PAGE_SIZE,
    );
    const page = Math.max(Number(req.query.page) || 1, 1);

    const where = {
      // NOTE: an unrecognised query key is simply NO FILTER here, not a
      // 400 — so a client and server that disagree about this param name
      // fail silently and wide. That is not hypothetical: Register.jsx
      // filters on UNCLAIMED to find claimable listings, and a dropped
      // filter there offers already-claimed businesses for claiming.
      // Renaming this param means renaming lib/api/businesses.js in the
      // same commit.
      ...(verificationLevel ? { verificationLevel } : {}),
      // `has`, not `contains`: services is a String[] and this is an exact
      // whole-element match against a canonical value. Substring matching here
      // would let "Tax" match "Tax advisory" AND "Transfer pricing
      // documentation" if the catalogue ever grows a service containing the
      // word, which is the back door into free text that businessVocab.js
      // warns against.
      ...(canonicalServiceFilter ? { services: { has: canonicalServiceFilter } } : {}),
      // includeCategory: browsing "Accounting" must return every accountant.
      // That is the one thing this route matches on and the lookup does not.
      ...(search ? lookupWhere(search, { includeCategory: true }) : {}),
    };

    const BUSINESS_INCLUDE = {
      _count: {
        select: {
          vouchesReceived: { where: { status: "published" } },
          // Needed for the top vouch level, which is 25 received AND 10
          // given. Counting only one direction caps every business at
          // "trusted" with nothing to show it happened.
          vouchesGiven: { where: { status: "published" } },
        },
      },
    };

    // RANKED BY EVIDENCE WHEN A SERVICE IS NAMED, and this is the query the
    // whole service + engagement design exists to make answerable: not "who
    // says they do company incorporation" but "who has had it CONFIRMED, and
    // by how many different businesses".
    //
    // DISTINCT COUNTERPARTIES, NOT ROWS — the same rule engagementSummaryFor
    // applies, and for the same reason. Ranking on row count would put a
    // business with ten engagements from one friendly counterparty above one
    // with three from three different firms, which inverts the signal.
    //
    // AGGREGATED BEFORE PAGING, which is why this branch exists at all rather
    // than sorting the page after fetching it. A rank computed per page is not
    // a rank: the best-evidenced business on page two would sort above the
    // worst on page one and appear second. The id-only first query is what
    // keeps that affordable — it reads one column for the businesses that
    // already passed every other filter, and the service filter is the
    // narrowing one.
    let rows;
    let hasMore;
    let confirmedByBusiness = new Map();

    if (canonicalServiceFilter) {
      const candidates = await prisma.business.findMany({ where, select: { id: true } });
      const candidateIds = candidates.map((c) => c.id);

      const engagements = await prisma.engagement.findMany({
        where: {
          status: "confirmed",
          service: canonicalServiceFilter,
          OR: [{ businessAId: { in: candidateIds } }, { businessBId: { in: candidateIds } }],
        },
        select: { businessAId: true, businessBId: true },
      });

      // An engagement touches two businesses and only one of them is the
      // candidate for any given row — which end, depends on the id ordering
      // the pair is stored under, so both are checked.
      const counterparties = new Map(candidateIds.map((id) => [id, new Set()]));
      for (const e of engagements) {
        if (counterparties.has(e.businessAId)) counterparties.get(e.businessAId).add(e.businessBId);
        if (counterparties.has(e.businessBId)) counterparties.get(e.businessBId).add(e.businessAId);
      }
      confirmedByBusiness = new Map(
        [...counterparties].map(([id, set]) => [id, set.size]),
      );

      let ordered = candidateIds
        .map((id) => ({ id, confirmed: confirmedByBusiness.get(id) ?? 0 }))
        // Name is the tiebreak so the order is stable across pages and reloads
        // — without it Postgres may hand back equal-ranked rows in any order
        // and a member reloading sees them shuffle.
        .sort((a, b) => b.confirmed - a.confirmed || a.id.localeCompare(b.id));

      // The sharp version of this query: only businesses somebody has actually
      // confirmed for this service. Off by default — a directory that hides
      // every business without engagements would be empty today and would
      // punish new members for being new.
      if (confirmedOnly) ordered = ordered.filter((o) => o.confirmed > 0);

      const pageIds = ordered.slice((page - 1) * limit, page * limit + 1);
      hasMore = pageIds.length > limit;
      const idsForPage = (hasMore ? pageIds.slice(0, limit) : pageIds).map((o) => o.id);

      const fetched = await prisma.business.findMany({
        where: { id: { in: idsForPage } },
        include: BUSINESS_INCLUDE,
      });
      // findMany does not preserve the order of an `in` list, and the order is
      // the entire point of this branch.
      const byId = new Map(fetched.map((b) => [b.id, b]));
      rows = idsForPage.map((id) => byId.get(id)).filter(Boolean);
    } else {
      const fetched = await prisma.business.findMany({
        where,
        include: BUSINESS_INCLUDE,
        orderBy: { name: "asc" },
        skip: (page - 1) * limit,
        // Over-fetch by one to learn whether there is a next page, rather than
        // running a second count query against the same predicate.
        take: limit + 1,
      });
      hasMore = fetched.length > limit;
      rows = hasMore ? fetched.slice(0, limit) : fetched;
    }

    const businesses = rows;

    // Plus, and asked about the VIEWER's own business rather than the ones
    // being listed — the first gate in this file that runs that direction.
    // See the "viewer-side gates" block in lib/entitlements.js for why that
    // is allowed here when line 55 of the checklist forbids it for contact
    // details: this adds something a stranger never had, rather than taking
    // away something a seller paid to publish.
    //
    // ONE query for the whole page, not one per card. Fifty cards asking
    // separately is fifty round trips on a screen that has to feel instant.
    const viewer = await loadViewerBusiness(req);
    const overlap =
      viewer && can(viewer, "networkOverlap")
        ? await vouchersInNetworkFor(businesses.map((b) => b.id), viewer.id)
        : new Map();

    res.json({
      // Contact details are stripped UNCONDITIONALLY here, and that survived
      // the ladder deliberately.
      //
      // "Members see more" could have meant putting phone numbers on
      // directory cards, and it must not: BusinessCard.jsx renders
      // name/category/location/level/vouches and has nowhere to put a phone
      // number, so shipping one would send every listing's contact details to
      // every session to serve a card that does not display them. That is the
      // best scraping surface in the app, built for nothing. Contact stays on
      // the profile route, where it is rendered and already gated.
      //
      // The trade-off, stated so it can be revisited deliberately: a future
      // "call" button on directory cards is a change to THIS route, and that
      // is the right moment to decide whether the gated surface should grow
      // past the single profile route it occupies today.
      businesses: businesses.map(({ _count, ...business }) => ({
        ...publicBusinessView(business),
        // Absent for an anonymous caller — see vouchFieldsFor.
        ...vouchFieldsFor(_count, req.account),
        // Why this row came back. Cheap here, and it is what lets the in-app
        // directory tell "your registration number matched" from "the name
        // contains what you typed" — the distinction that used to require a
        // second screen.
        ...(search ? { matchReason: matchReasonFor(business, search) } : {}),
        // Absent unless there IS an overlap, so a Plus member browsing
        // strangers gets no empty arrays and the client can render on
        // presence. A Free member never gets the key at all.
        ...(overlap.has(business.id) ? { vouchersInYourNetwork: overlap.get(business.id) } : {}),
        // Present only while a service filter is active, and ZERO IS SENT
        // rather than omitted: "nobody has confirmed this yet" is a real
        // answer on a screen that has just ranked by it, and leaving the key
        // off would make it indistinguishable from a client that forgot to
        // ask. Absent entirely without the filter, where it would mean
        // nothing.
        ...(canonicalServiceFilter
          ? {
              confirmedForService: {
                service: canonicalServiceFilter,
                counterparties: confirmedByBusiness.get(business.id) ?? 0,
              },
            }
          : {}),
      })),
      page,
      hasMore,
    });
  }),
);

// ─── Check a business ───────────────────────────────────────────────────────
//
// "Is this business real, verified, and vouched for?" — one pasted string in,
// a short ranked list out. See lib/businessLookup.js for why this is a
// separate route from the directory search above rather than a wider OR.
//
// DECLARED ABOVE GET /:id, AND IT HAS TO BE. Express matches in order, so
// with these swapped every request for /businesses/lookup would arrive at the
// :id handler as a business whose id is the literal string "lookup" and
// answer 404. The same collision routes/follows.js documents between GET
// /followers and DELETE /:businessId — it is only safe there because the two
// use different verbs, which is not true here.
//
// PUBLIC, and that is the feature rather than an oversight. The invite this
// screen produces is an unsolicited message with a link in it, which is
// exactly the shape of a scam — a trust network whose invite cannot be
// verified without first joining is self-defeating. So the recipient can
// check the sender before acting.
//
// It exposes nothing GET /businesses did not already: that route is
// unauthenticated, unpaginated, and has always returned ssm, domain, website
// and address for every row. What this adds is a better question, not a wider
// answer — and the one thing it does add over that route, contact details for
// a logged-in member, is decided by contactVisibility exactly as the profile
// route decides it.
//
// THE COPY RULE, restated here because this is the route that would break it:
// no result on this endpoint is EVER a claim about the real world. ABRI has
// no registry access. An empty match list means "no record on ABRI" and the
// client must not render it as anything stronger.
// The service catalogue an owner picks from, for their own category.
//
// SERVED RATHER THAN MIRRORED, unlike lib/businessVocab.js, whose frontend copy
// is a flat array that a human keeps in step. This list is ten times the size
// and will grow on a different schedule from a release, and a stale copy here
// does not fail loudly — it just quietly offers fewer canonical services than
// the server will accept, which is the same silent miss the catalogue exists to
// remove.
//
// Declared BEFORE /:id or Express reads "service-catalogue" as a business id —
// the same collision routes/asks.js documents for /mine.
//
// optionalAuth, not requireAuth: the register form needs this too, and there is
// nothing private in a list of service names.
router.get(
  "/service-catalogue",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const category = req.query.category;
    if (category && !isValidCategory(category)) {
      return res.status(400).json({ error: "Unknown category." });
    }
    res.json(serviceCatalogueFor(category ?? null));
  }),
);

router.get(
  "/lookup",
  optionalAuth,
  rateLimit({
    // Generous for a person, tight for a script. A member checking a
    // counterparty runs one or two of these and reads the answer; thirty in a
    // minute from one address is an enumeration of the directory.
    windowMs: 60 * 1000,
    max: 30,
    message: "Too many lookups. Wait a minute and try again.",
  }),
  asyncHandler(async (req, res) => {
    const query = String(req.query.q ?? "").trim();

    // A short query is answered, not rejected: the client types into this
    // field character by character, and a 400 mid-word would render as an
    // error under the box the member is still using. An empty match list is
    // the same shape the real miss has, so the UI needs no third state.
    if (query.length < MIN_QUERY_LENGTH) {
      return res.json({ query, matches: [] });
    }

    const viewer = await loadViewerBusiness(req);
    const businesses = await prisma.business.findMany({
      where: lookupWhere(query),
      include: {
        _count: {
          select: {
            vouchesReceived: { where: { status: "published" } },
            vouchesGiven: { where: { status: "published" } },
          },
        },
      },
      // Over-fetch, then rank, then slice — NOT `take: LOOKUP_LIMIT`.
      //
      // Capping in the query would make the limit a correctness cliff rather
      // than a presentation one: Postgres returns rows in whatever order it
      // likes, so a query matching one business by its registration number
      // and nine by name could return the nine and drop the one. Pasting a
      // number and being told "no record" because other businesses share a
      // word is the single worst thing this screen could do.
      //
      // A small multiple is enough to make that unreachable in practice while
      // still bounding the work on a public route.
      take: LOOKUP_LIMIT * 4,
    });

    const ranked = rankMatches(businesses, query).slice(0, LOOKUP_LIMIT);

    const overlap =
      viewer && can(viewer, "networkOverlap")
        ? await vouchersInNetworkFor(ranked.map((m) => m.business.id), viewer.id)
        : new Map();

    // Pro's check history. ONE OF TWO WRITE SITES — GET /:id records a profile
    // open the same way, because the directory folds the check screen in and a
    // member who browses straight to a business has still checked it. Keep the
    // two in step: a rule that holds here (session-keyed, self-view excluded,
    // Pro only) has to hold there, or the log's meaning depends on which route
    // the member happened to arrive through.
    //
    // Only for a member who can read it back — see lib/businessCheck.js on why
    // logging a Free member's searches to sell them the log later is the wrong
    // trade.
    //
    // Awaited so a failure surfaces rather than becoming an unhandled
    // rejection, but it writes nothing that the response depends on.
    if (viewer && can(viewer, "checkHistory")) {
      await recordChecks(viewer.id, ranked.map((m) => m.business));
    }

    res.json({
      query,
      matches: ranked.map(({ business, reason }) => {
        const { _count, ...row } = business;
        // Per row, off the RAW record, for the reason GET /:id states twice:
        // publicBusinessView strips membershipTier, so a gate computed after
        // it sees every business as free and withholds from everyone.
        const contact = contactVisibility(row, req.account);
        return {
          ...publicBusinessView(row, { showContact: contact.visible }),
          // Why this row came back, so the card can say "the registration
          // number matched" rather than presenting a loose name match with
          // the same confidence.
          matchReason: reason,
          // "listed" or "unclaimed" — resolved server-side so no client
          // re-derives it from verificationLevel and gets the L0 case wrong.
          standing: standingFor(row),
          // Absent for an anonymous caller, exactly as on the directory —
          // one helper so the two surfaces cannot disagree about what a
          // stranger is worth showing. The verification level above is NOT
          // gated and never will be: it is the answer this screen promises.
          ...vouchFieldsFor(_count, req.account),
          contactLocked: !contact.visible,
          contactLockedReason: contact.reason,
          // Plus. Absent when there is no overlap or the viewer is below
          // Plus, so the client renders on presence rather than on a count.
          ...(overlap.has(row.id) ? { vouchersInYourNetwork: overlap.get(row.id) } : {}),
        };
      }),
    });
  }),
);

// optionalAuth, not requireAuth: this is a public route — it serves both the
// profile page and the NFC tap page (/m/:businessId resolves through it) — but
// it withholds contact details from anonymous visitors, so it has to be able
// to tell an anonymous visitor from a logged-in member. req.account is null
// rather than undefined here, and must be read as req.account?.something.
router.get(
  "/:id",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const business = await prisma.business.findUnique({
      where: { id: req.params.id },
      include: {
        // Public profile — only ever show vouches the receiver has
        // actually accepted (see the Vouch review state machine in
        // schema.prisma). This route returns the raw business object
        // (not through serializeBusiness), so the filter has to happen
        // here rather than being inherited from a shared helper.
        vouchesReceived: {
          where: { status: "published" },
          include: {
            fromBusiness: { select: { id: true, name: true, category: true, verificationLevel: true } },
            currentRevision: { select: { comment: true } },
          },
        },
      },
    });
    if (!business) return res.status(404).json({ error: "Business not found." });

    // Read the plan off the RAW row: publicBusinessView strips
    // membershipTier, so asking can() about its output denies everything.
    const showTestimonials = can(business, "testimonials");

    // The check history's SECOND write site, and the one that matches how the
    // product is actually used. /businesses/lookup was the only one, which
    // assumed checking was a separate errand on a separate screen; the
    // directory folds that screen in, so opening a profile IS the check. A
    // member who browses to a business and reads its vouches has done the
    // diligence the log exists to record, and leaving it unrecorded made the
    // history look broken rather than principled.
    //
    // STILL THE MEMBER'S OWN LOG. recordChecks is keyed off the viewer's
    // session id exactly as it is in lookup — this widens WHEN a row is
    // written, never who may read one. The direction rule in
    // lib/businessCheck.js is untouched: nothing here can answer "who has
    // been checking me?".
    //
    // Self-views are excluded. Opening your own profile is not diligence, and
    // a history whose top entry is always yourself buries the rows that
    // matter. The dedupe window in lib/businessCheck.js handles the rest: a
    // member who opens the same profile six times in a day gets one row whose
    // timestamp and levelAtCheck move to the latest look.
    //
    // Awaited for the reason lookup states — a failure should surface rather
    // than become an unhandled rejection — and nothing in the response
    // depends on it.
    const viewer = await loadViewerBusiness(req);
    if (viewer && viewer.id !== business.id) {
      // TWO ROWS, ONE PAGE OPEN, AND THEY ARE NOT DUPLICATES. The check
      // belongs to the viewer and is written only if they can read it back;
      // the view belongs to the business being looked at and is written
      // whatever the viewer pays. lib/profileView.js has the long version —
      // the short one is that gating this second write on the viewer's tier
      // would make every viewer count in the product an undercount.
      if (can(viewer, "checkHistory")) {
        await recordChecks(viewer.id, [business]);
      }
      // The viewer's own setting decides whether this view carries their name.
      // Read off the viewer, never the viewed: the business being looked at
      // has no say in whether its visitors are identified, which is the point.
      await recordProfileView(business.id, viewer.id, {
        anonymous: viewer.privateBrowsing === true,
      });
    }

    // Deliberately adjacent to the line above, and for the same reason: this
    // reads the plan off the RAW row too. publicBusinessView strips
    // membershipTier, so a gate computed after it would see every business as
    // free and withhold from everyone.
    const contact = contactVisibility(business, req.account);

    // Sent explicitly rather than left for the client to infer from
    // vouchesReceived.length, which is what it used to do in three places.
    // The moment the array can be withheld, its length stops meaning "how
    // many vouches" — and the count is the half of this that every plan
    // keeps, so it must not travel inside the half that gets taken away.
    const vouchCount = business.vouchesReceived.length;

    // PUBLIC ON EVERY PLAN AND TO ANONYMOUS VISITORS, deliberately, and the
    // only part of this response that is. Everything else here is gated on
    // somebody's plan; this is a factual record of what a registry said and
    // when, and gating it would mean selling the ability to find out that a
    // business's verification lapsed. That is the one fact this product exists
    // to surface — see lib/verificationTimeline.js.
    const verificationTimeline = await verificationTimelineFor(prisma, business);

    // The other half of the audit record, and public on the same terms and for
    // the same reason. A confirmed engagement is a fact two businesses agreed
    // on; gating it would mean selling the ability to find out who a business
    // has actually worked with, which is the question this product exists to
    // answer. Confirmed only — see the status comment on the model.
    const [engagementRows, engagementSummary] = await Promise.all([
      confirmedEngagementsFor(business.id),
      engagementSummaryFor(business.id),
    ]);

    // Flatten the live revision's text onto each vouch as `testimonial`.
    // The column of that name is gone (schema.prisma) — it was the copy a
    // revise overwrote — but the public shape is unchanged, so nothing
    // downstream needs to know a join happened.
    //
    // Withheld as an empty array rather than rows with `testimonial: null`:
    // the free tier shows a number and nothing else, and keeping the rows
    // would still publish who vouched and when.
    res.json({
      business: {
        ...publicBusinessView(business, { showContact: contact.visible }),
        vouchCount,
        verificationTimeline,
        // viewerBusinessId is null: this is the PUBLIC view, so no
        // `counterparty` is resolved and no proposedByYou is claimed. A reader
        // sees both ends named and works out for themselves which is which.
        engagements: engagementRows.map((e) => serializeEngagement(e, null)),
        engagementSummary,
        testimonialsLocked: !showTestimonials,
        // Withheld the same way testimonials are — the keys are absent, not
        // null, so there is no masked value on the wire to un-mask.
        //
        // Both a boolean AND a reason. The boolean keeps the client's check
        // as `if (contactLocked)`, the same idiom as testimonialsLocked right
        // above it. The reason exists because the two locked states are
        // different messages: "owner_plan" is something the viewer can do
        // nothing about, while "viewer_anonymous" names a free action they
        // can take. With only a boolean the client's sole inference would be
        // "am I logged in?", which would render "log in to see this" on a
        // free owner's page too — promising something logging in does not
        // deliver.
        //
        // Note contactLocked false with all three fields null means the owner
        // hasn't added any. Withheld and empty must not render the same.
        contactLocked: !contact.visible,
        contactLockedReason: contact.reason,
        vouchesReceived: showTestimonials
          ? business.vouchesReceived.map(({ currentRevision, ...v }) => ({
              ...v,
              testimonial: currentRevision?.comment ?? null,
            }))
          : [],
      },
    });
  }),
);

// Powers Dashboard.jsx's "Recent activity" — the notify step of the
// give-first reciprocity loop (vouch -> notify -> thank -> vouch back).
// Two segments ("/me/activity"), so this never collides with GET /:id
// above, which only matches a single path segment.
router.get(
  "/me/activity",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.account.businessId) return res.json({ activity: [] });

    const events = await prisma.activityEvent.findMany({
      where: { businessId: req.account.businessId },
      include: { actorBusiness: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    res.json({
      activity: events.map((e) => ({
        id: e.id,
        type: e.type,
        actorId: e.actorBusinessId,
        actorName: e.actorBusiness?.name ?? null,
        message: messageFor(e.type, e.actorBusiness?.name),
        date: e.createdAt,
        // Sent so the feed can mark which lines are new. Deliberately not
        // consumed here: reading the feed doesn't clear it, POST
        // /me/activity/read does. Otherwise the response that renders the
        // "new" highlights would be the same one that erases them.
        read: e.readAt !== null,
      })),
    });

    // Trim this business's backlog to the retention cap, after responding —
    // pruning is housekeeping, so it must never add latency to the feed or
    // fail the request. A no-op whenever the business is under the cap.
    // Runs here rather than in createActivityEvent so the delete stays off
    // the vouch write transactions; the tradeoff is that a business nobody
    // ever logs into never gets pruned (see PRUNING note in BACKEND_STATUS.md).
    pruneActivityEvents(prisma, req.account.businessId).catch(() => {});
  }),
);

// The sidebar badge. Split from GET /me/activity because the sidebar renders
// on every /app/* page and only needs the number — pulling 20 rows and their
// actor joins to derive it would make the count the most expensive thing on
// pages that don't show the feed at all.
router.get(
  "/me/activity/unread-count",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.account.businessId) return res.json({ unread: 0 });

    const unread = await prisma.activityEvent.count({
      where: { businessId: req.account.businessId, readAt: null },
    });

    res.json({ unread });
  }),
);

// Marks everything currently unread as seen — the "Mark all read" escape
// hatch for events the member has no reason to open (a vouch that was
// cancelled, a connection they already know about). Opening a notification
// is what normally clears it; see POST /me/activity/:id/read below.
//
// `readAt: null` in the filter rather than blanket-updating the business's
// rows keeps this idempotent and cheap — a second call matches nothing and
// preserves the original timestamps.
router.post(
  "/me/activity/read",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.account.businessId) return res.json({ marked: 0 });

    const { count } = await prisma.activityEvent.updateMany({
      where: { businessId: req.account.businessId, readAt: null },
      data: { readAt: new Date() },
    });

    res.json({ marked: count });
  }),
);

// Marks one event read, which is what opening a notification does. Kept
// separate from the bulk route above because they answer different questions:
// this one means "I dealt with this", the other means "stop showing me these".
//
// updateMany rather than update-by-id so the businessId filter is part of the
// write itself — a member passing someone else's event id matches zero rows
// and gets `{ marked: 0 }`, rather than a 404 that would confirm the id
// exists, or worse a successful write on a feed that isn't theirs.
router.post(
  "/me/activity/:id/read",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.account.businessId) return res.json({ marked: 0 });

    const { count } = await prisma.activityEvent.updateMany({
      where: { id: req.params.id, businessId: req.account.businessId, readAt: null },
      data: { readAt: new Date() },
    });

    res.json({ marked: count });
  }),
);

// The owner edits their own business. Everything the profile page can change
// goes through here.
//
// "/me" rather than "/:id" so that "you can only edit your own business" is
// structural instead of a check that can be got wrong: the target comes from
// the session, so there is no id to compare against and no way to pass someone
// else's. Same reasoning as the /me/activity routes above. No collision with
// GET /:id — different verb — but if a PATCH /:id is ever added it has to be
// declared AFTER this one.
//
// Replaces a write that never reached the server: the Edit-profile dialog used
// to call updateBusinessProfile() from frontend/src/lib/store/businesses.js,
// which put description and services into localStorage that nothing read back.
// It toasted "Profile updated" and changed nothing.
router.patch(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.account.businessId) {
      return res.status(403).json({ error: "Your account isn't attached to a business yet." });
    }

    // LOAD-BEARING, and it will look redundant — read this before deleting it.
    //
    // Account.businessId is set for PENDING claimants too: POST /claim's
    // manual-review branch (below) creates the account with businessId already
    // populated and claimStatus "pending". So "has a businessId" is NOT "owns
    // this business".
    //
    // Today nothing can reach this line with a pending claim, because that
    // same branch sets emailVerified false and POST /auth/login refuses to
    // start a session for an unverified account. That invariant lives in a
    // different file, which is exactly why this check is here and not assumed:
    // if login ever loosens by a line — say, to let a claimant in to watch
    // their own claim — its absence is a stranger publishing contact details
    // on a business they merely applied for.
    if (req.account.claimStatus !== "approved") {
      return res.status(403).json({ error: "Your claim on this business hasn't been approved yet." });
    }

    const { data, error } = normalizeBusinessEdit(req.body);
    if (error) return res.status(400).json({ error });

    await prisma.business.update({
      where: { id: req.account.businessId },
      data,
    });

    // Same shape as GET /auth/me, so the client re-uses refreshAccount() and
    // there is no second response shape to keep in step. loadAccountView is
    // already described as the single source of truth for what a logged-in
    // account gets back.
    res.json(await loadAccountView(req.account.id));
  }),
);

// Submit an SSM registration number for review — the step
// ABRI-feature-checklist.md §2 records as missing ("the status screen exists;
// there's no way to submit and no admin queue"). Until this existed, L2 was a
// badge an admin flipped by hand with no number behind it, and Business.ssm
// was null on every row in the database.
//
// A SEPARATE ROUTE RATHER THAN LIFTING `ssm` OUT OF PROTECTED_FIELDS. It stays
// protected in lib/contactFields.js, so PATCH /me still cannot touch it. The
// difference matters: description and services are the owner's to rewrite at
// will, and a registration number is a claim an admin has ruled on. Making it
// editable through the same door would let a business get verified on one
// number and quietly display another.
//
// PENDING IS DERIVED, NOT STORED. There is no ssmStatus column:
//
//   ssm == null && level L1  — nothing submitted
//   ssm != null && level L1  — submitted, waiting on an admin
//   level L2                 — approved; the number is what was verified
//
// A status column would be a second copy of a fact verificationLevel already
// carries, and the disagreeing case — "approved" beside L1 — is precisely the
// one that would show a badge nobody granted.
router.post(
  "/me/ssm",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.account.businessId) {
      return res.status(403).json({ error: "Your account isn't attached to a business yet." });
    }
    // The same load-bearing check PATCH /me carries — see its comment. A
    // pending claimant has a businessId and does not own the business.
    if (req.account.claimStatus !== "approved") {
      return res.status(403).json({ error: "Your claim on this business hasn't been approved yet." });
    }

    const business = await prisma.business.findUnique({ where: { id: req.account.businessId } });
    if (!business) {
      return res.status(403).json({ error: "Your account isn't attached to a business yet." });
    }

    // L1 only, in both directions. An L0 has no owner and cannot reach this
    // route anyway; an L2-and-above has already been verified against a
    // number, and letting them overwrite it is the exact hole the
    // PROTECTED_FIELDS note above describes. Correcting a wrong number after
    // approval is an admin action (revoke, then resubmit), because somebody
    // has to look at the new one.
    if (business.verificationLevel !== CLAIMED) {
      return res.status(400).json({
        error:
          business.verificationLevel === UNCLAIMED
            ? "Claim this business before submitting its registration number."
            : "This business is already verified. Ask an admin to change its registration number.",
      });
    }

    const ssm = String(req.body?.ssm ?? "").trim();
    // Length bounds only — NO FORMAT CHECK, and that is deliberate. SSM
    // numbers exist in at least three shapes (the 12-digit post-2016 form,
    // the old "1234567-A", and letterheads carrying both), this column has
    // never had a format contract, and a regex here would reject real numbers
    // in order to enforce a rule invented in this file. An admin reads the
    // number against the register; that IS the validation. See normalizeSsm
    // in lib/businessLookup.js, which handles the shapes rather than judging
    // them.
    if (ssm.length < 4 || ssm.length > 60) {
      return res.status(400).json({ error: "Enter the registration number as it appears on your SSM documents." });
    }

    // BOTH columns, always. ssmNormalized is what the lookup matches on and
    // `ssm` is what an admin reads; a write that sets one without the other
    // is a business that cannot be found by its own number. normalizeSsm is
    // the single definition of that key — see the ssmNormalized comment in
    // schema.prisma.
    await prisma.business.update({
      where: { id: business.id },
      data: { ssm, ssmNormalized: normalizeSsm(ssm) },
    });

    // No activity event. Nothing happened TO this member that they don't
    // already know — they pressed the button — and lib/activityEvents.js's
    // rule is that events go to the party who didn't act. The approval and
    // the rejection both fire one, because those arrive from somebody else.
    res.json(await loadAccountView(req.account.id));
  }),
);

// Scope note: this only covers submission. It always ends in one of two
// states — a token waiting to be opened (domain match), or a pending
// account waiting on an admin (no domain match) — never an immediate
// login. Multiple accounts can hold pending claims on the same business
// at once (see schema.prisma) — this only rejects a claim outright once
// the business already has an approved owner.
router.post(
  "/claim",
  asyncHandler(async (req, res) => {
    const {
      businessId,
      businessName,
      category,
      location,
      ssm,
      repName,
      repEmail,
      repPhone,
      repRole,
      password,
      connectTargetId,
    } = req.body ?? {};

    if (!businessName?.trim() || !category?.trim() || !location?.trim()) {
      return res.status(400).json({ error: "Business name, category, and location are required." });
    }
    // Both are closed lists (lib/businessVocab.js), and this is the only route
    // that writes them. Checked on the server rather than trusted from the
    // form, because the Asks board routes work by joining these two columns on
    // equality — a value that isn't in the list is a business no ask can ever
    // reach, and nothing about that failure is visible to them.
    if (!isValidCategory(category.trim())) {
      return res.status(400).json({ error: "Pick a category from the list." });
    }
    if (!isValidLocation(location.trim())) {
      return res.status(400).json({ error: "Pick a location from the list." });
    }
    if (!repEmail || !EMAIL_RE.test(repEmail)) {
      return res.status(400).json({ error: "Enter a valid email." });
    }
    if (!repName?.trim() || !repPhone?.trim() || !repRole?.trim()) {
      return res.status(400).json({ error: "Your name, phone, and role are required." });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }

    const existingAccount = await prisma.account.findUnique({ where: { email: repEmail } });
    if (existingAccount) {
      return res.status(409).json({ error: "An account with this email already exists — log in instead." });
    }

    // Resolve the business's known domain BEFORE creating/mutating
    // anything — a manually-registered business has none (always manual
    // review); an existing listing might. Only rejected here if it's
    // already fully claimed — a listing with other pending claims on it
    // is still fair game (see findOrCreateClaimTarget for why).
    let knownDomain = null;
    if (businessId) {
      const existingBusiness = await prisma.business.findUnique({ where: { id: businessId } });
      if (!existingBusiness) {
        return res.status(400).json({ error: "This listing isn't available to claim." });
      }
      const alreadyApproved = await prisma.account.findFirst({
        where: { businessId, claimStatus: "approved" },
      });
      if (alreadyApproved) {
        return res.status(400).json({ error: "This business has already been claimed." });
      }
      knownDomain = existingBusiness.domain;
    }

    // Someone who tapped a card while logged out arrives here with the
    // tapped business in tow (/register?connect=<id>), and expects to be
    // connected to it once they're in. That can't happen now — neither the
    // account nor the approval exists yet — so the intent is parked and
    // consumed at their first session (see lib/session.js).
    //
    // Resolved best-effort and dropped silently if it doesn't hold up: a
    // stale or hand-edited query param is not a reason to block somebody
    // from registering their business.
    const connectTarget = await resolveConnectTarget(connectTargetId, businessId);

    const passwordHash = await hashPassword(password);
    const claimPayload = {
      businessId,
      businessName,
      category,
      location,
      ssm,
      repName,
      repEmail,
      repPhone,
      repRole,
      passwordHash,
      // Carried through the token rather than a DeferredConnection row: on
      // this path there is no account to hang one off yet. verify-claim
      // turns it into a row moments before startSession consumes it.
      connectTargetId: connectTarget,
    };

    if (matchesBusinessDomain(repEmail, knownDomain)) {
      // Nothing is created yet — consuming the link (POST
      // /auth/verify-claim/:token) is what creates the account/business
      // and auto-approves + logs in. Also returned directly below (handy
      // for local dev when RESEND_API_KEY isn't set — see lib/mailer.js).
      const record = await prisma.emailVerificationToken.create({
        data: {
          email: repEmail,
          businessId: businessId ?? null,
          claimPayload,
          expiresAt: new Date(Date.now() + CLAIM_TOKEN_TTL_MS),
        },
      });

      await sendVerificationEmail({
        to: repEmail,
        subject: `Confirm your claim on ${businessName}`,
        heading: "Confirm your claim",
        message: `Your email matches ${businessName}'s domain, so your claim is auto-approved. Click below to verify your email and log in.`,
        link: `${process.env.FRONTEND_URL}/verify-claim/${record.token}`,
      });

      return res.json({ requiresEmailVerification: true, token: record.token });
    }

    const business = await findOrCreateClaimTarget({ businessId, businessName, category, location, ssm });
    const account = await prisma.account.create({
      data: {
        email: repEmail,
        phone: repPhone,
        name: repName,
        role: repRole,
        passwordHash,
        businessId: business.id,
        claimStatus: "pending",
        verificationMethod: null,
        emailVerified: false,
        // No SMS/OTP provider wired up yet — this stays false until that's
        // built (the frontend mock faked it by accepting any 4+ digit code).
        phoneVerified: false,
      },
    });

    // The account exists from here on, so the connect intent gets a real
    // row to hang off — unlike the domain-match branch above, this claim
    // can sit in an admin queue for days before its first session.
    // Guarded: a queued nicety must never sink the claim it rode in on.
    if (connectTarget) {
      await prisma.deferredConnection
        .create({ data: { accountId: account.id, businessId: connectTarget } })
        .catch((err) => console.error("Failed to queue connect intent", err));
    }

    // publicBusinessView, not the raw row. This response goes to whoever
    // POSTed the claim, BEFORE any approval — so before this, any stranger
    // could claim an existing listing and read back that business's four
    // billing columns. With contact columns on the same row it would have
    // handed over the phone, WhatsApp and email too.
    //
    // On the brand-new-business path the columns are all null anyway; the leak
    // was only ever real on the claim-an-existing-listing path, and fixing it
    // at the response covers both. Safe to narrow: AuthContext.claimOrRegister
    // reads only requiresEmailVerification and token off this payload.
    res.status(201).json({
      requiresAdminApproval: true,
      account: serializeAccount(account),
      business: publicBusinessView(business),
    });
  }),
);

export { router as businessRouter };