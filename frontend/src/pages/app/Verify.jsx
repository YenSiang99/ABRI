import { Check, Lock, ShieldCheck } from "lucide-react";
import { VerificationBadge } from "@/components/badge/VerificationBadge";
import { AppVerificationBadge } from "@/components/badge/AppVerificationBadge";
import { ExplainBadge } from "@/components/badge/BadgeExplainer";
import { useAuth } from "@/context/AuthContext";
import { verificationLevelLabel } from "@/lib/trustLabels";
import { cn } from "@/lib/utils";
import { CLAIMED } from "@/lib/verificationLevels";
import { buildVerificationLevelData } from "@/lib/verificationLevelData";

// The verification page — ONE axis, on purpose.
//
// It briefly tried to be all three ("Levels & tiers", at /app/levels), with
// the vouch ladder and the membership table bolted underneath. That page
// answered two different questions at once and did neither well: a member who
// only wanted to know why they were stuck at L1 had to scroll past pricing to
// find out. The other two axes now live where you can act on them —
// pages/app/Vouches.jsx and pages/app/Plan.jsx — and the "what does this mark
// mean" question, which is the one that actually gets asked and gets asked in
// front of somebody else's badge, moved to components/badge/BadgeExplainer.jsx.
//
// What's left is what this page was before that detour, plus the progress
// rail: where you are, and what the next check needs.

// The status of a rung relative to where the member stands. Shared by the
// rail and the cards below it so the two can't disagree about which level is
// current — they render the same three states from one function.
function statusFor(idx, currentIndex) {
  if (idx < currentIndex) return "done";
  if (idx === currentIndex) return "current";
  return "locked";
}

const STATUS_MARK_CLASS = {
  done: "bg-foreground text-background",
  current: "bg-accent text-accent-foreground",
  locked: "bg-secondary text-muted-foreground",
};

const STATUS_ICON = {
  done: Check,
  current: ShieldCheck,
  locked: Lock,
};

// The breadcrumb: L1 → L2 → L3 → L4 with the member's position on it, above
// the detail cards. The cards already say everything this says — the point of
// the rail is that it says it in one glance, before any reading. A member who
// wants only "how far along am I" gets an answer without scrolling.
//
// Scrolls horizontally rather than wrapping. Four rungs stacked into two rows
// on a narrow screen stop reading as a sequence, which is the one thing this
// component is for.
function LevelRail({ levels, currentIndex }) {
  const last = levels.length - 1;

  return (
    <div className="overflow-x-auto">
      <ol className="flex min-w-[480px] items-start">
        {levels.map((t, idx) => {
          const status = statusFor(idx, currentIndex);
          const Icon = STATUS_ICON[status];

          return (
            <li key={t.verificationLevel} className="flex flex-1 flex-col items-center">
              <div className="flex w-full items-center">
                {/* The segment entering this node is complete when the node
                    itself is reached; the one leaving it only when the NEXT
                    node is. Keyed off currentIndex rather than off `status`
                    so the line into the current rung fills in — the member
                    has travelled it. */}
                <span
                  className={cn(
                    "h-px flex-1",
                    idx === 0 ? "bg-transparent" : idx <= currentIndex ? "bg-foreground" : "bg-border",
                  )}
                />
                <span
                  className={cn(
                    "mx-1.5 flex h-9 w-9 flex-none items-center justify-center rounded-full",
                    STATUS_MARK_CLASS[status],
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span
                  className={cn(
                    "h-px flex-1",
                    idx === last ? "bg-transparent" : idx < currentIndex ? "bg-foreground" : "bg-border",
                  )}
                />
              </div>
              <div className="mt-2 px-1 text-center">
                <div
                  className={cn(
                    "text-xs font-semibold",
                    status === "locked" ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {t.verificationLevel}
                </div>
                <div className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                  {verificationLevelLabel[t.verificationLevel]}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Verify() {
  const { account, business } = useAuth();
  const VERIFICATION_LEVEL_DATA = buildVerificationLevelData(account, business);
  // -1 for an L0 business, which has no owner by definition and so should
  // never reach this page. Handled rather than assumed: findIndex returning
  // -1 makes every rung "locked", which is a truthful rail, not a crash.
  const currentIndex = VERIFICATION_LEVEL_DATA.findIndex(
    (t) => t.verificationLevel === business.verificationLevel,
  );

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div>
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Verification Center
        </div>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
          Trust, built in layers
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Every level is a verifiable claim, not a self-assertion. Climb the ladder to unlock the next
          surface of the network. No membership tier moves it, and neither do vouches.
        </p>
      </div>

      <div className="mt-8 rounded-3xl border border-border bg-card p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Current level</div>
            <div className="mt-2">
              {/* Tappable, on the page that explains it. Redundant here and
                  deliberately so: this is where a member LEARNS the badge is
                  a thing you can press, which is what makes them try it on a
                  stranger's profile, where the answer isn't on the page. */}
              <ExplainBadge axis="verification" business={business}>
                <VerificationBadge verificationLevel={business.verificationLevel} size="profile" />
              </ExplainBadge>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <LevelRail levels={VERIFICATION_LEVEL_DATA} currentIndex={currentIndex} />
        </div>

        {business.verificationLevel === CLAIMED && (
          <div className="mt-6 rounded-xl border border-dashed border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">SSM verification: pending manual review.</span>{" "}
            Our team cross-checks your registration against SSM e-Info records — usually within a couple of
            business days. No action needed from you.
          </div>
        )}
      </div>

      <div className="mt-10 space-y-4">
        {VERIFICATION_LEVEL_DATA.map((t, idx) => {
          const status = statusFor(idx, currentIndex);
          const isNext = idx === currentIndex + 1;

          return (
            <div
              key={t.verificationLevel}
              className={cn(
                "rounded-2xl border p-6 transition-colors",
                status === "done" && "border-border bg-card",
                status === "current" && "border-foreground bg-card shadow-sm",
                status === "locked" && !isNext && "border-border bg-card/50 opacity-70",
                isNext && "border-accent bg-card",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-semibold",
                      STATUS_MARK_CLASS[status],
                    )}
                  >
                    {status === "done" ? (
                      <Check className="h-5 w-5" />
                    ) : status === "locked" ? (
                      <Lock className="h-5 w-5" />
                    ) : (
                      <ShieldCheck className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-semibold text-foreground">{t.verificationLevel}</span>
                      <span className="text-sm text-muted-foreground">·</span>
                      <span className="text-lg font-semibold tracking-tight text-foreground">
                        {verificationLevelLabel[t.verificationLevel]}
                      </span>
                    </div>
                    <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t.blurb}</p>
                  </div>
                </div>
                {status === "current" && <AppVerificationBadge verificationLevel={t.verificationLevel} />}
              </div>

              <ul className="mt-5 grid gap-2 sm:grid-cols-2">
                {t.steps.map((s) => (
                  <li key={s.id} className="flex items-center gap-2.5 text-sm">
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                        s.done ? "border-foreground bg-foreground text-background" : "border-border bg-transparent",
                      )}
                    >
                      {s.done && <Check className="h-3 w-3" />}
                    </span>
                    <span className={s.done ? "text-muted-foreground line-through" : "text-foreground"}>
                      {s.label}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Unlocks:</span> {t.unlocks}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { Verify };
