import { Link } from "react-router-dom";

import { AppVerificationBadge } from "@/components/badge/AppVerificationBadge";

// The furniture the Projects screens share.
//
// ITS OWN COPIES of Pill / Grid / Empty / PageHeader rather than imports from
// AskCard.jsx, which is the call this codebase has already made twice (see the
// note at the bottom of pages/app/feed/FeedCard.jsx): sharing them would mean
// the next change to one section's header silently restyled the other's. The
// split-pane shell in ProjectsBoard.jsx is duplicated from AsksBoard.jsx for
// the same reason. If a third board appears, that is the moment to share.

function Pill({ children, muted = true }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium " +
        (muted ? "text-muted-foreground" : "text-foreground")
      }
    >
      {children}
    </span>
  );
}

// The status chip. "Active" is the one that draws the eye, because it is the
// only status with anything left to do.
//
// TAKES hasStarted AS WELL AS status, and the two are different questions.
// `status` models how a project ENDS; it said nothing about whether it had
// begun, so a project nobody had accepted read "Active" exactly like one with
// three businesses working in it. hasStarted is derived from the participant
// rows on the server (see lib/projects.js) rather than stored, so this chip
// cannot disagree with the route that enforces the same threshold.
function StatusPill({ status, hasStarted = true }) {
  if (status === "active") {
    return hasStarted ? (
      <Pill muted={false}>Active</Pill>
    ) : (
      <Pill>Waiting to start</Pill>
    );
  }
  if (status === "completed") return <Pill>Completed</Pill>;
  return <Pill>Cancelled</Pill>;
}

// What a visitor will see, said plainly rather than as a one-word label.
// "Public" alone would leave a member guessing whether it publishes the thread
// — which it never does, under either setting.
function VisibilityPill({ visibility }) {
  return (
    <Pill>{visibility === "public" ? "Summary on both profiles" : "Private to the businesses in it"}</Pill>
  );
}

function monthYear(value) {
  if (!value) return null;
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function Period({ project }) {
  const from = monthYear(project.startedOn);
  const to = monthYear(project.completedOn);
  if (!to || to === from) return <span>{from}</span>;
  return (
    <span>
      {from} – {to}
    </span>
  );
}

// Up to four initials, then a count. A participant list is the one thing a
// reader scans a project row for, and four avatars is where a 400px column
// stops being able to show names anyway.
function ParticipantStack({ participants }) {
  const joined = participants.filter((p) => p.status === "joined");
  const shown = joined.slice(0, 4);
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex -space-x-1.5">
        {shown.map((p) => (
          <div
            key={p.business.id}
            title={p.business.name}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-card bg-foreground text-[10px] font-semibold text-background"
          >
            {p.business.name.charAt(0)}
          </div>
        ))}
      </div>
      {joined.length > shown.length && (
        <span className="text-xs text-muted-foreground">+{joined.length - shown.length}</span>
      )}
    </div>
  );
}

// One participant, with the service they themselves declared. The "— not set"
// case is deliberately visible rather than hidden: a joined participant with no
// service mints an engagement that appears in no aggregate, and the owner
// should be able to see that before they complete, not after.
function ParticipantRow({ participant, isYou }) {
  const { business, status, serviceProvided } = participant;
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-foreground text-sm font-semibold text-background">
        {business.name.charAt(0)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/app/business/${business.id}`}
            className="truncate text-sm font-semibold text-foreground underline-offset-2 hover:underline"
          >
            {business.name}
          </Link>
          <AppVerificationBadge verificationLevel={business.verificationLevel} />
          {isYou && <Pill>You</Pill>}
          {status === "invited" && <Pill>Invited</Pill>}
          {status === "declined" && <Pill>Declined</Pill>}
          {status === "left" && <Pill>Left</Pill>}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {serviceProvided ? (
            <>Providing {serviceProvided}</>
          ) : (
            <span className="italic">No service recorded</span>
          )}
        </div>
      </div>
    </div>
  );
}

// One row in the left column of the split board. Same shape as AskRowCard, and
// the same desktop-button / mobile-link split, for the same reason: on a wide
// screen this selects into the pane beside it, and below `lg` there is no pane.
function ProjectRowCard({ project, state, selected, onSelect }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold text-foreground">{project.title}</div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {project.createdByYou ? "You started this" : `Started by ${project.createdBy.name}`}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            <Period project={project} /> ·{" "}
            {project.joinedCount} {project.joinedCount === 1 ? "business" : "businesses"}
          </div>
        </div>
        <ParticipantStack participants={project.participants} />
      </div>

      {/* ONE LINE, IN PLAIN WORDS, from this reader's side. The board passes
          `state` in rather than deriving it here, so the row and the tab counts
          can never disagree about what a project is doing — they read the same
          function. See stateOf in ProjectsBoard. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className={state?.urgent ? "font-medium text-foreground" : undefined}>
          {state?.urgent && (
            // A dot rather than a badge: this row is already carrying a title,
            // a name and a date, and a coloured pill at this size reads as
            // another label rather than as "look here first".
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-foreground align-middle" />
          )}
          {state?.text}
        </span>
        {project.visibility === "public" && <span>Public summary</span>}
      </div>
    </>
  );

  const shell =
    "w-full border-b border-border px-4 py-4 text-left transition-colors " +
    (selected
      ? "border-l-2 border-l-foreground bg-accent/10"
      : "border-l-2 border-l-transparent hover:bg-accent/5");

  return (
    <>
      <button type="button" onClick={onSelect} className={`hidden lg:block ${shell}`}>
        {body}
      </button>
      <Link
        to={`/app/projects/${project.id}`}
        state={{ from: "/app/projects", label: "Back to projects" }}
        className={`block lg:hidden ${shell}`}
      >
        {body}
      </Link>
    </>
  );
}

function Empty({ icon: Icon, children }) {
  return (
    <div className="mt-6 rounded-2xl border border-dashed border-border p-12 text-center">
      {Icon && <Icon className="mx-auto h-8 w-8 text-muted-foreground" />}
      <div className="mt-3 text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

function PageHeader({ title, children, action }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Projects
        </div>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
          {title}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">{children}</p>
      </div>
      {action}
    </div>
  );
}

export {
  ProjectRowCard,
  ParticipantRow,
  ParticipantStack,
  Period,
  Pill,
  StatusPill,
  VisibilityPill,
  Empty,
  PageHeader,
};
