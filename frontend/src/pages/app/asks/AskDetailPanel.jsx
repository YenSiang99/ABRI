import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ClipboardList, FolderKanban } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AppVerificationBadge } from "@/components/badge/AppVerificationBadge";
import { AnswerCard, Deadline, Pill, PostedAgo } from "./AskCard";

// The right-hand pane of the split board: the whole of the selected ask,
// without leaving the list.
//
// WHAT IT DELIBERATELY IS NOT is a second copy of AskDetail. It shows and it
// routes; it does not answer, accept, close or report. Those all mutate the
// ask, and a mutation that happens in a pane beside a list has to reconcile
// with that list's cached copy on every path — which is how a board ends up
// showing an ask as open seconds after somebody closed it. The full page owns
// every write, and this pane's primary button is the door to it.
//
// The one exception is the read-only answer preview below, which exists so the
// asker can see whether there is anything worth opening.
const PREVIEW_ANSWERS = 3;

function Section({ title, children }) {
  return (
    <div className="mt-6 border-t border-border pt-6">
      <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
      <div className="mt-2">{children}</div>
    </div>
  );
}

const PROJECT_STATUS_LABEL = {
  active: "Ongoing",
  completed: "Finished",
  cancelled: "Cancelled",
};

// A tab with its count beside it. The count is the point — "Offers 2" answers
// the question the tab is there to raise, without anyone having to open it.
function PaneTab({ active, onClick, count, children }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`-mb-px flex items-center gap-1.5 border-b-2 pb-2 text-sm font-medium transition-colors ${
        active
          ? "border-foreground text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
      <span
        className={`rounded-full px-1.5 py-0.5 text-[11px] ${
          active ? "bg-foreground text-background" : "bg-secondary text-muted-foreground"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function AskDetailPanel({ ask, isOwn }) {
  // Reset per request: without this the tab a member left on for one request
  // would carry to the next, which is how you land on an empty Projects tab for
  // a request you have not read yet. Adjusted DURING RENDER, the house pattern
  // (AskDialog, VouchDialog) — an effect would paint the wrong tab for a frame.
  //
  // BOTH SIDES OF THE COMPARISON ARE NORMALISED THROUGH THE SAME EXPRESSION,
  // and that is not tidiness. Initialising from `ask?.id ?? null` while
  // comparing against a bare `ask?.id` makes the two disagree whenever `ask`
  // is null — `undefined !== null` is true on every render, so this sets state
  // forever and React kills the tree with "Too many re-renders". The pane
  // starts life with no ask selected, so that is the FIRST render, not an edge
  // case.
  const askId = ask?.id ?? null;
  const [tab, setTab] = useState("offers");
  const [forAskId, setForAskId] = useState(askId);
  if (askId !== forAskId) {
    setForAskId(askId);
    setTab("offers");
  }

  if (!ask) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border p-12 text-center">
        <div className="text-sm text-muted-foreground">
          <ClipboardList className="mx-auto h-8 w-8" />
          <p className="mt-3">Pick a request on the left to read it.</p>
        </div>
      </div>
    );
  }

  const answers = ask.answers ?? [];
  const projects = ask.yourProjects ?? [];
  const to = { pathname: `/app/requests/${ask.id}` };
  const state = { from: "/app/requests", label: "Back to requests" };

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      {/* The poster's row — the company line at the top of a LinkedIn job. */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-base font-semibold text-background">
          {ask.askedBy.name.charAt(0)}
        </div>
        <Link
          to={`/app/business/${ask.askedBy.id}`}
          state={state}
          className="truncate text-sm font-semibold text-foreground underline-offset-2 hover:underline"
        >
          {ask.askedBy.name}
        </Link>
        <AppVerificationBadge verificationLevel={ask.askedBy.verificationLevel} />
      </div>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">{ask.title}</h1>

      <div className="mt-1.5 text-sm text-muted-foreground">
        {ask.matchLocation} · <PostedAgo date={ask.createdAt} /> ·{" "}
        {ask.answerCount} {ask.answerCount === 1 ? "offer" : "offers"}
        {ask.status === "open" && (
          <>
            {" · "}
            <Deadline ask={ask} />
          </>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <Pill>{ask.category}</Pill>
        <Pill>{ask.matchCategory}</Pill>
        <Pill>{ask.matchLocation}</Pill>
        {(ask.matchServices ?? []).map((s) => (
          <Pill key={s} muted={false}>
            {s}
          </Pill>
        ))}
        {ask.status === "answered" && <Pill muted={false}>Settled</Pill>}
        {ask.status === "closed" && <Pill>Closed</Pill>}
        {ask.status === "under_review" && <Pill>On hold — reported</Pill>}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {/* Every action lives on the full page — see the note at the top. The
            label changes so the button says what is waiting there rather than
            a generic "Open". */}
        <Button render={<Link to={to} state={state} />} nativeButton={false}>
          {isOwn
            ? ask.status === "open"
              ? "Review offers"
              : "Open"
            : ask.yourAnswerStatus
              ? "Your offer"
              : "Make an offer"}
          <ArrowUpRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          render={<Link to={to} state={state} />}
          nativeButton={false}
        >
          More details
        </Button>
      </div>

      {ask.detail && (
        <Section title="About this request">
          <p className="whitespace-pre-line text-sm text-muted-foreground">{ask.detail}</p>
        </Section>
      )}

      {/* THE TWO THINGS THAT HANG OFF A REQUEST, each with its count in the
          label. A request produces offers, and an offer produces a project —
          seeing both totals without opening anything is most of what tells a
          member whether this thread went anywhere.

          Projects are only ever the viewer's own; serializeAsk filters them,
          because a project is private by default while a request is readable by
          every member. */}
      <div className="mt-6 border-t border-border pt-4">
        <div role="tablist" className="flex gap-5 border-b border-border">
          <PaneTab active={tab === "offers"} onClick={() => setTab("offers")} count={ask.answerCount}>
            Offers
          </PaneTab>
          <PaneTab active={tab === "projects"} onClick={() => setTab("projects")} count={projects.length}>
            Projects
          </PaneTab>
        </div>

        {tab === "offers" &&
          (answers.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No offers yet.{" "}
              {isOwn
                ? "The businesses who do this work will see it on their dashboard."
                : "If this is your line of work, you'd be first."}
            </p>
          ) : (
            <div className="mt-4">
              <div className="space-y-3">
                {answers.slice(0, PREVIEW_ANSWERS).map((answer) => (
                  <AnswerCard key={answer.id} answer={answer} />
                ))}
              </div>
              {answers.length > PREVIEW_ANSWERS && (
                <div className="mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    render={<Link to={to} state={state} />}
                    nativeButton={false}
                  >
                    See all {ask.answerCount} offers
                  </Button>
                </div>
              )}
            </div>
          ))}

        {tab === "projects" &&
          (projects.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Nothing has come out of this yet. Accept an offer and you can start a project from it
              — that is what puts the work on both profiles when it finishes.
            </p>
          ) : (
            <div className="mt-4 flex flex-col gap-2">
              {projects.map((project, i) => (
                <div key={project.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">{i + 1}.</span>
                  <Button
                    size="sm"
                    variant="outline"
                    render={
                      <Link
                        to={`/app/projects/${project.id}`}
                        state={{ from: "/app/requests", label: "Back to requests" }}
                      />
                    }
                    nativeButton={false}
                  >
                    <FolderKanban className="h-3.5 w-3.5" /> {project.title}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {PROJECT_STATUS_LABEL[project.status]}
                  </span>
                </div>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}

export { AskDetailPanel };
