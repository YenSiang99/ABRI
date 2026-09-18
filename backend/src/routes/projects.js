import { Router } from "express";

import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { createActivityEvent } from "../lib/activityEvents.js";
import { canonicalService } from "../lib/serviceVocab.js";
import { UNCLAIMED } from "../lib/verificationLevels.js";
import {
  MAX_DETAIL,
  MAX_PARTICIPANTS,
  MAX_TITLE,
  MAX_UPDATE,
  PROJECT_DETAIL_INCLUDE,
  PROJECT_INCLUDE,
  PROJECT_VISIBILITIES,
  activeParticipantOf,
  canCreateProject,
  canJoinProject,
  hasStarted,
  joinedParticipants,
  mintEngagementsFor,
  participantOf,
  publicProjectShell,
  serializeProject,
} from "../lib/projects.js";

const router = Router();

// Projects — the workspace between an ask and a work record.
//
// TWO RULES GOVERN THIS WHOLE FILE.
//
// 1. A PARTICIPANT'S SERVICE IS THEIRS ALONE. It is proposed on the invite and
//    settled by the invitee at join, and after that only they may change it
//    (PATCH /:id/participation checks the session, never a body field). This is
//    not tidiness: completing a project writes CONFIRMED engagements in one
//    move, and the only thing that makes that defensible instead of a
//    self-nomination is that nobody is credited with work they did not claim
//    themselves. A creator who could set somebody else's service would be
//    publishing a claim about them.
//
// 2. NOT BEING ABLE TO SEE A PROJECT IS A 404, NEVER A 403. Whether three other
//    businesses are working together is not a fact this caller is entitled to,
//    and a 403 confirms it. Same call ownEngagement makes in routes/engagements.js.
//
// Verification failures answer 403, not 402. There is no `can()` call anywhere
// in this file and there should not be: verification cannot be bought, and
// routes/engagements.js prices nothing either. Putting a paywall in the middle
// of the give-first loop would be a new decision, not this feature's to make.

router.use(requireAuth);

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

// The caller's own business, refused unless it is claimed. Copied from
// routes/engagements.js rather than shared, which is the pattern this codebase
// has settled on for these four-line guards — see the note in routes/asks.js.
async function loadOwnBusiness(req) {
  if (!req.account.businessId) fail(400, "You need a claimed business to do this.");
  const business = await prisma.business.findUnique({
    where: { id: req.account.businessId },
  });
  if (!business) fail(400, "You need a claimed business to do this.");
  if (business.verificationLevel === UNCLAIMED) {
    fail(400, "Your business needs to be claimed before you can join a project.");
  }
  return business;
}

// The read variant: an admin has no business and should get an empty list
// rather than an error. Mirrors ownBusinessOrNull in routes/asks.js.
async function ownBusinessOrNull(req) {
  if (!req.account.businessId) return null;
  return prisma.business.findUnique({ where: { id: req.account.businessId } });
}

async function loadProject(id, include = PROJECT_DETAIL_INCLUDE) {
  const project = await prisma.project.findUnique({ where: { id }, include });
  if (!project) fail(404, "Project not found.");
  return project;
}

// Rule 2 above. Returns the caller's participant row so callers can branch on
// its status without a second lookup.
function requireParticipant(project, own) {
  // activeParticipantOf, not participantOf: a business that DECLINED keeps its
  // row (so a re-invite can revive it in place) but loses every read. Saying no
  // ends the relationship rather than merely postponing it.
  const you = own ? activeParticipantOf(project, own.id) : null;
  if (!you) fail(404, "Project not found.");
  return you;
}

function requireCreator(project, own) {
  if (project.createdById !== own.id) fail(403, "Only the business that started this project can do that.");
}

function requireActive(project) {
  if (project.status !== "active") fail(409, `This project is already ${project.status}.`);
}

// First of the month, UTC, and never in the future. Lifted from
// routes/engagements.js so the two paths that write occurredOn agree exactly —
// a project that floored its months differently would put work in a month the
// manual flow could not.
function monthFrom(value, label) {
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) fail(400, `${label} isn't a date we can read.`);
  const month = new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), 1));
  const now = new Date();
  const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  if (month.getTime() > thisMonth.getTime()) fail(400, "That month hasn't happened yet.");
  return month;
}

// Canonical or nothing. A custom service would produce an engagement that
// appears in no aggregate — the silent miss lib/serviceVocab.js exists to
// remove — so it is refused at the door rather than stored and ignored.
function serviceOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const canonical = canonicalService(value);
  if (!canonical) fail(400, `"${value}" isn't a service we can record work against.`);
  return canonical;
}

function trimmedOrNull(value, max, label) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") fail(400, `${label} isn't text.`);
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) fail(400, `${label} is too long (max ${max} characters).`);
  return trimmed;
}

// GET /projects — every project this business has a row on, any status.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const own = await ownBusinessOrNull(req);
    if (!own) return res.json({ projects: [] });

    const { status, participation } = req.query;

    const projects = await prisma.project.findMany({
      where: {
        participants: {
          some: {
            businessId: own.id,
            // Declined is excluded rather than merely unasked-for: saying no
            // ends the relationship, and GET /:id already 404s these. A list
            // that still carried them would show a member rows they cannot
            // open.
            ...(participation ? { status: participation } : { status: { not: "declined" } }),
          },
        },
        ...(status ? { status } : {}),
      },
      include: PROJECT_INCLUDE,
      // lastActionAt, not createdAt: nothing here expires, so the only thing
      // that can surface a project everyone forgot is when it last moved.
      orderBy: [{ lastActionAt: "desc" }, { id: "desc" }],
    });

    res.json({ projects: projects.map((p) => serializeProject(p, own.id)) });
  }),
);

// GET /projects/:id — the full project for a participant, the shell for
// anybody else IF it is completed and public, and 404 otherwise.
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const own = await ownBusinessOrNull(req);
    const project = await loadProject(req.params.id);
    const you = own ? activeParticipantOf(project, own.id) : null;

    if (you) {
      return res.json({ project: serializeProject(project, own.id) });
    }
    if (project.status === "completed" && project.visibility === "public") {
      // The shell, which carries no detail and no update of any kind. See
      // publicProjectShell — every absence there is a promise.
      return res.json({ project: publicProjectShell(project), shellOnly: true });
    }
    fail(404, "Project not found.");
  }),
);

// POST /projects
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const own = await loadOwnBusiness(req);
    // 403 rather than 402: this is the one door money cannot open.
    if (!canCreateProject(own)) {
      fail(403, "Get SSM-verified to start a project.");
    }

    const { title, detail, startedOn, visibility, service, askId, invites } = req.body ?? {};

    const cleanTitle = trimmedOrNull(title, MAX_TITLE, "The title");
    if (!cleanTitle) fail(400, "Give the project a title.");
    const cleanDetail = trimmedOrNull(detail, MAX_DETAIL, "The description");

    const vis = visibility ?? "private";
    if (!PROJECT_VISIBILITIES.has(vis)) fail(400, "That isn't a visibility we support.");

    const month = monthFrom(startedOn ?? new Date().toISOString(), "The start month");
    const ownService = serviceOrNull(service);

    // The invite list, validated before anything is written. Every failure
    // here names the business rather than the index, because the member is
    // looking at names.
    const rawInvites = Array.isArray(invites) ? invites : [];
    if (rawInvites.length + 1 > MAX_PARTICIPANTS) {
      fail(400, `A project can hold ${MAX_PARTICIPANTS} businesses, including you.`);
    }

    const seen = new Set();
    const prepared = [];
    for (const invite of rawInvites) {
      const businessId = typeof invite === "string" ? invite : invite?.businessId;
      if (!businessId) fail(400, "One of those invites doesn't name a business.");
      if (businessId === own.id) fail(400, "You're already on your own project.");
      if (seen.has(businessId)) fail(400, "You've invited the same business twice.");
      seen.add(businessId);

      const target = await prisma.business.findUnique({ where: { id: businessId } });
      if (!target) fail(404, "One of those businesses no longer exists.");
      if (!canJoinProject(target)) {
        fail(400, `${target.name} hasn't been claimed yet, so nobody there could take part.`);
      }
      prepared.push({
        businessId,
        serviceProvided: serviceOrNull(typeof invite === "string" ? null : invite?.service),
      });
    }

    // Ask provenance, checked exactly as POST /engagements checks it: you may
    // only link an ask you were actually part of.
    let linkedAskId = null;
    if (askId) {
      const ask = await prisma.ask.findUnique({
        where: { id: askId },
        include: { answers: { select: { answeredByBusinessId: true } } },
      });
      if (!ask) fail(404, "That ask no longer exists.");
      const tookPart =
        ask.askedByBusinessId === own.id ||
        ask.answers.some((a) => a.answeredByBusinessId === own.id);
      if (!tookPart) fail(400, "You can only link an ask you took part in.");
      linkedAskId = ask.id;
    }

    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          title: cleanTitle,
          detail: cleanDetail,
          createdById: own.id,
          visibility: vis,
          askId: linkedAskId,
          startedOn: month,
        },
      });

      // The creator joins their own project outright. There is nobody to
      // accept an invite from, and a creator sitting at "invited" on their own
      // project would be unable to complete it.
      await tx.projectParticipant.create({
        data: {
          projectId: created.id,
          businessId: own.id,
          invitedById: own.id,
          status: "joined",
          serviceProvided: ownService,
          joinedAt: new Date(),
        },
      });

      if (prepared.length > 0) {
        await tx.projectParticipant.createMany({
          data: prepared.map((p) => ({
            projectId: created.id,
            businessId: p.businessId,
            invitedById: own.id,
            serviceProvided: p.serviceProvided,
          })),
        });
      }

      await tx.projectUpdate.create({
        data: { projectId: created.id, authorBusinessId: own.id, type: "created" },
      });

      return tx.project.findUnique({ where: { id: created.id }, include: PROJECT_DETAIL_INCLUDE });
    });

    // Outside the transaction, the way routes/asks.js writes its accept event:
    // a notification that fails must not roll back the thing it is about.
    await Promise.all(
      prepared.map((p) =>
        createActivityEvent(prisma, {
          businessId: p.businessId,
          actorBusinessId: own.id,
          type: "project_invited",
        }),
      ),
    );

    res.status(201).json({ project: serializeProject(project, own.id) });
  }),
);

// POST /projects/:id/invite
router.post(
  "/:id/invite",
  asyncHandler(async (req, res) => {
    const own = await loadOwnBusiness(req);
    const project = await loadProject(req.params.id, PROJECT_INCLUDE);
    requireParticipant(project, own);
    requireCreator(project, own);
    requireActive(project);

    const { businessId, service } = req.body ?? {};
    if (!businessId) fail(400, "Say which business you're inviting.");
    if (businessId === own.id) fail(400, "You're already on this project.");

    const target = await prisma.business.findUnique({ where: { id: businessId } });
    if (!target) fail(404, "That business no longer exists.");
    if (!canJoinProject(target)) {
      fail(400, `${target.name} hasn't been claimed yet, so nobody there could take part.`);
    }

    const existing = participantOf(project, businessId);
    if (existing && ["invited", "joined"].includes(existing.status)) {
      fail(409, `${target.name} is already on this project.`);
    }
    if (project.participants.filter((p) => p.status !== "declined").length >= MAX_PARTICIPANTS) {
      fail(400, `A project can hold ${MAX_PARTICIPANTS} businesses.`);
    }

    const serviceProvided = serviceOrNull(service);

    // Revived in place rather than re-created, so @@unique(projectId,
    // businessId) keeps meaning "one row per business per project, EVER" — the
    // same revival a cancelled vouch and a withdrawn answer get. leftAt is
    // cleared: it describes the row's current life, not its history.
    await prisma.projectParticipant.upsert({
      where: { projectId_businessId: { projectId: project.id, businessId } },
      update: {
        status: "invited",
        invitedById: own.id,
        invitedAt: new Date(),
        serviceProvided,
        joinedAt: null,
        leftAt: null,
      },
      create: { projectId: project.id, businessId, invitedById: own.id, serviceProvided },
    });
    await prisma.project.update({
      where: { id: project.id },
      data: { lastActionAt: new Date() },
    });

    await createActivityEvent(prisma, {
      businessId,
      actorBusinessId: own.id,
      type: "project_invited",
    });

    const fresh = await loadProject(project.id);
    res.status(201).json({ project: serializeProject(fresh, own.id) });
  }),
);

// POST /projects/:id/join — and the moment consent is recorded.
router.post(
  "/:id/join",
  asyncHandler(async (req, res) => {
    const own = await loadOwnBusiness(req);
    const project = await loadProject(req.params.id, PROJECT_INCLUDE);
    const you = requireParticipant(project, own);
    requireActive(project);

    if (you.status !== "invited") fail(409, "You've already answered this invite.");
    if (!canJoinProject(own)) fail(403, "Your business needs to be claimed before you can join.");

    // THE INVITEE'S LAST WORD ON WHAT THEY WILL BE CREDITED WITH. The invite
    // proposed a service; this is where the business that will carry it on its
    // public profile either confirms it or corrects it. Omitting the field
    // keeps whatever the invite proposed — which they are accepting by joining.
    const serviceProvided =
      req.body && "service" in req.body ? serviceOrNull(req.body.service) : you.serviceProvided;

    const now = new Date();
    await prisma.$transaction([
      prisma.projectParticipant.update({
        where: { id: you.id },
        data: { status: "joined", joinedAt: now, serviceProvided },
      }),
      prisma.project.update({ where: { id: project.id }, data: { lastActionAt: now } }),
      prisma.projectUpdate.create({
        data: { projectId: project.id, authorBusinessId: own.id, type: "joined" },
      }),
    ]);

    await createActivityEvent(prisma, {
      businessId: project.createdById,
      actorBusinessId: own.id,
      type: "project_joined",
    });

    const fresh = await loadProject(project.id);
    res.json({ project: serializeProject(fresh, own.id) });
  }),
);

// POST /projects/:id/decline — silent by design.
router.post(
  "/:id/decline",
  asyncHandler(async (req, res) => {
    const own = await loadOwnBusiness(req);
    const project = await loadProject(req.params.id, PROJECT_INCLUDE);
    const you = requireParticipant(project, own);
    if (you.status !== "invited") fail(409, "You've already answered this invite.");

    // No timeline row and no activity event. "They turned you down" is a fact
    // the decliner never agreed to publish and the reader can do nothing with
    // — the same call connections and follows make. The creator sees the
    // status on their own screen; nobody else sees the row at all.
    await prisma.projectParticipant.update({
      where: { id: you.id },
      data: { status: "declined" },
    });

    const fresh = await loadProject(project.id);
    res.json({ project: serializeProject(fresh, own.id) });
  }),
);

// POST /projects/:id/leave
router.post(
  "/:id/leave",
  asyncHandler(async (req, res) => {
    const own = await loadOwnBusiness(req);
    const project = await loadProject(req.params.id, PROJECT_INCLUDE);
    const you = requireParticipant(project, own);
    requireActive(project);

    if (you.status !== "joined") fail(409, "You aren't in this project.");
    if (project.createdById === own.id) {
      fail(400, "You started this project — cancel it instead of leaving it.");
    }

    // Leaving takes consent back, and a participant at "left" mints nothing.
    // That is the whole point of the status: somebody who walked away before
    // the work finished should not end up with it on their public record.
    const now = new Date();
    await prisma.$transaction([
      prisma.projectParticipant.update({
        where: { id: you.id },
        data: { status: "left", leftAt: now },
      }),
      prisma.project.update({ where: { id: project.id }, data: { lastActionAt: now } }),
      prisma.projectUpdate.create({
        data: { projectId: project.id, authorBusinessId: own.id, type: "left" },
      }),
    ]);

    const fresh = await loadProject(project.id);
    res.json({ project: serializeProject(fresh, own.id) });
  }),
);

// PATCH /projects/:id/participation — your own service, and only ever yours.
router.patch(
  "/:id/participation",
  asyncHandler(async (req, res) => {
    const own = await loadOwnBusiness(req);
    const project = await loadProject(req.params.id, PROJECT_INCLUDE);
    const you = requireParticipant(project, own);
    requireActive(project);
    if (you.status !== "joined") fail(409, "You aren't in this project.");

    // Note there is no businessId in this route, in the path or the body. The
    // row is resolved from the session, which is what makes rule 1 at the top
    // of this file enforceable rather than merely intended.
    const serviceProvided = serviceOrNull(req.body?.service);

    await prisma.projectParticipant.update({
      where: { id: you.id },
      data: { serviceProvided },
    });

    const fresh = await loadProject(project.id);
    res.json({ project: serializeProject(fresh, own.id) });
  }),
);

// POST /projects/:id/updates
router.post(
  "/:id/updates",
  asyncHandler(async (req, res) => {
    const own = await loadOwnBusiness(req);
    const project = await loadProject(req.params.id, PROJECT_INCLUDE);
    const you = requireParticipant(project, own);
    requireActive(project);

    // An invitee can READ the project — that is how they decide whether to
    // join — but writing on the timeline is for people who actually did.
    if (you.status !== "joined") {
      fail(403, "Join the project before posting an update.");
    }

    // AND SOMEBODY ELSE HAS TO HAVE ACCEPTED. Until then this is one business
    // writing to itself: the thread is the record of JOINT work, and there is
    // no joint anything until a second business has said yes. Creating a
    // project is an invitation, not a start.
    //
    // Derived rather than read off a status column — see hasStarted. It also
    // covers the case a status would have to be taught separately: everyone
    // joined, then left again.
    if (!hasStarted(project)) {
      fail(409, "Nobody has joined this project yet — there's nobody to post to.");
    }

    const body = trimmedOrNull(req.body?.body, MAX_UPDATE, "The update");
    if (!body) fail(400, "Write something first.");

    const now = new Date();
    await prisma.$transaction([
      prisma.projectUpdate.create({
        data: { projectId: project.id, authorBusinessId: own.id, type: "update", body },
      }),
      prisma.project.update({ where: { id: project.id }, data: { lastActionAt: now } }),
    ]);

    // NO ACTIVITY EVENT. See the note in lib/activityEvents.js: an n-1 fan-out
    // per message would evict every real notification from the reader's
    // fifty-row cap.
    const fresh = await loadProject(project.id);
    res.status(201).json({ project: serializeProject(fresh, own.id) });
  }),
);

// POST /projects/:id/complete — THE MINT.
router.post(
  "/:id/complete",
  asyncHandler(async (req, res) => {
    const own = await loadOwnBusiness(req);
    const loaded = await loadProject(req.params.id, PROJECT_INCLUDE);
    requireParticipant(loaded, own);
    requireCreator(loaded, own);
    requireActive(loaded);

    const joined = joinedParticipants(loaded);
    if (joined.length < 2) {
      fail(400, "At least one other business has to join before you can complete this.");
    }

    const month = monthFrom(
      req.body?.completedOn ?? new Date().toISOString(),
      "The completion month",
    );
    if (month.getTime() < new Date(loaded.startedOn).getTime()) {
      fail(400, "The project can't have finished before it started.");
    }

    const now = new Date();

    const { project, minted } = await prisma.$transaction(async (tx) => {
      // THE IDEMPOTENCE GUARD, and it is the status predicate in this WHERE
      // rather than a read-then-write. Two simultaneous completes serialize on
      // the row lock; the loser matches zero rows and throws here, before
      // createMany is ever reached. A findUnique-then-check would let both
      // through and mint the whole project twice.
      const { count } = await tx.project.updateMany({
        where: { id: loaded.id, status: "active" },
        data: {
          status: "completed",
          completedOn: month,
          completedAt: now,
          lastActionAt: now,
        },
      });
      if (count === 0) fail(409, "This project is already settled.");

      // Re-read inside the transaction so the rows minted from it are the rows
      // the guard just authorised, completedOn included.
      const fresh = await tx.project.findUnique({
        where: { id: loaded.id },
        include: PROJECT_INCLUDE,
      });
      const mintedCount = await mintEngagementsFor(tx, fresh, now);

      await tx.projectUpdate.create({
        data: { projectId: fresh.id, authorBusinessId: own.id, type: "completed" },
      });

      return { project: fresh, minted: mintedCount };
    });

    await Promise.all(
      joined
        .filter((p) => p.businessId !== own.id)
        .map((p) =>
          createActivityEvent(prisma, {
            businessId: p.businessId,
            actorBusinessId: own.id,
            type: "project_completed",
          }),
        ),
    );

    const fresh = await loadProject(project.id);
    // mintedEngagements crosses the wire so the UI can say what just happened
    // to everyone's public record, rather than "Saved".
    res.json({ project: serializeProject(fresh, own.id), mintedEngagements: minted });
  }),
);

// POST /projects/:id/cancel — terminal, and mints nothing.
router.post(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    const own = await loadOwnBusiness(req);
    const project = await loadProject(req.params.id, PROJECT_INCLUDE);
    requireParticipant(project, own);
    requireCreator(project, own);
    requireActive(project);

    const now = new Date();
    await prisma.$transaction([
      prisma.project.update({
        where: { id: project.id },
        data: { status: "cancelled", cancelledAt: now, lastActionAt: now },
      }),
      prisma.projectUpdate.create({
        data: { projectId: project.id, authorBusinessId: own.id, type: "cancelled" },
      }),
    ]);

    await Promise.all(
      joinedParticipants(project)
        .filter((p) => p.businessId !== own.id)
        .map((p) =>
          createActivityEvent(prisma, {
            businessId: p.businessId,
            actorBusinessId: own.id,
            type: "project_cancelled",
          }),
        ),
    );

    const fresh = await loadProject(project.id);
    res.json({ project: serializeProject(fresh, own.id) });
  }),
);

// DELETE /projects/:id — for the one you started by accident.
//
// NEVER A COMPLETED PROJECT, and that is the whole rule of this route rather
// than a caution on it. Completing mints CONFIRMED engagements onto every
// participant's public profile, and those are facts the other businesses now
// rely on. A delete that took them with it would let one party erase another
// party's trust record unilaterally — which is precisely the forgeable signal
// the accept step on Connection, and the confirm step on Engagement, exist to
// prevent. A finished project is a record; there is no undo for it.
//
// Everything a non-completed project owns goes with it, because none of it
// means anything on its own: the timeline is about this project and the
// participant rows are memberships of it. Both are deleted here rather than by
// a database cascade, so the order is visible and the RESTRICT foreign keys
// stay as they are for every other table.
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const own = await loadOwnBusiness(req);
    const project = await loadProject(req.params.id, PROJECT_INCLUDE);
    requireParticipant(project, own);
    requireCreator(project, own);

    if (project.status === "completed") {
      fail(
        409,
        "A finished project can't be deleted — the work record it wrote belongs to everyone who took part.",
      );
    }

    // Belt and braces. A non-completed project has minted nothing, so this
    // should always be zero; if it is ever not, something upstream has minted
    // outside of completion and deleting silently would hide it.
    const minted = await prisma.engagement.count({ where: { projectId: project.id } });
    if (minted > 0) {
      fail(409, "This project has confirmed work against it and can't be deleted.");
    }

    await prisma.$transaction([
      prisma.projectUpdate.deleteMany({ where: { projectId: project.id } }),
      prisma.projectParticipant.deleteMany({ where: { projectId: project.id } }),
      prisma.project.delete({ where: { id: project.id } }),
    ]);

    // No activity event. Telling the people who were invited that a thing they
    // may never have opened has been withdrawn is a notification nobody can
    // act on — the same call decline and leave make.
    res.json({ ok: true });
  }),
);

// PATCH /projects/:id — title, detail, visibility.
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const own = await loadOwnBusiness(req);
    const project = await loadProject(req.params.id, PROJECT_INCLUDE);
    requireParticipant(project, own);
    requireCreator(project, own);
    // VISIBILITY IS FROZEN ONCE TERMINAL, which is most of why this whole route
    // refuses a settled project. Flipping a published shell private would
    // retract a public claim with no record of the retraction; flipping the
    // other way would publish work the participants agreed to keep quiet.
    // Either is a decision made once that cannot be unmade, so it only exists
    // while the project is still running and everyone can still walk away.
    requireActive(project);

    const data = {};
    if ("title" in (req.body ?? {})) {
      const title = trimmedOrNull(req.body.title, MAX_TITLE, "The title");
      if (!title) fail(400, "Give the project a title.");
      data.title = title;
    }
    if ("detail" in (req.body ?? {})) {
      data.detail = trimmedOrNull(req.body.detail, MAX_DETAIL, "The description");
    }

    let visibilityChanged = false;
    if ("visibility" in (req.body ?? {})) {
      if (!PROJECT_VISIBILITIES.has(req.body.visibility)) {
        fail(400, "That isn't a visibility we support.");
      }
      visibilityChanged = req.body.visibility !== project.visibility;
      data.visibility = req.body.visibility;
    }

    if (Object.keys(data).length === 0) fail(400, "Nothing to change.");
    data.lastActionAt = new Date();

    const writes = [prisma.project.update({ where: { id: project.id }, data })];
    // A timeline row only when it actually moved. Everyone on the project
    // agreed to a visibility when they joined, so a change to it is a change to
    // the terms — and belongs on the record, not in a silent update.
    if (visibilityChanged) {
      writes.push(
        prisma.projectUpdate.create({
          data: {
            projectId: project.id,
            authorBusinessId: own.id,
            type: "visibility_changed",
          },
        }),
      );
    }
    await prisma.$transaction(writes);

    const fresh = await loadProject(project.id);
    res.json({ project: serializeProject(fresh, own.id) });
  }),
);

export { router as projectRouter };
