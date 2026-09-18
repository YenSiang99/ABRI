import {
  PROJECT_CREATE_VERIFICATION_LEVELS,
  UNCLAIMED,
} from "./verificationLevels.js";
import { orderedPair } from "./connections.js";

// Projects — the shared surface between an ask and a work record, and the one
// place in this codebase that writes a CONFIRMED engagement without asking the
// counterparty first.
//
// That last sentence is the whole design risk, so read the consent note on
// `model Project` in schema.prisma before changing anything here. The short
// version: nobody is ever credited with a service they did not personally
// declare, because the service lives on the PARTICIPANT's own row
// (ProjectParticipant.serviceProvided) and only that participant may set it.
// The business completing the project asserts two things — that it finished,
// and which month. Strip that property out and auto-minting becomes the
// self-nomination routes/engagements.js exists to forbid.
//
// NOTHING HERE EXPIRES. There is no applyExpiryIfNeeded in this file and that
// is deliberate, not missing — see the header on `model Project`. Do not add
// one by analogy with vouchExpiry.js / askExpiry.js / engagements.js: those
// time out a single pending decision, and the equivalent sweep here would have
// to either mint a public claim about several businesses because nobody opened
// a page, or destroy the record of work that is still happening.

const PROJECT_STATUSES = new Set(["active", "completed", "cancelled"]);
// The two a project cannot leave. Joins, invites, updates and edits are all
// refused once here.
const PROJECT_TERMINAL_STATUSES = new Set(["completed", "cancelled"]);
const PROJECT_VISIBILITIES = new Set(["private", "public"]);

const PARTICIPANT_STATUSES = new Set(["invited", "joined", "declined", "left"]);
// THE ONLY STATUS THAT MINTS. Named rather than inlined so the rule is
// greppable: "invited" never agreed, "declined" refused, and "left" gave
// consent and took it back, which is not consent.
const MINTING_PARTICIPANT_STATUS = "joined";

const PROJECT_UPDATE_TYPES = new Set([
  // The only kind with a body, and the only kind a member writes directly.
  "update",
  "created",
  "joined",
  "left",
  "visibility_changed",
  "completed",
  "cancelled",
  // NOTE THE ABSENCE: there is no "declined". A decline is private to the
  // creator — writing it here would put "they turned you down" in front of
  // everyone already in the project, which is a fact the decliner never agreed
  // to publish and nobody can act on. Same rule that keeps connection declines
  // and unfollows silent.
]);

// Bounds the mint. Pairs grow quadratically and a pair where both sides
// delivered writes two rows, so the worst case here is C(8,2)*2 = 56 rows from
// one button. That is a number worth being able to state; without a cap the
// answer is "however many businesses somebody felt like inviting".
const MAX_PARTICIPANTS = 8;

const MAX_TITLE = 120;
const MAX_DETAIL = 400;
const MAX_UPDATE = 1000;

// ITS OWN COPY, not an import from lib/connections.js or lib/asks.js, and for
// the reason ASK_BUSINESS_SELECT gives: this list is what crosses the wire on
// every project read, and it contains no contact column, so publicBusinessView
// is not needed anywhere on this path. Sharing it would put that guarantee at
// the mercy of an edit made for a different screen.
const PROJECT_BUSINESS_SELECT = {
  id: true,
  name: true,
  category: true,
  location: true,
  verificationLevel: true,
};

const PROJECT_INCLUDE = {
  createdBy: { select: PROJECT_BUSINESS_SELECT },
  ask: { select: { id: true, title: true } },
  participants: {
    include: { business: { select: PROJECT_BUSINESS_SELECT } },
    orderBy: [{ invitedAt: "asc" }],
  },
};

const PROJECT_DETAIL_INCLUDE = {
  ...PROJECT_INCLUDE,
  updates: {
    include: { author: { select: PROJECT_BUSINESS_SELECT } },
    // Oldest first: this is a trail, and a trail read newest-first is a list.
    // Paired with id so two rows written in the same millisecond keep a total
    // order rather than being free to swap between reads.
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
};

// L2. The same bar posting an ask clears, and refused with 403 rather than
// 402 wherever it is checked: verification cannot be bought.
function canCreateProject(business) {
  return PROJECT_CREATE_VERIFICATION_LEVELS.has(business.verificationLevel);
}

// L1. Deliberately lower than canCreateProject: anyone who has claimed their
// listing can be invited in and take part. An L0 listing has no account behind
// it, so there is nobody who could ever accept — the same reason it is refused
// a connection, a follow and an engagement.
function canJoinProject(business) {
  return business.verificationLevel !== UNCLAIMED;
}

// ANY row, including a declined one. Callers that care about access use
// activeParticipantOf below; this one exists for POST /:id/invite, which has to
// find a declined row in order to revive it in place.
function participantOf(project, businessId) {
  return project.participants.find((p) => p.businessId === businessId) ?? null;
}

// The row that grants access, which a DECLINED one does not.
//
// Declining used to leave the row in place and every read matched on it, so a
// business that said no kept a permanent window onto the thread — including
// every update written after they turned it down. Saying no has to end the
// relationship, not just decline to start it.
//
// "left" still counts: somebody who worked on this and then withdrew was part
// of it, and the timeline carries their name. What they lose is minting, not
// sight of what they took part in.
function activeParticipantOf(project, businessId) {
  const row = participantOf(project, businessId);
  return row && row.status !== "declined" ? row : null;
}

function joinedParticipants(project) {
  return project.participants.filter(
    (p) => p.status === MINTING_PARTICIPANT_STATUS,
  );
}

// A published shell is a completed, public project. Everything else is
// readable only by someone with a row on it — in ANY status, so an invitee can
// see what they are being asked to join and someone who declined can still see
// what they turned down.
function canReadProject(project, businessId) {
  if (businessId && activeParticipantOf(project, businessId)) return true;
  return project.status === "completed" && project.visibility === "public";
}

// HAS ANYBODY ACTUALLY ACCEPTED? Derived from the participant rows on every
// read, never stored, and that is the same rule this schema applies to
// vouchCount and follower counts: a column saying "how many joined" is a
// summary of rows that can disagree with them, and it would need maintaining
// on join, decline, leave and re-invite.
//
// WHY IT EXISTS AT ALL. `status` models how a project ENDS — active ->
// completed | cancelled — and said nothing about whether it had begun, so
// "active" meant "not yet finished" rather than "under way". A project nobody
// accepted looked identical to one with three businesses working in it, and
// its creator could post updates into a thread with no second reader.
//
// Two, not one: a project is work between businesses, and one business is not
// working with anybody. It is the same threshold completion uses, for the same
// reason.
function hasStarted(project) {
  return joinedParticipants(project).length >= 2;
}

function serializeParticipant(p) {
  return {
    id: p.id,
    business: p.business,
    status: p.status,
    serviceProvided: p.serviceProvided,
    invitedAt: p.invitedAt,
    joinedAt: p.joinedAt,
  };
}

function serializeUpdate(update, viewerBusinessId) {
  return {
    id: update.id,
    type: update.type,
    body: update.body,
    createdAt: update.createdAt,
    author: update.author ?? null,
    authorIsYou: viewerBusinessId
      ? update.authorBusinessId === viewerBusinessId
      : false,
  };
}

// Everything viewer-dependent is resolved HERE rather than on the client, the
// rule serializeAsk and serializeConnection both follow: a client that decides
// for itself whether it may act is a client that can be wrong about it.
function serializeProject(project, viewerBusinessId = null) {
  const you = viewerBusinessId ? participantOf(project, viewerBusinessId) : null;
  const isCreator = project.createdById === viewerBusinessId;

  // A decline is private to the creator. Everyone else — including the other
  // participants — sees a project that business was simply never in.
  const visibleParticipants = project.participants.filter(
    (p) => p.status !== "declined" || isCreator,
  );

  return {
    id: project.id,
    title: project.title,
    detail: project.detail,
    status: project.status,
    visibility: project.visibility,
    startedOn: project.startedOn,
    completedOn: project.completedOn,
    createdAt: project.createdAt,
    lastActionAt: project.lastActionAt,
    completedAt: project.completedAt,
    cancelledAt: project.cancelledAt,
    createdBy: project.createdBy,
    createdByYou: isCreator,
    ask: project.ask ?? null,
    participants: visibleParticipants.map(serializeParticipant),
    joinedCount: joinedParticipants(project).length,
    // Derived server-side so the client never has to re-derive the threshold
    // and get it different from the route that enforces it.
    hasStarted: hasStarted(project),
    yourParticipation: you ? serializeParticipant(you) : null,
    ...(project.updates
      ? { updates: project.updates.map((u) => serializeUpdate(u, viewerBusinessId)) }
      : {}),
  };
}

// What a non-participant may see, and the answer to "what does `public`
// actually publish".
//
// NOTE WHAT IS ABSENT, because each absence is a promise rather than an
// oversight: no `detail` (prose the participants wrote for each other while
// working out what they were doing), no `updates` of any kind (the thread is
// private under EVERY visibility — this column publishes the shell, never the
// conversation), no `ask`, and no participant who did not actually join.
function publicProjectShell(project) {
  return {
    id: project.id,
    title: project.title,
    startedOn: project.startedOn,
    completedOn: project.completedOn,
    participants: joinedParticipants(project).map((p) => ({
      business: p.business,
      serviceProvided: p.serviceProvided,
    })),
  };
}

// The completed, public projects this business actually joined, newest work
// first. What the profile renders beside the engagement record.
//
// Takes the prisma client as an argument rather than importing it, so this
// module stays free of the import cycle lib/engagements.js has to live with.
async function publicProjectShellsFor(prisma, businessId, { limit = 20 } = {}) {
  const projects = await prisma.project.findMany({
    where: {
      status: "completed",
      visibility: "public",
      participants: {
        some: { businessId, status: MINTING_PARTICIPANT_STATUS },
      },
    },
    include: PROJECT_INCLUDE,
    orderBy: [{ completedOn: "desc" }, { id: "desc" }],
    take: limit,
  });
  return projects.map(publicProjectShell);
}

// THE ONE FUNCTION THIS FILE EXISTS FOR, and deliberately PURE: it takes a
// project loaded with PROJECT_INCLUDE and returns rows, so the route can count
// them before writing and a test can assert the shape without a database.
//
// The algorithm, in one sentence: every unordered pair of JOINED participants
// gets one engagement per side that declared a service, or a single
// service-less row if neither did.
//
// A pair where BOTH delivered gets TWO rows, and that is correct rather than a
// duplicate — "A provided design to B" and "B provided accounting to A" are
// two different facts, and one Engagement row carries one service and one
// provider. It is also why Engagement has no @@unique on the pair.
//
// Pairs that already have an engagement from some earlier month are minted
// over WITHOUT dedupe, for the reason the Engagement model states outright:
// working together repeatedly is the strongest thing it can record, and
// suppressing the second row would delete a real repeat signal.
function engagementRowsFor(project, now = new Date()) {
  const joined = joinedParticipants(project);
  const rows = [];

  for (let i = 0; i < joined.length; i += 1) {
    for (let j = i + 1; j < joined.length; j += 1) {
      const x = joined[i];
      const y = joined[j];
      const pair = orderedPair(x.businessId, y.businessId);
      const providers = [x, y].filter((p) => p.serviceProvided);

      if (providers.length === 0) {
        // Nobody in this pair delivered a catalogued service. One row saying
        // they worked together, service null — shown on both profiles, counted
        // in `total`, and absent from every per-service aggregate. Exactly the
        // contract an uncatalogued engagement already has.
        //
        // proposedById is inert on a confirmed row (both routes that read it
        // check for "pending" first) but must still name one of the two
        // parties, never a third business.
        rows.push({
          ...pair,
          service: null,
          serviceProvidedById: null,
          proposedById: pair.businessAId,
        });
        continue;
      }

      for (const p of providers) {
        rows.push({
          ...pair,
          service: p.serviceProvided,
          serviceProvidedById: p.businessId,
          proposedById: p.businessId,
        });
      }
    }
  }

  return rows.map((row) => ({
    ...row,
    // Born confirmed. The consent this skips was collected at join — see the
    // header.
    status: "confirmed",
    confirmedAt: now,
    lastActionAt: now,
    // COMPLETION, not start. repeatSignalFor counts distinct MONTHS per
    // counterparty, so a six-month project has to claim one month or it would
    // manufacture a repeat out of a single piece of work.
    occurredOn: project.completedOn,
    // Copied onto every row, including pairs who were not party to the ask.
    // The claim is "this work came out of that ask", which is true of the
    // project, and everyone here consented to the project. This is the only
    // path in the product that ever populates Engagement.askId.
    askId: project.askId,
    projectId: project.id,
    note: null,
  }));
}

// Writes what engagementRowsFor decided. Takes a transaction client because it
// must land in the same transaction as the status flip that authorised it.
async function mintEngagementsFor(tx, project, now = new Date()) {
  const rows = engagementRowsFor(project, now);
  if (rows.length === 0) return 0;
  await tx.engagement.createMany({ data: rows });
  return rows.length;
}

export {
  PROJECT_STATUSES,
  PROJECT_TERMINAL_STATUSES,
  PROJECT_VISIBILITIES,
  PARTICIPANT_STATUSES,
  MINTING_PARTICIPANT_STATUS,
  PROJECT_UPDATE_TYPES,
  MAX_PARTICIPANTS,
  MAX_TITLE,
  MAX_DETAIL,
  MAX_UPDATE,
  PROJECT_BUSINESS_SELECT,
  PROJECT_INCLUDE,
  PROJECT_DETAIL_INCLUDE,
  canCreateProject,
  canJoinProject,
  participantOf,
  activeParticipantOf,
  joinedParticipants,
  hasStarted,
  canReadProject,
  serializeParticipant,
  serializeUpdate,
  serializeProject,
  publicProjectShell,
  publicProjectShellsFor,
  engagementRowsFor,
  mintEngagementsFor,
};
