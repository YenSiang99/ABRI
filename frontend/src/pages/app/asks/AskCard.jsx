import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";
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
// thing as a recommendation — which is precisely the confusion the two-column
// answer model exists to prevent.
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
  if (ask.slotsLeft === 0) return <Pill>Full — no more answers</Pill>;
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

function AskListCard({ ask }) {
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-5 transition-colors hover:border-foreground/20">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-foreground">{ask.title}</div>
          <div className="mt-0.5 truncate text-sm text-muted-foreground">
            {ask.askedBy.name} · {ask.matchCategory} in {ask.matchLocation}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <Pill>{ask.category}</Pill>
        <MatchPill match={ask.matchStrength} />
        <SlotsPill ask={ask} />
        {ask.status === "answered" && <Pill>Answered</Pill>}
        {ask.status === "under_review" && <Pill>On hold — reported</Pill>}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-sm">
        <Deadline ask={ask} className="text-xs text-muted-foreground" />
        <Button
          size="sm"
          variant="outline"
          render={<Link to={`/app/asks/${ask.id}`} state={{ from: "/app/asks", label: "Back to asks" }} />}
          nativeButton={false}
        >
          Open <ArrowUpRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// One answer. The whole anti-self-promotion mechanism's visual half.
//
// A recommendation names two businesses and reads as a third-party
// endorsement. A self-nomination names one and says so plainly, in a
// different-shaped chip. Both are legitimate — blocking self-nomination in a
// cluster this size would be absurd — but they must never look alike.
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
                <span className="font-semibold">{answer.answeredBy.name}</span> recommended{" "}
                <Link
                  to={`/app/business/${answer.recommended.id}`}
                  state={{ from: "/app/asks", label: "Back to asks" }}
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
        {answer.isSelfNomination ? <MonoChip>Own services</MonoChip> : <Pill>Recommendation</Pill>}
        {answer.status === "accepted" && <Pill muted={false}>Accepted</Pill>}
        {/* An accepted answer naming an unclaimed listing is real but not yet
            visible — there is no profile to show it on until they claim.
            Saying so stops it reading as a bug. */}
        {answer.status === "accepted" && answer.visibleOnProfile === false && (
          <Pill>Shows on their profile once they claim it</Pill>
        )}
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
          Asks
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

export { AskListCard, AnswerCard, Pill, MonoChip, SlotsPill, MatchPill, Deadline, Grid, Empty, PageHeader };
