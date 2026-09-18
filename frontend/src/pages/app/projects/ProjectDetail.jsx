import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Trash2, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationsContext";
import { fetchServiceCatalogue } from "@/lib/api/serviceCatalogue";
import { fetchBusinesses } from "@/lib/api/businesses";
import {
  cancelProject,
  completeProject,
  deleteProject,
  declineProject,
  fetchProject,
  inviteToProject,
  joinProject,
  leaveProject,
  postProjectUpdate,
} from "@/lib/api/projects";
import { toast } from "@/lib/toast";
import { Empty, ParticipantRow, Period, StatusPill, VisibilityPill } from "./ProjectCard";
import { ProjectTimeline } from "./ProjectTimeline";

// The full project. Every write lives here — the board's pane deliberately only
// reads, so there is one place that has to get reconciliation right.
//
// max-w-5xl matches AskDetail and BusinessProfile.

function Section({ title, children, action }) {
  return (
    <section className="mt-8 border-t border-border pt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

// The invitee's decision, and the one moment that makes auto-minting honest:
// joining is where a business settles what it will be publicly credited with.
function InviteBar({ project, onJoin, onDecline, busy }) {
  const { business } = useAuth();
  const [service, setService] = useState(project.yourParticipation?.serviceProvided ?? null);
  const [catalogue, setCatalogue] = useState(null);

  useEffect(() => {
    if (!business?.category) return undefined;
    let live = true;
    fetchServiceCatalogue(business.category)
      .then((data) => {
        if (live) setCatalogue({ forCategory: business.category, ...data });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [business?.category]);

  const ready = catalogue?.forCategory === business?.category;

  return (
    <div className="mt-6 rounded-2xl border border-foreground/30 bg-accent/10 p-5">
      <h2 className="text-sm font-semibold text-foreground">
        {project.createdBy.name} invited you onto this project
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        If you join, what you pick below is what gets confirmed on your profile when the project
        finishes. Nobody else can change it.
      </p>

      {ready && catalogue.services?.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {catalogue.services.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setService(service === option ? null : option)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                service === option
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:border-foreground/30"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Leave it blank if you're the client on this one — you'll still get the work record.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => onJoin(service)} disabled={busy}>
          Join the project
        </Button>
        <Button variant="ghost" onClick={onDecline} disabled={busy}>
          No thanks
        </Button>
      </div>
    </div>
  );
}

function InviteSomeone({ onInvited, busy }) {
  const { business } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState({ forQuery: null, rows: [] });

  // Keyed by the query rather than cleared in the effect — see the same note in
  // ProjectDialog. Clearing here is the cascading-render case the lint rule
  // flags, and the key does the job better anyway.
  useEffect(() => {
    if (!open) return undefined;
    const q = query.trim();
    if (q.length < 2) return undefined;
    let live = true;
    const timer = setTimeout(() => {
      fetchBusinesses({ search: q, limit: 8 })
        .then((rows) => {
          if (live) setResults({ forQuery: q, rows });
        })
        .catch(() => {});
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [open, query]);

  const visibleResults =
    results.forQuery === query.trim()
      ? results.rows
          .filter((b) => b.id !== business?.id && b.verificationLevel !== "L0")
          .slice(0, 6)
      : [];

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <UserPlus className="h-3.5 w-3.5" /> Invite a business
      </Button>
    );
  }

  return (
    <div className="w-full">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search the directory…"
        autoFocus
      />
      {visibleResults.length > 0 && (
        <div className="mt-2 overflow-hidden rounded-xl border border-border">
          {visibleResults.map((b) => (
            <button
              key={b.id}
              type="button"
              disabled={busy}
              onClick={() => {
                onInvited(b.id);
                setOpen(false);
                setQuery("");
              }}
              className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-accent/10"
            >
              <span className="text-sm font-medium text-foreground">{b.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {b.category} · {b.location}
              </span>
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="mt-2 text-xs text-muted-foreground underline underline-offset-2"
      >
        Cancel
      </button>
    </div>
  );
}

// Completing is the only irreversible thing on this screen, so it asks once and
// says exactly what it will write. "Complete" on its own would be a button that
// silently publishes to several businesses' profiles.
function CompleteBar({ project, onComplete, busy }) {
  const [confirming, setConfirming] = useState(false);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const others = project.participants.filter(
    (p) => p.status === "joined" && p.business.id !== project.createdBy.id,
  ).length;

  if (!confirming) {
    return (
      <Button onClick={() => setConfirming(true)} disabled={busy || project.joinedCount < 2}>
        <Check className="h-4 w-4" /> Mark it finished
      </Button>
    );
  }

  return (
    <div className="w-full rounded-2xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground">Finish this project?</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        This writes a confirmed work record between you and{" "}
        {others === 1 ? "the other business" : `each of the other ${others} businesses`}. It
        appears on everyone's public profile and can't be undone.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Finished in
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            max={new Date().toISOString().slice(0, 7)}
            className="mt-1.5 block rounded-md border border-border bg-background px-3 py-2 text-sm normal-case tracking-normal text-foreground"
          />
        </label>
        <Button onClick={() => onComplete(month)} disabled={busy}>
          Write the work record
        </Button>
        <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
          Not yet
        </Button>
      </div>
    </div>
  );
}

// Deleting asks once, like completing does, because both are irreversible —
// but this one is the opposite kind of irreversible: completing writes a record
// everyone keeps, deleting throws away a conversation the other participants
// may have written in.
//
// It is absent entirely on a finished project. The server refuses one (409),
// and a button that exists only to explain why it cannot be pressed is worse
// than no button — the section below says so in a sentence instead.
function DeleteBar({ project, onDelete, busy }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button variant="ghost" onClick={() => setConfirming(true)} disabled={busy}>
        <Trash2 className="h-4 w-4" /> Delete this project
      </Button>
    );
  }

  const others = project.participants.filter((p) => p.business.id !== project.createdBy.id).length;

  return (
    <div className="w-full rounded-2xl border border-destructive/40 bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground">Delete this project?</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Everything here goes — the updates, and{" "}
        {others === 1 ? "the business you invited" : `the ${others} businesses you invited`}. Nothing
        has been written to anyone&rsquo;s work record yet, so there is nothing to take back. This
        cannot be undone.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="destructive" onClick={onDelete} disabled={busy}>
          Delete it
        </Button>
        <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
          Keep it
        </Button>
      </div>
    </div>
  );
}

function ProjectDetail() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { business, refreshAccount } = useAuth();
  const { refreshProjectActions } = useNotifications();

  const [project, setProject] = useState(null);
  const [loadedId, setLoadedId] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchProject(id)
      .then((p) => {
        if (cancelled) return;
        setProject(p);
        setError(null);
        setLoadedId(id);
      })
      .catch((err) => {
        if (cancelled) return;
        setProject(null);
        setError(err.message);
        setLoadedId(id);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const status = loadedId !== id ? "loading" : error ? "error" : "ready";
  const backTo = location.state?.from ?? "/app/projects";
  const backLabel = location.state?.label ?? "Back to projects";

  // One wrapper for every mutation: the server hands back the whole project, so
  // nothing here has to patch state by hand and nothing can drift from it.
  async function run(action, message) {
    setBusy(true);
    try {
      const next = await action();
      if (next) setProject(next);
      if (message) toast.success(message);
      refreshProjectActions?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Empty>Loading…</Empty>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Link to={backTo} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> {backLabel}
        </Link>
        <Empty>{error}</Empty>
      </div>
    );
  }

  const you = project.yourParticipation;
  const isCreator = project.createdByYou;
  const isJoined = you?.status === "joined";
  const isActive = project.status === "active";
  // Named rather than counted: "waiting for Magnate My" is a different
  // sentence from "waiting for 1 business", and only one of them tells you
  // whom to chase.
  const waitingOn = project.participants
    .filter((p) => p.status === "invited")
    .map((p) => p.business.name);
  // Everyone turned it down and nobody is still deciding. Without this the
  // project sits in Active forever: it can never be completed (that needs two
  // joined) and nothing here expires.
  const strandedNoOne = isActive && !project.hasStarted && waitingOn.length === 0;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link
        to={backTo}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {backLabel}
      </Link>

      <div className="mt-6">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          {project.title}
        </h1>
        <div className="mt-2 text-sm text-muted-foreground">
          {isCreator ? "You started this" : `Started by ${project.createdBy.name}`} ·{" "}
          <Period project={project} />
          {project.ask && (
            <>
              {" · from the request "}
              <Link
                to={`/app/requests/${project.ask.id}`}
                className="underline underline-offset-2"
              >
                {project.ask.title}
              </Link>
            </>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <StatusPill status={project.status} hasStarted={project.hasStarted} />
          <VisibilityPill visibility={project.visibility} />
        </div>
      </div>

      {you?.status === "invited" && isActive && (
        <InviteBar
          project={project}
          busy={busy}
          onJoin={(service) =>
            run(
              () => joinProject(project.id, { service }),
              "You're on the project.",
            ).then(refreshAccount)
          }
          onDecline={() => run(() => declineProject(project.id), "Invite declined.")}
        />
      )}

      {project.detail && (
        <Section title="About">
          <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{project.detail}</p>
        </Section>
      )}

      <Section
        title="Who's on it"
        action={
          isCreator && isActive ? (
            <InviteSomeone
              busy={busy}
              onInvited={(businessId) =>
                run(() => inviteToProject(project.id, { businessId }), "Invite sent.")
              }
            />
          ) : null
        }
      >
        <div className="mt-1 divide-y divide-border">
          {project.participants.map((participant) => (
            <ParticipantRow
              key={participant.id}
              participant={participant}
              isYou={participant.business.id === business?.id}
            />
          ))}
        </div>
      </Section>

      <Section title="How it's going">
        {project.updates?.length > 0 ? (
          <ProjectTimeline updates={project.updates} />
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Nothing posted yet.</p>
        )}

        {/* THE COMPOSER ONLY EXISTS ONCE SOMEBODY HAS ACCEPTED. Creating a
            project is an invitation, not a start, and a box inviting you to
            write to a thread with no second reader is the screen telling you
            something has begun when it has not. The server refuses the same
            case with a 409 — this is the half that stops you reaching for it. */}
        {isJoined && isActive && !project.hasStarted && (
          <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
            {waitingOn.length > 0
              ? `Waiting for ${waitingOn.join(" and ")} to accept. Updates open up once somebody joins.`
              : "Nobody has joined yet. Invite a business and the thread opens up once they accept."}
          </p>
        )}

        {isJoined && isActive && project.hasStarted && (
          <div className="mt-4">
            {/* Inline, not a dialog: a modal over the thread hides the thread
                you're replying to — the same call AnswerComposer makes. */}
            <Textarea
              rows={3}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="What's happened since?"
              maxLength={1000}
            />
            <div className="mt-2 flex justify-end">
              <Button
                size="sm"
                disabled={busy || !draft.trim()}
                onClick={() =>
                  run(() => postProjectUpdate(project.id, draft.trim())).then(() => setDraft(""))
                }
              >
                Post update
              </Button>
            </div>
          </div>
        )}
      </Section>

      {isActive && (isCreator || isJoined) && (
        <Section title="Finishing up">
          <div className="mt-3 flex flex-wrap items-start gap-2">
            {isCreator ? (
              <>
                <CompleteBar
                  project={project}
                  busy={busy}
                  onComplete={(month) =>
                    run(async () => {
                      const { project: next, mintedEngagements } = await completeProject(
                        project.id,
                        { completedOn: `${month}-01T00:00:00.000Z` },
                      );
                      toast.success(
                        `Done — ${mintedEngagements} confirmed ${
                          mintedEngagements === 1 ? "engagement" : "engagements"
                        } written to the work record.`,
                      );
                      return next;
                    }).then(refreshAccount)
                  }
                />
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => run(() => cancelProject(project.id), "Project cancelled.")}
                >
                  Cancel the project
                </Button>
                <DeleteBar
                  project={project}
                  busy={busy}
                  onDelete={async () => {
                    setBusy(true);
                    try {
                      await deleteProject(project.id);
                      toast.success("Project deleted.");
                      refreshProjectActions?.();
                      // Navigate rather than re-render: the thing this screen
                      // is about no longer exists, so staying would refetch a
                      // 404 and show the error state for a row the member
                      // deliberately removed.
                      navigate("/app/projects", { replace: true });
                    } catch (err) {
                      toast.error(err.message);
                      setBusy(false);
                    }
                  }}
                />
              </>
            ) : (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => run(() => leaveProject(project.id), "You've left the project.")}
              >
                Leave the project
              </Button>
            )}
          </div>
          {/* THE DEAD END, NAMED. Everyone declined and nobody is still
              deciding, so this project can never be completed — that needs two
              joined — and nothing here expires. Left unsaid it just sits in
              Active forever with a disabled button and no explanation. */}
          {isCreator && strandedNoOne && (
            <p className="mt-2 text-xs text-muted-foreground">
              Nobody joined this one. Invite another business, or delete it — it can&rsquo;t be
              finished with only you on it.
            </p>
          )}
          {isCreator && !strandedNoOne && project.joinedCount < 2 && (
            <p className="mt-2 text-xs text-muted-foreground">
              At least one other business has to join before you can finish this.
            </p>
          )}
        </Section>
      )}

      {project.status === "completed" && (
        <Section title="What this produced">
          <p className="mt-2 text-sm text-muted-foreground">
            A confirmed engagement between every business that took part, on{" "}
            <Link to="/app/profile" className="underline underline-offset-2">
              your profile
            </Link>{" "}
            and theirs.{" "}
            {project.visibility === "public"
              ? "A summary of this project is published alongside it."
              : "The project itself stays private."}
          </p>
          {/* Said here rather than as a disabled Delete button. A control that
              exists only to explain why it cannot be used is worse than the
              sentence that explains it. */}
          <p className="mt-2 text-xs text-muted-foreground">
            A finished project can&rsquo;t be deleted — the work record belongs to everyone who took
            part in it.
          </p>
        </Section>
      )}
    </div>
  );
}

export { ProjectDetail };
