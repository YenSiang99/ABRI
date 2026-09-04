import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Handshake,
  Eye,
  ShieldCheck,
  TrendingUp,
  ArrowUpRight,
  Check,
  Circle,
  Award,
  Clock,
} from "lucide-react";
import { StatCard } from "@/components/app/StatCard";
import { AppBusinessCard } from "@/components/app/AppBusinessCard";
import { AppVerificationBadge } from "@/components/badge/AppVerificationBadge";
import { VouchBadge } from "@/components/badge/VouchBadge";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationsContext";
import { verificationLevelLabel, vouchLevelLabel } from "@/lib/trustLabels";
import { fetchBusinesses } from "@/lib/api/businesses";
import { fetchVouchesGiven, fetchVouchRequests } from "@/lib/api/vouches";
import { fetchMyActivity } from "@/lib/api/activity";
import { isVouchable } from "@/lib/vouchRules";
import { activityLink } from "@/lib/activityLinks";
import { cn } from "@/lib/utils";
import { CLAIMED } from "@/lib/verificationLevels";
import { nextVerificationLevel } from "@/lib/verificationLevelData";

// One line of the activity feed. Clickable whenever the event names somewhere
// to go — every message is about something that happened on another page, so
// reading one and then having to hunt for it in the nav is the gap this
// closes. Types with no destination (see lib/activityLinks.js) still render,
// just as plain text.
//
// Opening it is what marks it read. Rendering the feed deliberately doesn't:
// glancing at the dashboard on the way somewhere else isn't the same as
// dealing with what's in it, and marking on render would clear the badge for
// requests the member never opened.
function ActivityRow({ event, onOpen }) {
  const to = activityLink(event);

  const body = (
    <>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-xs font-semibold text-foreground">
        {event.actorName ? event.actorName.charAt(0) : "•"}
      </div>
      <div className="min-w-0 flex-1">
        {/* event.message already reads as a full sentence with the actor's
            name baked in server-side (see backend/src/lib/activityEvents.js)
            — no separate actor-name prefix needed here. */}
        <div className={cn("text-sm text-foreground", !event.read && "font-medium")}>
          {event.message}
        </div>
        <div className="text-xs text-muted-foreground">
          {new Date(event.date).toLocaleString()}
        </div>
      </div>
      {/* Kept alongside the tint rather than replaced by it. The wash is the
          thing you notice scanning the list; the dot is what still says
          "unread" to someone who can't distinguish it from the card behind
          it, and colour on its own would leave them with no signal at all. */}
      {!event.read && (
        <span
          aria-label="Unread"
          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent-foreground"
        />
      )}
      {to && <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
    </>
  );

  // The unread wash, ABRI's equivalent of LinkedIn's blue: --accent is the
  // brand yellow and is deliberately constant across light and dark (see
  // index.css), so one opacity works in both without a second definition.
  // Read rows carry no fill at all, which is what makes the tint mean
  // something — a list where every row is tinted says nothing.
  const unreadFill = !event.read && "bg-accent/10";

  return (
    <li>
      {to ? (
        // Negative margin against matching padding so the fill reaches past
        // the text without widening the row's place in the divided list.
        <Link
          to={to}
          onClick={() => !event.read && onOpen(event.id)}
          className={cn(
            "-mx-2 flex items-start gap-3 rounded-lg px-2 py-4 transition-colors",
            unreadFill,
            // Unread hovers deeper into the same hue rather than swapping to
            // the neutral fill, so hovering never looks like the row was read.
            event.read ? "hover:bg-secondary" : "hover:bg-accent/20",
          )}
        >
          {body}
        </Link>
      ) : (
        <div className={cn("-mx-2 flex items-start gap-3 rounded-lg px-2 py-4", unreadFill)}>
          {body}
        </div>
      )}
    </li>
  );
}

function Dashboard() {
  const { account, business } = useAuth();
  const { markOneRead, markAllRead } = useNotifications();
  const pending = business.verificationLevel === CLAIMED;
  const nextLevel = nextVerificationLevel(account, business);

  const [suggested, setSuggested] = useState([]);
  const [vouchesGivenCount, setVouchesGivenCount] = useState(0);
  const [needsYouCount, setNeedsYouCount] = useState(0);
  const [activity, setActivity] = useState([]);

  // Derived from the feed rather than the context's unreadCount, which
  // markAllRead has already zeroed by the time this renders. It also counts
  // only what's on screen — the context counts every unread row, including
  // any beyond the 20 this panel fetches.
  const newCount = activity.filter((a) => !a.read).length;

  // Both handlers flip the local rows too, so the dots clear without a
  // refetch. Opening one is usually a navigation away, but the row has to be
  // right for the back-button case; "mark all" never navigates at all.
  function handleOpen(id) {
    markOneRead(id);
    setActivity((current) => current.map((a) => (a.id === id ? { ...a, read: true } : a)));
  }

  function handleMarkAllRead() {
    markAllRead();
    setActivity((current) => current.map((a) => (a.read ? a : { ...a, read: true })));
  }

  useEffect(() => {
    if (pending) return;
    fetchBusinesses()
      .then((all) => setSuggested(all.filter((b) => isVouchable(b, business)).slice(0, 3)))
      .catch(() => {});
    fetchVouchesGiven()
      // Published only. This used to count the raw list, so declined
      // vouches inflated the "Vouches given" stat — a number meant to
      // measure give-first contribution was counting rejections toward it.
      .then((vouches) => setVouchesGivenCount(vouches.filter((v) => v.status === "published").length))
      .catch(() => {});
    fetchVouchRequests()
      .then((vouches) => setNeedsYouCount(vouches.filter((v) => v.waitingOn === "you").length))
      .catch(() => {});
    fetchMyActivity()
      .then(setActivity)
      .catch(() => {});
    // `business` rather than `business.id`: the suggestion filter now reads
    // its `vouchedFor` list too, so a business you've just vouched for has
    // to drop out of the suggestions on the next refreshAccount(). Identity
    // is stable between refreshes (useState in AuthContext), so this still
    // runs once per mount.
  }, [pending, business]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Welcome back
          </div>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
            {business.name}
          </h1>
          {/* Linked because this is where members meet these two words for the
              first time and have nowhere to ask. Wrapped at the CALL SITE, not
              inside the badge components — those also render on public
              profiles and directory cards, and a visitor tapping a stranger's
              badge must not land on their own levels page. */}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/app/verify" aria-label="What the verification level means">
              <AppVerificationBadge verificationLevel={business.verificationLevel} />
            </Link>
            <Link to="/app/vouches" aria-label="What the vouch level means">
              <VouchBadge vouchLevel={business.vouchLevel} />
            </Link>
          </div>
        </div>
        <Link
          to="/app/profile"
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
        >
          View public profile <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      {pending && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-dashed border-border bg-card/50 p-5">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div>
            <div className="text-sm font-semibold text-foreground">
              Claimed · SSM verification pending
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Our team is manually cross-checking your registration against SSM
              e-Info records — usually within a couple of business days. Vouching
              and your NFC card unlock once that's done. No action needed from you.
            </p>
          </div>
        </div>
      )}

      {/* A prompt, not a stat — the dashboard previously surfaced pending
          vouch work only as past-tense lines in the activity feed further
          down the page, which told you something had happened but not that
          it was still waiting on you, and didn't link anywhere. */}
      {!pending && needsYouCount > 0 && (
        <Link
          to="/app/vouches"
          className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5 transition-colors hover:bg-secondary"
        >
          <div className="flex items-start gap-3">
            <Handshake className="mt-0.5 h-5 w-5 shrink-0 text-foreground" />
            <div>
              <div className="text-sm font-semibold text-foreground">
                {needsYouCount} {needsYouCount === 1 ? "vouch needs" : "vouches need"} your response
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Review, revise, or reply — they're waiting on you.
              </p>
            </div>
          </div>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Vouches received"
          value={pending ? "—" : business.vouches.length}
          hint={pending ? "Unlocks after SSM verification" : "Real peers staking their name"}
          icon={Handshake}
        />
        <StatCard
          label="Vouches given"
          value={pending ? "—" : vouchesGivenCount}
          hint={pending ? "Unlocks after SSM verification" : "Give-first: keep going"}
          icon={TrendingUp}
        />
        <StatCard
          label="Profile views (7d)"
          value={47}
          hint="Petaling Jaya corridor"
          icon={Eye}
        />
        {/* Both cards show the LABEL as the value and the machine detail as
            the hint. They used to disagree — this one rendered the raw code
            "L2" with the label demoted to a hint, while the one below rendered
            its label as the value. Two adjacent cards, same kind of data,
            opposite conventions. */}
        <StatCard
          label="Verification level"
          value={verificationLevelLabel[business.verificationLevel]}
          hint={business.verificationLevel}
          icon={ShieldCheck}
          to="/app/verify"
        />
        <StatCard
          label="Vouch level"
          value={vouchLevelLabel[business.vouchLevel]}
          hint={
            business.vouches.length === 1
              ? "1 vouch received"
              : `${business.vouches.length} vouches received`
          }
          icon={Award}
          to="/app/vouches"
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* Derived from lib/verificationLevelData.js, the same source
            /app/verify reads. This panel used to hold its own hardcoded step
            list and say "Progress to L3" to every member regardless of their
            actual level — and its steps disagreed with what the levels page
            said L3 required. Two explainers giving different answers.

            Renders nothing at the top level, where there is no next step to
            show. */}
        {nextLevel ? (
          <Link
            to="/app/verify"
            className="block rounded-2xl border border-border bg-card p-6 transition-colors hover:bg-secondary lg:col-span-1"
          >
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Progress to {nextLevel.verificationLevel}
            </div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
              {verificationLevelLabel[nextLevel.verificationLevel]}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">{nextLevel.blurb}</p>
            <ul className="mt-5 space-y-3">
              {nextLevel.steps.map((step) => (
                <li key={step.id} className="flex items-start gap-3 text-sm">
                  {step.done ? (
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                      <Check className="h-3 w-3" />
                    </span>
                  ) : (
                    <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                  )}
                  <span className={step.done ? "text-muted-foreground line-through" : "text-foreground"}>
                    {step.label}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Unlocks:</span> {nextLevel.unlocks}
            </div>
          </Link>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-1">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Verification level
            </div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
              {verificationLevelLabel[business.verificationLevel]}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              You're at the top of the verification ladder. Nothing further to check.
            </p>
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
          <div className="flex items-center gap-2">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Recent activity
            </div>
            {newCount > 0 && (
              <>
                <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
                  {newCount} new
                </span>
                {/* For the lines with nothing to open — a cancelled vouch, a
                    connection you already knew about. Without it those sit
                    unread forever, since opening is the only other way to
                    clear one. */}
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="ml-auto text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Mark all read
                </button>
              </>
            )}
          </div>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
            What's happening
          </h2>
          <ul className="mt-5 divide-y divide-border">
            {activity.length === 0 ? (
              <li className="py-4 text-sm text-muted-foreground">Nothing yet — activity shows up here as your network engages with you.</li>
            ) : (
              activity.map((a) => <ActivityRow key={a.id} event={a} onOpen={handleOpen} />)
            )}
          </ul>
        </div>
      </div>

      {!pending && (
        <div className="mt-10">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Give first
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                Businesses to vouch for
              </h2>
            </div>
            <Link
              to="/app/network/connections"
              className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
            >
              Browse network →
            </Link>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {suggested.map((b) => (
              <AppBusinessCard key={b.id} business={b} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export { Dashboard };
