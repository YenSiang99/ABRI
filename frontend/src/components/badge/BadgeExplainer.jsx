import { Link, useLocation } from "react-router-dom";

import { useAuth } from "@/context/AuthContext";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { VERIFICATION_LEVEL_SUBTITLE } from "@/components/badge/VerificationBadge";
import { VERIFICATION_LEVELS } from "@/lib/verificationLevels";
import { verificationLevelLabel, vouchLevelLabel } from "@/lib/trustLabels";
import { VOUCH_LEVELS, reachedAt } from "@/lib/vouchLevelData";
import {
  MEMBERSHIP_TIER_ORDER,
  membershipTierLabel,
  membershipTierPitch,
} from "@/lib/membershipTiers";
import { cn } from "@/lib/utils";

// The badge explainer — the answer to "what does L2 mean?" delivered WHERE
// the question gets asked, which is standing in front of the badge.
//
// This exists because a destination page structurally cannot solve that. The
// confusion happens while looking at a mark on somebody ELSE'S profile in the
// directory, and nobody leaves the page they're on to go read a glossary.
// pages/app/Verify.jsx, pages/app/Vouches.jsx and pages/app/Plan.jsx answer
// the other question — "where do I stand and how do I move up" — which is
// deliberate, self-directed, and does deserve a page.
//
// Every string below is imported. Not one line of copy is written here: the
// rung meanings are the same VERIFICATION_LEVEL_SUBTITLE the badge itself
// renders, the thresholds are lib/vouchLevelData.js, and the tier pitches are
// lib/membershipTiers.js. An explainer that paraphrases the thing it explains
// is how the old Dashboard and Verify pages came to disagree about what L3
// needed — see the header of lib/verificationLevelData.js.

// Per-axis framing, lifted verbatim from the three SignalCards on the retired
// pages/app/Levels.jsx. "Who moves it" and "Can you buy it" were the sharpest
// thing on that page and the two facts a member actually needs; they read far
// better here, next to the mark that prompted the question, than on a page
// nobody visited.
const AXES = {
  verification: {
    title: "Verification level",
    what: "How thoroughly we've checked this business is real.",
    movedBy: "We do, after a check.",
    buyable: "No — no membership tier moves it.",
    to: "/app/verify",
    cta: "Your verification progress",
    // Circular mark, per the visual grammar in components/app/AppSidebar.jsx.
    triggerShape: "rounded-full",
  },
  vouch: {
    title: "Vouch level",
    what: "How many verified peers have staked their own reputation on you.",
    movedBy: "Other businesses do.",
    buyable: "No — and you can't give it to yourself.",
    to: "/app/vouches",
    cta: "Your vouches",
    // Pill.
    triggerShape: "rounded-full",
  },
  membership: {
    title: "Membership tier",
    what: "What you pay for. It changes what you can do here.",
    movedBy: "You do — or it lapses.",
    buyable: "That's the point.",
    to: "/app/plan",
    cta: "See what each tier includes",
    // Squared mono chip — never the pill, never the circular mark.
    triggerShape: "rounded-sm",
  },
};

// One row per rung, in ladder order, with the rung `business` currently sits
// on flagged. `business` is optional and may be somebody else's: an
// unclaimed listing in the public directory has no viewer to speak of, and a
// profile page passes the business being LOOKED AT, never the viewer. That is
// why the current rung is marked with a dot rather than the word "You" —
// the same component has to be truthful on another company's page.
function rowsFor(axis, business) {
  if (axis === "verification") {
    return VERIFICATION_LEVELS.map((level) => ({
      key: level,
      // L0 is included here but not in lib/verificationLevelData.js, which
      // starts at L1 because it drives a to-do list and nobody owns an L0
      // listing. A glossary has the opposite requirement: L0 is exactly the
      // badge a member is most likely to meet on someone else's profile.
      label: `${level} · ${verificationLevelLabel[level]}`,
      note: VERIFICATION_LEVEL_SUBTITLE[level],
      current: business?.verificationLevel === level,
    }));
  }
  if (axis === "vouch") {
    return VOUCH_LEVELS.map((level) => ({
      key: level.key,
      label: vouchLevelLabel[level.key],
      note: reachedAt(level),
      current: business?.vouchLevel === level.key,
    }));
  }
  return MEMBERSHIP_TIER_ORDER.map((tier) => ({
    key: tier,
    label: membershipTierLabel[tier],
    note: membershipTierPitch[tier],
    current: business?.membershipTier === tier,
  }));
}

// Wraps a badge in a button that opens the explainer for its axis. The badge
// is passed through as children untouched — this must never restyle the mark
// it wraps, because the three shapes ARE the vocabulary (circular mark /
// pill / squared mono chip) and a wrapper that rounded them all the same way
// would erase the distinction this dialog exists to teach.
//
// Self-contained rather than the useUpgradeGate()/UpgradePrompt() hook pair
// in components/app/UpgradePrompt.jsx. That one needs a hook because it
// intercepts a click that would otherwise have done something; this one IS
// the click, so a page can drop it around a badge without threading state.
// Nothing renders until it's opened.
function ExplainBadge({ axis, business, children, className }) {
  // pages/BusinessProfile.jsx renders on a PUBLIC route as well as inside the
  // app shell, so this dialog is reachable logged-out. Every destination it
  // could offer lives behind ProtectedRoute; showing a visitor "Your
  // verification progress" would bounce them to a login screen they didn't
  // ask for. The glossary is the part that's useful to them, and it's the
  // part that works — so they get it without the link.
  const { account } = useAuth();
  // Suppress the link when it points at the page the reader is already on.
  // The vouch strip on /app/vouches opens this dialog, and offering "Your
  // vouches →" from there sends someone back where they started, which reads
  // as a broken link rather than as a no-op.
  const { pathname } = useLocation();
  const meta = AXES[axis];
  const rows = rowsFor(axis, business);
  const showCta = Boolean(account) && pathname !== meta.to;

  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            aria-label={`What ${meta.title.toLowerCase()} means`}
            className={cn(
              "inline-flex max-w-full items-center text-left outline-offset-4 transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-ring",
              meta.triggerShape,
              className,
            )}
          />
        }
      >
        {children}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{meta.title}</DialogTitle>
          <DialogDescription>{meta.what}</DialogDescription>
        </DialogHeader>

        <ul className="-mx-1">
          {rows.map((row) => (
            <li
              key={row.key}
              className={cn(
                "flex items-baseline gap-2.5 rounded-lg px-1 py-1.5",
                row.current && "bg-secondary/60",
              )}
            >
              <span
                className={cn(
                  "mt-1.5 h-1.5 w-1.5 flex-none rounded-full",
                  row.current ? "bg-foreground" : "bg-border",
                )}
              />
              <span
                className={cn(
                  "w-[9.5rem] flex-none text-sm",
                  row.current ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {row.label}
              </span>
              <span
                className={cn(
                  "text-xs",
                  row.current ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {row.note}
              </span>
            </li>
          ))}
        </ul>

        <div className="space-y-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
          <div>
            <span className="font-medium text-foreground">Who moves it:</span> {meta.movedBy}
          </div>
          <div>
            <span className="font-medium text-foreground">Can you buy it:</span> {meta.buyable}
          </div>
        </div>

        {/* The contrast the retired Levels page led with. It lands harder
            here: a member meets it while holding one of the three marks,
            rather than as an abstract claim on a page about all of them. */}
        <p className="text-xs text-muted-foreground">
          Your profile carries three marks. We check the first, your peers decide the second, and
          only the third is ours to sell.
        </p>

        {showCta && (
          <Link
            to={meta.to}
            className="text-sm font-semibold text-foreground underline underline-offset-4"
          >
            {meta.cta} →
          </Link>
        )}
      </DialogContent>
    </Dialog>
  );
}

export { ExplainBadge };
