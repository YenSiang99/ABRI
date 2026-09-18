import { Link } from "react-router-dom";
import { AppVerificationBadge } from "@/components/badge/AppVerificationBadge";

// The furniture the Asks screens share, mirroring
// pages/app/network/NetworkCard.jsx — same reason that file exists: two
// sibling screens that have to look like one section is exactly how one of
// them drifts and nobody notices for a month.
//
// Nothing here knows how an ask is fetched or answered. It takes an ask (or
// an answer) and renders it.

// The chip. Same shape as the Network pill deliberately: a member should not
// have to learn a second visual language moving between the two sections.
function Pill({ icon: Icon, children, muted = true }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium " +
        (muted ? "text-muted-foreground" : "text-foreground")
      }
    >
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  );
}

// The squared mono chip, borrowed from the billing/plan chip in
// AppSidebar.jsx. Used for exactly one thing here: marking an answer as a
// self-nomination. A DIFFERENT SHAPE, not just different words, because a
// rounded pill reading "own services" would be skimmed as the same kind of
// thing as a third-party suggestion — which is precisely the confusion the
// two-column answer model exists to prevent.
function MonoChip({ children }) {
  return (
    <span className="inline-flex items-center rounded-sm border border-border bg-secondary px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </span>
  );
}

// How many slots are left, in words. Reads off the ask rather than a constant
// so the client can never disagree with the server about the cap.
//
// Note "Full" is not a status — an ask with no slots left is still open, and
// its asker still has a decision to make. See routes/asks.js.
function SlotsPill({ ask }) {
  if (ask.status !== "open") return null;
  if (ask.slotsLeft === 0) return <Pill>Full — no more offers</Pill>;
  return (
    <Pill muted={false}>
      {ask.slotsLeft} of {ask.maxAnswers} {ask.slotsLeft === 1 ? "slot" : "slots"} left
    </Pill>
  );
}

// "Matches you" vs "Your line of work" — the two routing tiers from
// matchTierFor in backend/src/lib/asks.js, resolved server-side onto
// ask.matchStrength. Two tiers rather than one because an exact category+location
// match is often zero at current density.
function MatchPill({ match }) {
  if (match === "exact") return <Pill muted={false}>Matches you</Pill>;
  if (match === "category") return <Pill>Your line of work</Pill>;
  return null;
}

// Days remaining, worded so the last two days read as urgent without a
// countdown. Returns null once an ask is settled — a closed ask has no
// deadline worth stating.
function deadlineText(ask) {
  if (ask.status !== "open") return null;
  const ms = new Date(ask.expiresAt).getTime() - Date.now();
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  if (days <= 0) return "Closing today";
  if (days === 1) return "Closes tomorrow";
  return `Closes in ${days} days`;
}

// Exported as a component rather than as the bare function, so this file
// exports only components and stays fast-refresh clean (same constraint
// NetworkCard.jsx meets by exporting nothing else).
function Deadline({ ask, className }) {
  const text = deadlineText(ask);
  if (!text) return null;
  return <span className={className}>{text}</span>;
}

// How long ago, in the shortest honest words. Its own copy rather than the one
// in FeedCard.jsx, for the reason that file states about PageHeader: sharing it
// would mean the next change to one section silently restyled the other.
function postedAgo(date) {
  const ms = Date.now() - new Date(date).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return mins <= 1 ? "just now" : `${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return days === 1 ? "yesterday" : `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

function PostedAgo({ date, className }) {
  return <span className={className}>{postedAgo(date)}</span>;
}

// ONE ROW IN THE LEFT COLUMN of the split board, shaped like a LinkedIn job
// result: logo tile, title, who posted it, where and when, then a thin line of
// metadata. It has to stay readable at 400px, which is what rules out the pill
// row the old card carried — five chips wrap to three lines in this width and
// the list stops being scannable, which is the only thing a list is for.
//
// A BUTTON ON DESKTOP, A LINK ON MOBILE, and that is not a style choice. On a
// wide screen this selects into the pane beside it (?selected=), so it must
// not navigate; below `lg` there is no pane to select into, so it goes to the
// full page. Rendering both and hiding one with CSS is what keeps that honest
// without the component having to measure the viewport.
function AskRowCard({ ask, selected, onSelect }) {
  const body = (
    <>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-base font-semibold text-background">
          {ask.askedBy.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold text-foreground">{ask.title}</div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">{ask.askedBy.name}</div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {ask.matchLocation} · <PostedAgo date={ask.createdAt} />
          </div>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-[52px] text-xs text-muted-foreground">
        {ask.matchStrength === "service" && (
          <span className="font-medium text-foreground">Matches your services</span>
        )}
        {ask.matchStrength === "exact" && (
          <span className="font-medium text-foreground">Matches you</span>
        )}
        {ask.matchStrength === "category" && <span>Your line of work</span>}
        <span>
          {ask.answerCount} {ask.answerCount === 1 ? "offer" : "offers"}
        </span>
        {ask.status === "open" && <Deadline ask={ask} />}
        {ask.status === "answered" && <span>Settled</span>}
        {ask.status === "under_review" && <span>On hold — reported</span>}
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
        to={`/app/requests/${ask.id}`}
        state={{ from: "/app/requests", label: "Back to requests" }}
        className={`block lg:hidden ${shell}`}
      >
        {body}
      </Link>
    </>
  );
}

// One answer, and the distinction the asker reads it by.
//
// A suggestion names two businesses: somebody pointing at somebody else. A
// self-nomination names one and says so plainly, in a different-shaped chip.
// Both are legitimate — blocking self-nomination in a cluster this size would
// be absurd — but they carry different weight to an asker choosing, so they
// must never look alike.
function AnswerCard({ answer, actions }) {
  const subject = answer.isSelfNomination ? answer.answeredBy : answer.recommended;
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-base font-semibold text-background">
          {subject.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-foreground">
            {answer.isSelfNomination ? (
              <>
                <span className="font-semibold">{answer.answeredBy.name}</span> offered their own
                services
              </>
            ) : (
              <>
                <span className="font-semibold">{answer.answeredBy.name}</span> suggested{" "}
                <Link
                  to={`/app/business/${answer.recommended.id}`}
                  state={{ from: "/app/requests", label: "Back to requests" }}
                  className="font-semibold underline underline-offset-2"
                >
                  {answer.recommended.name}
                </Link>
              </>
            )}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {subject.category} · {subject.location}
          </div>
        </div>
      </div>

      <p className="mt-3 text-sm text-muted-foreground">{answer.comment}</p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <AppVerificationBadge verificationLevel={subject.verificationLevel} />
        {answer.isSelfNomination ? <MonoChip>Own services</MonoChip> : <Pill>Suggestion</Pill>}
        {answer.status === "accepted" && <Pill muted={false}>Accepted</Pill>}
      </div>

      {actions && <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">{actions}</div>}
    </div>
  );
}

function Grid({ children }) {
  return <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
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
          Requests
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
  AskRowCard,
  AnswerCard,
  Pill,
  MonoChip,
  SlotsPill,
  MatchPill,
  Deadline,
  PostedAgo,
  Grid,
  Empty,
  PageHeader,
};
