import assert from "node:assert";
import { PrismaClient } from "@prisma/client";
import { API, TEST_DATABASE_URL } from "./env.mjs";
const P = "e2e-";
let pass = 0;
const ok = (m) => { console.log("  ✓", m); pass++; };

// Same tiny cookie-jar client every suite here uses — real sessions, real HTTP.
async function login(key) {
  let res;
  for (let attempt = 1; attempt <= 8; attempt++) {
    res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `${P}${key}@e2e.test`, password: "e2e-password-123" }),
    });
    if (res.status !== 503) break;
    await new Promise((r) => setTimeout(r, 3000));
  }
  assert.equal(res.status, 200, `login ${key}: ${res.status} ${await res.text()}`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return async (path, { method = "GET", body } = {}) => {
    const r = await fetch(`${API}${path}`, {
      method, headers: { cookie, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
}

// RESETS ITS OWN TABLES FIRST, for the reason engagements.mjs states: a
// completing project mints CONFIRMED engagements, and the HTTP surface
// deliberately offers no way to delete one. Without this, a second run would
// find every counterparty already counted and the breadth assertions would be
// false — a property of how often the suite has run, not of the feature.
//
// Engagement.projectId makes the engagement half of this surgical: it removes
// exactly what a project minted and leaves hand-logged rows alone.
const url = TEST_DATABASE_URL;
const db = new PrismaClient({ datasourceUrl: url });
const e2eProjects = await db.project.findMany({
  where: { createdById: { startsWith: P } },
  select: { id: true },
});
const projectIds = e2eProjects.map((p) => p.id);
await db.engagement.deleteMany({ where: { projectId: { in: projectIds } } });
await db.projectUpdate.deleteMany({ where: { projectId: { in: projectIds } } });
await db.projectParticipant.deleteMany({ where: { projectId: { in: projectIds } } });
await db.project.deleteMany({ where: { id: { in: projectIds } } });
// The hand-logged rows this suite writes in step 10, cleared for the same reason.
await db.engagement.deleteMany({
  where: {
    projectId: null,
    OR: [{ businessAId: { startsWith: P } }, { businessBId: { startsWith: P } }],
  },
});
await db.$disconnect();

const asker = await login("asker");   // L2 — creates
const a2 = await login("a2");         // L2
const a3 = await login("a3");         // L2
const a4 = await login("a4");         // L2 — the leaver
const t1 = await login("t1");         // L1 — joins, cannot create

const profile = async (id) => (await fetch(`${API}/businesses/${id}`)).json();
const summaryOf = async (id) => (await profile(id)).business.engagementSummary;
const serviceIn = (summary, name) => summary.services.find((s) => s.service === name) ?? null;

// An ask this suite can hang a project off, for step 15b. Posted rather than
// assumed: asks.mjs owns its own rows and cleans none of them up, so reaching
// for one of those would couple two suites through the database.
const askPost = await asker("/asks", {
  method: "POST",
  body: {
    category: "Service requirement",
    matchCategory: "Accounting & Tax",
    matchLocation: "Petaling Jaya",
    title: "Bridge check — need an accountant",
  },
});
const askIdForBridge = askPost.data.ask.id;

console.log("projects");

// ---------------------------------------------------------------- 1. the gate
{
  const r = await t1("/projects", {
    method: "POST",
    body: { title: "L1 shouldn't manage this", startedOn: "2026-08-01" },
  });
  // 403, not 402. Verification cannot be bought, so there is nothing to sell
  // here and an upgrade prompt would be a lie with a price on it.
  assert.equal(r.status, 403, JSON.stringify(r.data));
  ok("an L1 business cannot start a project (403, not 402)");
}

let projectId;
{
  const r = await asker("/projects", {
    method: "POST",
    body: {
      title: "Year-end close for a manufacturing client",
      detail: "Books, payroll and the SST position, split three ways.",
      startedOn: "2026-07-01",
      visibility: "public",
      invites: [{ businessId: `${P}a2`, service: "Bookkeeping" }, { businessId: `${P}t1` }],
    },
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.project.status, "active");
  assert.equal(r.data.project.yourParticipation.status, "joined");
  assert.equal(r.data.project.joinedCount, 1);
  projectId = r.data.project.id;
  ok("an L2 business creates a project and is joined to it outright");
}

{
  const r = await asker(`/projects/${projectId}/invite`, {
    method: "POST",
    body: { businessId: `${P}t0` },
  });
  assert.equal(r.status, 400, JSON.stringify(r.data));
  ok("an unclaimed (L0) listing cannot be invited — nobody is there to accept");
}

// ------------------------------------------------------- 2. private is private
{
  const r = await a3(`/projects/${projectId}`);
  // 404 rather than 403: a 403 would confirm that these particular businesses
  // are working together, which is the fact being withheld.
  assert.equal(r.status, 404, JSON.stringify(r.data));
  ok("a non-participant gets 404, never 403");
}
{
  const r = await a2(`/projects/${projectId}`);
  assert.equal(r.status, 200);
  assert.equal(r.data.project.yourParticipation.status, "invited");
  ok("an invitee can read the project before deciding");
}

// --------------------------------------------------------------- 3. joining
{
  const r = await a2(`/projects/${projectId}/join`, {
    method: "POST",
    body: { service: "Bookkeeping" },
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.project.yourParticipation.status, "joined");
  assert(r.data.project.updates.some((u) => u.type === "joined"), "a joined row on the timeline");
  ok("an L2 invitee joins and confirms the service it will be credited with");
}
{
  // L1 is the join bar — deliberately lower than the L2 needed to create.
  const r = await t1(`/projects/${projectId}/join`, {
    method: "POST",
    body: { service: "Payroll" },
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  ok("an L1 business can join even though it could not have started this");
}

// ----------------------------------------------------- 4. a decline is silent
{
  await asker(`/projects/${projectId}/invite`, { method: "POST", body: { businessId: `${P}a4` } });
  const r = await a4(`/projects/${projectId}/decline`, { method: "POST" });
  assert.equal(r.status, 200, JSON.stringify(r.data));

  const seenByPeer = await a2(`/projects/${projectId}`);
  assert(
    !seenByPeer.data.project.updates.some((u) => u.type === "declined"),
    "no declined row on the timeline",
  );
  assert(
    !seenByPeer.data.project.participants.some((p) => p.business.id === `${P}a4`),
    "a4 is invisible to a peer after declining",
  );
  const seenByCreator = await asker(`/projects/${projectId}`);
  assert(
    seenByCreator.data.project.participants.some((p) => p.business.id === `${P}a4`),
    "the creator can still see who declined",
  );
  ok("a decline is private to the creator and writes nothing to the timeline");
}

// ------------------------------------------------------------- 5. the thread
{
  const r = await a2(`/projects/${projectId}/updates`, {
    method: "POST",
    body: { body: "Trial balance is clean, moving to the SST position." },
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  ok("a joined participant posts an update");
}
{
  const r = await a3(`/projects/${projectId}/updates`, { method: "POST", body: { body: "hello" } });
  assert.equal(r.status, 404);
  ok("a non-participant cannot post (404, consistent with the read)");
}
{
  // Reading is how an invitee decides whether to join; writing is for people
  // who actually did.
  await asker(`/projects/${projectId}/invite`, { method: "POST", body: { businessId: `${P}a3` } });
  const r = await a3(`/projects/${projectId}/updates`, { method: "POST", body: { body: "hi" } });
  assert.equal(r.status, 403, JSON.stringify(r.data));
  ok("an invitee who hasn't joined can read but not write (403)");
}

// ------------------------------------------------------- 6. a leaver is not minted
{
  await asker(`/projects/${projectId}/invite`, { method: "POST", body: { businessId: `${P}a4` } });
  await a4(`/projects/${projectId}/join`, { method: "POST", body: { service: "Tax advisory" } });
  const r = await a4(`/projects/${projectId}/leave`, { method: "POST" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  ok("a joined participant can leave while the project is running");
}

// ------------------------------------------------------------ 7. the mint
const before = {
  asker: await summaryOf(`${P}asker`),
  a2: await summaryOf(`${P}a2`),
  t1: await summaryOf(`${P}t1`),
  a4: await summaryOf(`${P}a4`),
};

{
  const r = await a2(`/projects/${projectId}/complete`, { method: "POST" });
  assert.equal(r.status, 403, JSON.stringify(r.data));
  ok("only the creator can complete a project");
}

let minted;
{
  const r = await asker(`/projects/${projectId}/complete`, {
    method: "POST",
    body: { completedOn: "2026-08-01" },
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.project.status, "completed");
  // Three joined: asker (no service), a2 (Bookkeeping), t1 (Payroll).
  // asker–a2, asker–t1, a2–t1 ×2 (both declared) = 4.
  minted = r.data.mintedEngagements;
  assert.equal(minted, 4, `expected 4 minted, got ${minted}`);
  ok("completing mints one engagement per pair, and two where both sides delivered");
}

{
  const rows = (await profile(`${P}a2`)).business.engagements;
  const fromProject = rows.filter((e) => e.project?.id === projectId);
  assert.equal(fromProject.length, 3, "a2 is in three minted rows");
  assert(fromProject.every((e) => e.status === "confirmed"), "all confirmed, no pending step");
  assert(
    fromProject.every((e) => e.occurredOn.startsWith("2026-08-01")),
    "occurredOn is the completion month, floored",
  );
  ok("minted engagements are public and confirmed immediately, dated by completion");
}

// ----------------------------------------- 8. provider-only credit: THE BUG FIX
{
  const after = { asker: await summaryOf(`${P}asker`), a2: await summaryOf(`${P}a2`) };

  const a2Book = serviceIn(after.a2, "Bookkeeping");
  assert(a2Book, "a2 is credited with Bookkeeping");
  assert.equal(
    a2Book.engagements - (serviceIn(before.a2, "Bookkeeping")?.engagements ?? 0),
    2,
    "a2's Bookkeeping rows rose by two (asker and t1)",
  );

  // The asker BOUGHT the bookkeeping. Before serviceProvidedById it would now
  // be advertising Bookkeeping on its own public profile.
  assert.equal(
    serviceIn(after.asker, "Bookkeeping"),
    null,
    "the asker is NOT credited with a service it merely paid for",
  );
  // ...but it is still party to the work, and `total` says so.
  assert(after.asker.total > before.asker.total, "the asker's total still rose");
  ok("a service is credited only to the side that delivered it — while total counts both");
}

// ------------------------------------- 9. distinct counterparties still rule
{
  const a2After = await summaryOf(`${P}a2`);
  const book = serviceIn(a2After, "Bookkeeping");
  // Two rows, two DIFFERENT businesses. The anti-collusion property: breadth
  // is counted in businesses, never in rows.
  assert.equal(book.counterparties, 2, "two distinct counterparties for Bookkeeping");
  ok("breadth is still counted in distinct businesses, not rows");
}

// -------------------------------------------- 10. a leaver and an invitee are absent
{
  const a4After = await summaryOf(`${P}a4`);
  assert.equal(a4After.total, before.a4.total, "a4 left, so a4 was not minted");
  const rows = (await profile(`${P}a3`)).business.engagements;
  assert.equal(
    rows.filter((e) => e.project?.id === projectId).length,
    0,
    "a3 never joined, so a3 was not minted",
  );
  ok("someone who left, and someone who never answered, are both left out of the mint");
}

// ------------------------------------------------- 11. completing twice
{
  const totalBefore = (await summaryOf(`${P}a2`)).total;
  const r = await asker(`/projects/${projectId}/complete`, { method: "POST" });
  assert.equal(r.status, 409, JSON.stringify(r.data));
  assert.equal((await summaryOf(`${P}a2`)).total, totalBefore, "nothing minted twice");
  ok("a second complete is a 409 and mints nothing");
}

// ------------------------------------------------- 12. the race
{
  const r = await asker("/projects", {
    method: "POST",
    body: {
      title: "Concurrency check",
      startedOn: "2026-08-01",
      invites: [{ businessId: `${P}a2`, service: "Audit support" }],
    },
  });
  const raceId = r.data.project.id;
  await a2(`/projects/${raceId}/join`, { method: "POST" });

  const totalBefore = (await summaryOf(`${P}a2`)).total;
  const results = await Promise.all([
    asker(`/projects/${raceId}/complete`, { method: "POST" }),
    asker(`/projects/${raceId}/complete`, { method: "POST" }),
  ]);
  assert.equal(results.filter((x) => x.status === 200).length, 1, "exactly one winner");
  // The guard is the status predicate in the completing UPDATE's WHERE, so the
  // loser matches zero rows and throws before createMany is reached.
  assert.equal(
    (await summaryOf(`${P}a2`)).total - totalBefore,
    1,
    "exactly one row minted despite two simultaneous completes",
  );
  ok("two simultaneous completes mint exactly once");
}

// ------------------------------------- 13. too few joined, and cancelling
{
  const r = await asker("/projects", {
    method: "POST",
    body: { title: "Nobody joined this", startedOn: "2026-08-01" },
  });
  const lonelyId = r.data.project.id;
  const c = await asker(`/projects/${lonelyId}/complete`, { method: "POST" });
  assert.equal(c.status, 400, JSON.stringify(c.data));
  ok("a project with nobody else in it cannot be completed");

  const totalBefore = (await summaryOf(`${P}asker`)).total;
  const x = await asker(`/projects/${lonelyId}/cancel`, { method: "POST" });
  assert.equal(x.status, 200, JSON.stringify(x.data));
  assert.equal(x.data.project.status, "cancelled");
  assert.equal((await summaryOf(`${P}asker`)).total, totalBefore, "cancel mints nothing");

  const u = await asker(`/projects/${lonelyId}/updates`, { method: "POST", body: { body: "late" } });
  assert.equal(u.status, 409);
  ok("cancelling mints nothing and closes the project to further updates");
}

// -------------------------------------------------------------- 14. visibility
{
  // The first project was created `public`, so its shell is on both profiles.
  const shells = (await profile(`${P}a2`)).business.projects;
  const shell = shells.find((p) => p.id === projectId);
  assert(shell, "a public completed project appears on a participant's profile");
  assert.equal(shell.title, "Year-end close for a manufacturing client");
  // THE HARD PROMISE, asserted by key absence rather than by value: the thread
  // is private under every visibility, and so is the description.
  assert.equal(shell.detail, undefined, "the description is not published");
  assert.equal(shell.updates, undefined, "the thread is not published");
  assert.equal(shell.ask, undefined, "the ask link is not published");
  assert(
    shell.participants.every((p) => p.business.id !== `${P}a4`),
    "a leaver is not in the published shell",
  );
  ok("a public shell carries title, dates and participants — and no thread, detail or ask");
}
{
  // The concurrency project defaulted to `private`.
  const rows = (await profile(`${P}a2`)).business.engagements;
  const priv = rows.find((e) => e.project && e.project.visibility === "private");
  assert(priv, "a private project still put a confirmed engagement on the public profile");
  const shells = (await profile(`${P}a2`)).business.projects;
  assert(
    !shells.some((p) => p.id === priv.project.id),
    "...but its shell is not published",
  );
  ok("private publishes the work and withholds the project");
}

// ------------------------------------ 15. legacy rows keep their credit
{
  // A hand-logged engagement with no provider recorded — the shape of every
  // row written before this migration. It must still credit BOTH ends, or the
  // null-means-both rule has been "tightened" and every pre-existing profile
  // has silently lost its services.
  const r = await a3("/engagements", {
    method: "POST",
    body: { businessId: `${P}a4`, service: "Management accounts", occurredOn: "2026-06-01" },
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  await a4(`/engagements/${r.data.engagement.id}/confirm`, { method: "POST" });

  // a3 PROPOSED it, so the default names a4 — the counterparty — as provider,
  // which is what the dialog has always meant by offering the TARGET's
  // services. The assertion that matters is the negative one: a3 paid for it
  // and must not now be advertising it.
  assert(serviceIn(await summaryOf(`${P}a4`), "Management accounts"), "the provider is credited");
  assert.equal(
    serviceIn(await summaryOf(`${P}a3`), "Management accounts"),
    null,
    "the business that logged it is NOT credited with the counterparty's service",
  );
  ok("the manual path defaults the provider to the counterparty, and credits only them");
}
{
  // The other direction: the logger did the work themselves and says so.
  const r = await a3("/engagements", {
    method: "POST",
    body: {
      businessId: `${P}a4`,
      service: "Transfer pricing documentation",
      occurredOn: "2026-06-01",
      serviceProvidedById: `${P}a3`,
    },
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  await a4(`/engagements/${r.data.engagement.id}/confirm`, { method: "POST" });
  assert(serviceIn(await summaryOf(`${P}a3`), "Transfer pricing documentation"), "credited");
  assert.equal(serviceIn(await summaryOf(`${P}a4`), "Transfer pricing documentation"), null);
  ok("a logger who delivered the work can say so, and is credited instead");
}
{
  // Never a third business.
  const r = await a3("/engagements", {
    method: "POST",
    body: {
      businessId: `${P}a4`,
      service: "Payroll",
      occurredOn: "2026-06-01",
      serviceProvidedById: `${P}a2`,
    },
  });
  assert.equal(r.status, 400, JSON.stringify(r.data));
  ok("a third business cannot be named as the provider");
}
{
  // Now force a genuinely null-provider row, exactly as a pre-migration row is.
  const db2 = new PrismaClient({ datasourceUrl: url });
  const row = await db2.engagement.create({
    data: {
      businessAId: `${P}a2` < `${P}a3` ? `${P}a2` : `${P}a3`,
      businessBId: `${P}a2` < `${P}a3` ? `${P}a3` : `${P}a2`,
      proposedById: `${P}a2`,
      service: "Cash flow & budgeting",
      serviceProvidedById: null,
      status: "confirmed",
      confirmedAt: new Date(),
      occurredOn: new Date(Date.UTC(2026, 4, 1)),
    },
  });
  await db2.$disconnect();

  assert(serviceIn(await summaryOf(`${P}a2`), "Cash flow & budgeting"), "credited to one end");
  assert(serviceIn(await summaryOf(`${P}a3`), "Cash flow & budgeting"), "and to the other");
  assert(row.id);
  ok("a row with NO recorded provider is still credited to both ends — do not tighten this");
}

// ------------------------------- 15b. the ask knows what it turned into
{
  // THE BRIDGE MUST BE TWO-WAY. It was not: a project recorded the ask it came
  // from and the ask said nothing back, so a member who started one and came
  // back found the same "Start a project" button with no route to what they had
  // already made — and pressed it again. This asserts the return leg.
  const made = await asker("/projects", {
    method: "POST",
    body: {
      title: "From an ask",
      startedOn: "2026-08-01",
      askId: askIdForBridge,
      invites: [{ businessId: `${P}a2` }],
    },
  });
  assert.equal(made.status, 201, JSON.stringify(made.data));

  const seen = await asker(`/asks/${askIdForBridge}`);
  const ids = (seen.data.ask.yourProjects ?? []).map((p) => p.id);
  assert(ids.includes(made.data.project.id), "the ask lists the project it produced");

  // ...and ONLY to people on it. A project is private by default while an ask
  // is readable by every member, so leaking this list would announce which
  // businesses are working together to the whole board.
  const stranger = await a3(`/asks/${askIdForBridge}`);
  assert.equal(
    (stranger.data.ask.yourProjects ?? []).length,
    0,
    "a member not on the project sees none of it from the ask",
  );
  ok("an ask shows the projects it produced — to its participants only");
}

// ----------------------------------------- 16. a participant owns their own service
{
  const r = await asker("/projects", {
    method: "POST",
    body: {
      title: "Whose service is it",
      startedOn: "2026-08-01",
      invites: [{ businessId: `${P}a2`, service: "Audit support" }],
    },
  });
  const pid = r.data.project.id;
  // The invitee corrects what the invite proposed. This is the moment that
  // makes auto-minting defensible: what lands on a2's profile is a2's word.
  await a2(`/projects/${pid}/join`, { method: "POST", body: { service: "Tax appeals & disputes" } });
  const after = await a2(`/projects/${pid}`);
  assert.equal(after.data.project.yourParticipation.serviceProvided, "Tax appeals & disputes");

  // And the creator has no route to change it.
  const patch = await asker(`/projects/${pid}/participation`, {
    method: "PATCH",
    body: { service: "Bookkeeping" },
  });
  // The creator's OWN row is what PATCH touches — never a2's.
  assert.equal(patch.status, 200);
  const seen = await a2(`/projects/${pid}`);
  assert.equal(seen.data.project.yourParticipation.serviceProvided, "Tax appeals & disputes");
  ok("a participant's service is theirs alone — the creator cannot set it for them");
}

// -------------------------- 16a. a project starts when somebody ACCEPTS
{
  const r = await asker("/projects", {
    method: "POST",
    body: {
      title: "Nobody here yet",
      startedOn: "2026-08-01",
      invites: [{ businessId: `${P}a2` }],
    },
  });
  const id = r.data.project.id;
  assert.equal(r.data.project.hasStarted, false, "an unaccepted project has not started");

  // Creating a project is an INVITATION, not a start. Until a second business
  // accepts there is nobody to post to, and the thread is the record of joint
  // work — `status: active` only ever meant "not yet finished".
  const early = await asker(`/projects/${id}/updates`, { method: "POST", body: { body: "hello?" } });
  assert.equal(early.status, 409, JSON.stringify(early.data));

  // Declining ENDS the relationship rather than postponing it: the row stays
  // so a re-invite can revive it, but every read goes with it. Before this a
  // business that said no kept a permanent window onto the thread, including
  // everything written after they turned it down.
  await a2(`/projects/${id}/decline`, { method: "POST" });
  const afterDecline = await a2(`/projects/${id}`);
  assert.equal(afterDecline.status, 404, "a business that declined can no longer read it");

  // ...and still cannot post, because nobody joined.
  const stillEarly = await asker(`/projects/${id}/updates`, { method: "POST", body: { body: "?" } });
  assert.equal(stillEarly.status, 409);

  // Re-inviting revives the row in place, and access comes back with it.
  await asker(`/projects/${id}/invite`, { method: "POST", body: { businessId: `${P}a2` } });
  assert.equal((await a2(`/projects/${id}`)).status, 200, "a re-invite restores the read");

  await a2(`/projects/${id}/join`, { method: "POST" });
  const started = await asker(`/projects/${id}`);
  assert.equal(started.data.project.hasStarted, true, "one acceptance starts it");
  const now = await asker(`/projects/${id}/updates`, { method: "POST", body: { body: "under way" } });
  assert.equal(now.status, 201, JSON.stringify(now.data));

  ok("a project starts when somebody accepts — and declining ends the decliner's access");
}

// ------------------------------------------- 16b. deleting a project
{
  const r = await asker("/projects", {
    method: "POST",
    body: {
      title: "Started by accident",
      startedOn: "2026-08-01",
      invites: [{ businessId: `${P}a2` }],
    },
  });
  const id = r.data.project.id;

  // Not the invitee's to delete, even before they answer.
  const byOther = await a2(`/projects/${id}`, { method: "DELETE" });
  assert.equal(byOther.status, 403, JSON.stringify(byOther.data));

  const gone = await asker(`/projects/${id}`, { method: "DELETE" });
  assert.equal(gone.status, 200, JSON.stringify(gone.data));

  // 404, not an empty shell: the row and everything hanging off it are gone.
  const after = await asker(`/projects/${id}`);
  assert.equal(after.status, 404);

  const db3 = new PrismaClient({ datasourceUrl: url });
  assert.equal(await db3.projectParticipant.count({ where: { projectId: id } }), 0, "participants gone");
  assert.equal(await db3.projectUpdate.count({ where: { projectId: id } }), 0, "timeline gone");
  await db3.$disconnect();
  ok("the creator can delete a project that never finished, and it takes everything with it");
}
{
  // THE RULE THIS ROUTE EXISTS AROUND. The first project's minted rows are on
  // two businesses' public profiles — deleting it would let one party erase
  // the other's trust record.
  const r = await asker(`/projects/${projectId}`, { method: "DELETE" });
  assert.equal(r.status, 409, JSON.stringify(r.data));

  const rows = (await profile(`${P}a2`)).business.engagements;
  assert(
    rows.some((e) => e.project?.id === projectId),
    "the work record survived the refused delete",
  );
  ok("a finished project cannot be deleted — its work record is not the creator's to erase");
}

// --------------------------------------------- 17. a bad service is refused
{
  const r = await asker("/projects", {
    method: "POST",
    body: { title: "Nope", startedOn: "2026-08-01", service: "Vibes consulting" },
  });
  assert.equal(r.status, 400, JSON.stringify(r.data));
  ok("a service outside the catalogue is refused at the door");
}
{
  const r = await asker("/projects", {
    method: "POST",
    body: { title: "Future work", startedOn: "2099-01-01" },
  });
  assert.equal(r.status, 400, JSON.stringify(r.data));
  ok("a project cannot have started in a month that hasn't happened");
}

console.log(`\n${pass} checks passed.`);
