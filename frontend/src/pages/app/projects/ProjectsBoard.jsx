import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowUpRight, Filter, FolderKanban } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ProjectDialog } from "@/components/app/ProjectDialog";
import { useAuth } from "@/context/AuthContext";
import { fetchProject, fetchProjects } from "@/lib/api/projects";
import { PROJECT_CREATE_VERIFICATION_LEVELS } from "@/lib/verificationLevels";
import {
  Empty,
  PageHeader,
  ParticipantRow,
  Period,
  ProjectRowCard,
  StatusPill,
  VisibilityPill,
} from "./ProjectCard";
import { ProjectTimeline } from "./ProjectTimeline";

// The same split shell as AsksBoard, duplicated rather than shared for the
// reason stated at the top of ProjectCard.jsx. Selection lives in the URL
// (?selected=) for the same reasons it does there.

// SPLIT BY ROLE, NOT BY STATE — and the difference matters, because it is the
// one cut that actually changes what a member does on the screen.
//
// A project you STARTED is one you run: you invite, you chase, you decide when
// it is finished. A project you were invited INTO is one you report in on: you
// post updates and you deliver. Those are the permissions routes/projects.js
// already enforces — creator-only for invite/complete/cancel/delete, joined-only
// for updates — and the board was the last place still treating them alike.
//
// WHY NOT SPLIT BY STATE AS WELL. It reads like a 2x2 and collapses to three:
// "active" means the same thing on both sides, so tabbing it twice makes you
// read two lists to answer one question. State is a LINE ON EACH ROW, which is
// where it belongs — a member scanning five projects reads five words, not two
// tabs.
const TABS = ["running", "in"];

const TAB_LABEL = {
  running: "You're running",
  in: "You're in",
};

// TWO CONTROLS, TWO AXES, and neither one doing the other's job. The tabs say
// WHOSE project this is — a role, which decides what you can do with it. The
// pills say WHAT STATE it is in. Mixing them is what made an earlier cut
// nonsense: "Closed" was a tab, so a finished project you ran and one you were
// invited into landed in the same place and lost the role distinction the tabs
// exist for.
//
// Same shape the Requests board already uses — tabs, then filter pills under
// them — so this is a pattern a member has met before rather than a new one.
//
// "Needs you" leads and is DELIBERATELY NOT a stateBucketOf bucket. The four
// below are a mutually exclusive partition of state; this one cuts across them
// — an unanswered invite is also "awaiting" — and a filter is a view, not a
// partition. Keeping it out of the bucket function is what stops the partition
// from having to stop being one.
const STATE_FILTERS = [
  { value: "needs-you", label: "Needs you" },
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "awaiting", label: "Awaiting" },
  { value: "closed", label: "Closed" },
];

// Whose it is. A closed project still has an owner, which is exactly why this
// is independent of the state below.
function roleOf(project) {
  return project.createdByYou ? "running" : "in";
}

// What state it is in, from this reader's side. "awaiting" means the same thing
// in both tabs — nothing has started — while WHO is being waited on differs,
// and that is what stateOf spells out on the row.
function stateBucketOf(project) {
  const yours = project.yourParticipation?.status;
  if (project.status !== "active" || yours === "left") return "closed";
  if (yours === "invited" || !project.hasStarted) return "awaiting";
  return "active";
}

// How long ago, in the fewest honest words. Its own copy rather than the one in
// AskCard.jsx or FeedCard.jsx, which are themselves duplicates of each other on
// purpose — see the note at the top of ProjectCard.jsx.
//
// Math.floor, not ceil: this measures elapsed time, and "3 days" must not
// become "4 days" the moment the clock passes a boundary. AskCard's deadlineText
// ceils because it counts the other way, toward a deadline.
function since(date) {
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

// The state, in the words a member would use, from THEIR side of it. The same
// project is "waiting for Magnate My to accept" to the business that started it
// and "waiting for your answer" to the business that has not — one fact, two
// readings, and only the reader's one is useful.
//
// HOW LONG is folded into the words rather than shown as a badge or a colour,
// which is the treatment AskCard's Deadline uses for the same job. It is a
// FACT, never a judgement: nothing here decides a project is late, because
// nobody has agreed a date for it to be late against. The moment due dates are
// set and accepted by both sides, THAT is what an alert should read from — not
// a threshold invented here.
function stateOf(project) {
  const yours = project.yourParticipation?.status;
  if (project.status === "completed") return { text: "Finished", urgent: false };
  if (project.status === "cancelled") return { text: "Cancelled", urgent: false };
  if (yours === "left") return { text: "You left this", urgent: false };
  if (yours === "invited") {
    // The only producer of `urgent` in this file, and it stays that way: an
    // unanswered invite is a decision this member owes, which is the one thing
    // on this screen that is unambiguously theirs to clear.
    return {
      text: `Waiting for your answer · ${since(project.yourParticipation.invitedAt)}`,
      urgent: true,
    };
  }
  if (project.hasStarted) {
    // lastActionAt is bumped by every write including a posted update, so this
    // really is "how long since anything happened here".
    return { text: `Active · last update ${since(project.lastActionAt)} ago`, urgent: false };
  }

  const waiting = project.participants.filter((p) => p.status === "invited");
  if (waiting.length === 0) return { text: "Nobody joined yet", urgent: false };
  // The oldest outstanding invite, because that is the one worth chasing.
  const oldest = waiting.reduce((a, b) =>
    new Date(a.invitedAt) < new Date(b.invitedAt) ? a : b,
  );
  const who =
    waiting.length === 1
      ? waiting[0].business.name
      : `${waiting.length} businesses`;
  return { text: `Waiting for ${who} to accept · ${since(oldest.invitedAt)}`, urgent: false };
}

// The filter pill, the same shape the Requests board uses for its own filters.
// Its own copy rather than an import, per the duplication note at the top of
// ProjectCard.jsx.
function FilterPill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:border-foreground/30"
      }`}
    >
      {children}
    </button>
  );
}

function ProjectsBoard() {
  const { business } = useAuth();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const tab = TABS.includes(params.get("tab")) ? params.get("tab") : "running";
  const stateFilter = STATE_FILTERS.some((f) => f.value === params.get("state"))
    ? params.get("state")
    : "all";
  const selectedId = params.get("selected") ?? "";

  const [loaded, setLoaded] = useState({ projects: [], error: null, key: null });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [detail, setDetail] = useState({ project: null, forId: null });

  // Deliberately NOT keyed on the tab: one read holds every project the member
  // is party to, and switching tabs is a filter rather than a request. That is
  // what lets all four tabs show a count at once — the old per-tab fetch only
  // knew the count of the tab you were already looking at.
  const key = `${reloadToken}`;

  useEffect(() => {
    let cancelled = false;
    fetchProjects()
      .then((projects) => {
        if (!cancelled) setLoaded({ projects, error: null, key });
      })
      .catch((err) => {
        if (!cancelled) setLoaded({ projects: [], error: err.message, key });
      });

    return () => {
      cancelled = true;
    };
  }, [key]);

  const loading = loaded.key !== key;
  const all = loaded.projects;
  // Counted UNDER THE CURRENT FILTER, so the number on a tab is always the
  // length of the list you would see if you clicked it. A tab counting
  // everything while the list shows a filtered subset is a number that lies
  // the moment a filter is on.
  const matchesState = (p) =>
    stateFilter === "all" ||
    (stateFilter === "needs-you" ? stateOf(p).urgent : stateBucketOf(p) === stateFilter);
  const counts = TABS.reduce((acc, t) => ({ ...acc, [t]: 0 }), {});
  for (const p of all) if (matchesState(p)) counts[roleOf(p)] += 1;
  // DELIBERATELY IGNORES THE FILTER, which is the whole point of it. Urgency
  // used to live only inside a tab — sorted to the top with a dot on the row —
  // so an invite sitting in "You're in" was invisible while you stood on
  // "You're running". If this respected the filter, switching to Closed would
  // hide the dot and defeat it again.
  const urgentByRole = TABS.reduce((acc, t) => ({ ...acc, [t]: 0 }), {});
  for (const p of all) if (stateOf(p).urgent) urgentByRole[roleOf(p)] += 1;
  const projects = all
    .filter((p) => roleOf(p) === tab && matchesState(p))
    // Anything owing YOU a move floats, then most recently touched. Sorting
    // rather than tabbing is what keeps the urgent case visible without giving
    // it a tab of its own — it already has one, in the Inbox.
    .sort((a, b) => {
      const urgency = Number(stateOf(b).urgent) - Number(stateOf(a).urgent);
      if (urgency !== 0) return urgency;
      return new Date(b.lastActionAt) - new Date(a.lastActionAt);
    });
  const selectionIsStale = selectedId && !projects.some((p) => p.id === selectedId);

  useEffect(() => {
    if (loading || projects.length === 0) return;
    if (selectedId && !selectionIsStale) return;
    const next = new URLSearchParams(params);
    next.set("selected", projects[0].id);
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, projects, selectedId, selectionIsStale]);

  // The list payload carries no timeline (PROJECT_INCLUDE vs
  // PROJECT_DETAIL_INCLUDE on the server), so the pane needs its own read.
  useEffect(() => {
    if (!selectedId) return undefined;
    let cancelled = false;
    fetchProject(selectedId)
      .then((project) => {
        if (!cancelled) setDetail({ project, forId: selectedId });
      })
      .catch(() => {
        if (!cancelled) setDetail({ project: null, forId: selectedId });
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, reloadToken]);

  function setParam(name, value) {
    const next = new URLSearchParams(params);
    if (!value || (name === "tab" && value === "running") || (name === "state" && value === "all"))
      next.delete(name);
    else next.set(name, value);
    if (name !== "selected") next.delete("selected");
    setParams(next, { replace: true });
  }

  const canCreate =
    business && PROJECT_CREATE_VERIFICATION_LEVELS.has(business.verificationLevel);
  const paneProject = detail.forId === selectedId ? detail.project : null;

  function renderEmpty() {
    if (loading) return <Empty>Loading projects…</Empty>;
    if (loaded.error) return <Empty>Couldn't load your projects. Refresh to try again.</Empty>;

    // FILTERED-TO-EMPTY AND GENUINELY EMPTY ARE DIFFERENT FACTS, and a member
    // who has three projects but no closed ones must not read "you haven't
    // started one yet". Same distinction the Requests board draws.
    if (stateFilter !== "all") {
      const inThisTab = all.filter((p) => roleOf(p) === tab).length;
      const label = STATE_FILTERS.find((f) => f.value === stateFilter).label.toLowerCase();
      return (
        <Empty icon={Filter}>
          {inThisTab > 0
            ? `Nothing ${label} here right now.`
            : tab === "running"
              ? "You haven't started a project yet."
              : "You're not on anyone else's project yet."}
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={() => setParam("state", "all")}>
              Show all
            </Button>
          </div>
        </Empty>
      );
    }

    if (tab === "in") {
      return (
        <Empty icon={FolderKanban}>
          You&rsquo;re not on anyone else&rsquo;s project yet. When a business invites you onto one,
          it lands here — and in your Inbox.
        </Empty>
      );
    }
    return (
      <Empty icon={FolderKanban}>
        You haven&rsquo;t started one yet. Start a project when you&rsquo;re working with another
        business: you run it, and when you finish it the work lands on both your profiles as a
        confirmed engagement.
      </Empty>
    );
  }

  function renderPane() {
    if (!paneProject) {
      return (
        <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border p-12 text-center">
          <div className="text-sm text-muted-foreground">
            <FolderKanban className="mx-auto h-8 w-8" />
            <p className="mt-3">Pick a project on the left.</p>
          </div>
        </div>
      );
    }

    const p = paneProject;
    const state = { from: "/app/projects", label: "Back to projects" };

    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{p.title}</h1>
        <div className="mt-1.5 text-sm text-muted-foreground">
          {p.createdByYou ? "You started this" : `Started by ${p.createdBy.name}`} ·{" "}
          <Period project={p} />
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          <StatusPill status={p.status} hasStarted={p.hasStarted} />
          <VisibilityPill visibility={p.visibility} />
        </div>
        {/* The same sentence the row carries, spelled out once more here —
            the pane is what a member reads before deciding to open the project,
            and "Waiting to start" alone does not say who it is waiting on. */}
        <p className="mt-2 text-sm text-muted-foreground">{stateOf(p).text}</p>

        <div className="mt-5">
          <Button
            render={<Link to={`/app/projects/${p.id}`} state={state} />}
            nativeButton={false}
          >
            {p.yourParticipation?.status === "invited" ? "Answer this invite" : "Open project"}
            <ArrowUpRight className="h-4 w-4" />
          </Button>
        </div>

        {p.detail && (
          <div className="mt-6 border-t border-border pt-6">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">About</h2>
            <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{p.detail}</p>
          </div>
        )}

        <div className="mt-6 border-t border-border pt-6">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">Who's on it</h2>
          <div className="mt-1 divide-y divide-border">
            {p.participants.map((participant) => (
              <ParticipantRow
                key={participant.id}
                participant={participant}
                isYou={participant.business.id === business?.id}
              />
            ))}
          </div>
        </div>

        {p.updates?.length > 0 && (
          <div className="mt-6 border-t border-border pt-6">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">How it's going</h2>
            <ProjectTimeline updates={p.updates.slice(-4)} />
          </div>
        )}
      </div>
    );
  }

  function renderSplit() {
    if (loading || loaded.error || projects.length === 0) return renderEmpty();

    return (
      <div className="mt-4 lg:grid lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:items-start lg:gap-6">
        <div className="overflow-hidden rounded-2xl border border-border bg-card lg:sticky lg:top-6 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto">
          <div className="border-b border-border px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {projects.length} {projects.length === 1 ? "project" : "projects"}
          </div>
          {projects.map((project) => (
            <ProjectRowCard
              key={project.id}
              project={project}
              state={stateOf(project)}
              selected={project.id === selectedId}
              onSelect={() => setParam("selected", project.id)}
            />
          ))}
        </div>

        <div className="hidden lg:block lg:sticky lg:top-6 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto">
          {renderPane()}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <PageHeader
        title="Projects"
        action={
          <div className="text-right">
            {/* A verification gate, not a plan gate — so no upgrade prompt.
                Same treatment the Post an ask button gets. */}
            <Button onClick={() => setDialogOpen(true)} disabled={!canCreate}>
              Start a project
            </Button>
            {!canCreate && (
              <p className="mt-2 max-w-56 text-xs text-muted-foreground">
                Starting a project unlocks once your business is SSM-verified. You can still be
                invited to one.{" "}
                <a className="underline underline-offset-2" href="/app/verify">
                  Get verified
                </a>
              </p>
            )}
          </div>
        }
      >
        Work you're doing with other businesses. Finish one and it writes itself onto everyone's
        profile as confirmed work — which is the part nobody can make up.
      </PageHeader>

      <Tabs value={tab} onValueChange={(v) => setParam("tab", v)} className="mt-8">
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t} value={t}>
              {TAB_LABEL[t]}
              {/* The count on every tab, always — the thing the per-tab fetch
                  could not do. A zero is shown rather than hidden: a tab that
                  appears only when it is non-empty makes the row jump about. */}
              <span className="ml-1.5 text-xs text-muted-foreground">{counts[t]}</span>
              {/* The same 6px dot the row uses, not the accent chip the sidebar
                  and Inbox use — those mean "work owed" in the one place that
                  counts it, and bg-accent/10 is already spoken for here as the
                  selected-row wash. Reusing the row's mark keeps this to five
                  attention patterns rather than six. */}
              {urgentByRole[t] > 0 && (
                <span
                  aria-label={`${urgentByRole[t]} needing you`}
                  className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-foreground align-middle"
                />
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map((t) => (
          <TabsContent key={t} value={t} className="mt-6">
            <div className="flex flex-wrap gap-2">
              {STATE_FILTERS.map((f) => (
                <FilterPill
                  key={f.value}
                  active={stateFilter === f.value}
                  onClick={() => setParam("state", f.value)}
                >
                  {f.label}
                </FilterPill>
              ))}
            </div>
            {renderSplit()}
          </TabsContent>
        ))}
      </Tabs>

      <ProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={(project) => {
          // Land ON the thing you just made, the way the bridge from a request
          // does. Bouncing back to a tab meant guessing which one — and a new
          // project belongs to "Waiting to start", not "Active", which is
          // exactly the bucket confusion this screen was fixed for.
          setReloadToken((n) => n + 1);
          navigate(`/app/projects/${project.id}`, {
            state: { from: "/app/projects", label: "Back to projects" },
          });
        }}
      />
    </div>
  );
}

export { ProjectsBoard };
