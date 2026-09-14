import { useState } from "react";
import { Link } from "react-router-dom";
import { Handshake, ShieldCheck, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AppVerificationBadge } from "@/components/badge/AppVerificationBadge";
import { useAuth } from "@/context/AuthContext";
import { useFollows } from "@/context/FollowsContext";
import { isVouchable, VOUCHABLE_VERIFICATION_LEVELS } from "@/lib/vouchRules";
import { CLAIMED } from "@/lib/verificationLevels";
import { verificationLevelLabel } from "@/lib/trustLabels";
import { toast } from "@/lib/toast";

// The furniture the feed screen is built from, colocated exactly as
// pages/app/asks/AskCard.jsx and pages/app/network/NetworkCard.jsx are, and
// for the reason those files give: a section split across two files is how one
// half drifts and nobody notices for a month.
//
// Nothing here fetches. It takes a serialized NetworkEvent and renders it.
//
// THE WORDING LIVES HERE, not on the server — the one place this feature
// diverges from lib/activityEvents.js, whose ACTIVITY_MESSAGES bakes a whole
// sentence server-side. An activity row is a single clickable line, so a
// pre-composed string is right there. A feed row carries TWO business names
// that each link to their own profile, so a sentence with the names already
// flattened into it would arrive unlinkable.

// "2h", "3d", "12 Aug". Short on purpose: the timestamp is the least
// important thing on the card and a full toLocaleString() competes with the
// testimonial for attention. Falls back to a date past a week, where "9d" has
// stopped meaning anything to anyone.
function timeAgo(iso) {
  const then = new Date(iso);
  const minutes = Math.floor((Date.now() - then.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  if (minutes < 10080) return `${Math.floor(minutes / 1440)}d`;
  return then.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

// A business name, always a link to its profile.
//
// /app/business/:id rather than /business/:id — the in-app route, so a reader
// following a name out of the feed keeps the sidebar and doesn't land on the
// public page as though they'd logged out.
function BusinessLink({ business }) {
  if (!business) return <span className="font-medium text-foreground">Someone</span>;
  return (
    <Link
      to={`/app/business/${business.id}`}
      className="font-medium text-foreground underline-offset-4 hover:underline"
    >
      {business.name}
    </Link>
  );
}

// One row per type. The icon is the type's only colour, and it is the thing
// that makes four kinds of news skimmable in one column.
const PRESENTATION = {
  vouch_published: { icon: Handshake, tone: "text-foreground" },
  business_claimed: { icon: UserPlus, tone: "text-muted-foreground" },
  business_verified: { icon: ShieldCheck, tone: "text-muted-foreground" },
};

// The sentence, per type. Returns nodes rather than a string because both
// names are links.
//
// Note who is `actor` and who is `subject` in each: the actor DID it, the
// subject is what it is ABOUT. On a vouch that is giver and receiver. The two
// level types have no actor at all — an admin approved them, and staff never
// appear in a members' feed.
function Sentence({ event }) {
  const { type, actor, subject } = event;

  if (type === "vouch_published") {
    return (
      <>
        <BusinessLink business={actor} /> vouched for <BusinessLink business={subject} />
      </>
    );
  }
  if (type === "business_claimed") {
    return (
      <>
        <BusinessLink business={subject} /> joined ABRI
      </>
    );
  }
  if (type === "business_verified") {
    return (
      <>
        <BusinessLink business={subject} /> is now{" "}
        {verificationLevelLabel[event.toVerificationLevel] ?? "verified"}
      </>
    );
  }
  // An unknown type renders as a dated blank rather than crashing the column
  // — the server can ship a new one before this file learns it, the same
  // tolerance activityLink() builds in by returning null.
  return <BusinessLink business={subject} />;
}

// The two actions a row carries, and the reason the feed is worth having.
//
// A feed nobody can act on is a display, not a loop — every row here would
// otherwise offer one thing, a link to a profile. What makes it a loop is that
// vouching from a row produces the NEXT row: vouch -> feed row -> reminds
// somebody else -> vouch.
//
// The point is RECALL, not persuasion. A member would happily vouch for the
// four or five firms they have actually worked with; they simply never think
// of them while sitting at a desk. Every row names one at the moment the
// reader is already thinking about trust.
//
// WHAT MUST NEVER JOIN THESE TWO: like, react, comment, share. Every row in
// this feed is a third-party positive act about somebody else, and that single
// property is what lets the whole feature run with no cap, no expiry, no
// report button and no moderation queue (see routes/feed.js). A vouch and a
// follow both preserve it — you can only praise, and a follow is invisible. A
// reaction would be the first thing here that is about the READER, and it
// would drag the entire moderation apparatus in behind it.
//
// The target is ALWAYS event.subject, never the actor. One rule, no per-type
// branching: the subject is the vouch's receiver, or the business that just
// claimed or verified, and in every case the row reads "somebody else just
// found them credible — do you know them too?".
// Offering the actor as a second target would put two vouch buttons on one row
// with nothing to tell them apart.
function FeedActions({ event, onVouch }) {
  const { business: viewer } = useAuth();
  const { isFollowing, follow, unfollow } = useFollows();
  const [followBusy, setFollowBusy] = useState(false);

  const target = event.subject;
  // Your own business, on a row about you — someone vouched for you, or you
  // just got verified. Neither action means anything here: POST /follows
  // refuses following yourself with a 400, and isVouchable already rules out
  // the vouch. Returning early is what keeps a lone Follow button off the one
  // row in the feed where it could only ever produce an error toast.
  if (!viewer || target.id === viewer.id) return null;

  // isVouchable checks only the TARGET (vouchRules.js) — self, their level,
  // and whether a vouch already exists. The viewer's OWN level is a separate
  // clause, exactly as BusinessProfile.jsx pairs them; relying on isVouchable
  // alone is the bug that makes the dashboard's suggestions wrong.
  const targetOk = isVouchable(target, viewer);
  const viewerVerified = VOUCHABLE_VERIFICATION_LEVELS.has(viewer.verificationLevel);
  const awaitingVerification = viewer.verificationLevel === CLAIMED;

  async function handleFollowToggle() {
    setFollowBusy(true);
    const wasFollowing = isFollowing(target.id);
    // follow() takes the whole business; the object this row was rendering is
    // the same shape the Following tab needs, so there is nothing to refetch.
    const result = wasFollowing ? await unfollow(target.id) : await follow(target);
    setFollowBusy(false);
    if (!result.ok) return toast.error(result.error);
    // Says out loud that they aren't told, matching BusinessProfile.jsx. A
    // follow looks like a social action and isn't one.
    toast(
      wasFollowing
        ? `Unfollowed ${target.name}`
        : `Following ${target.name} — they aren't notified`,
    );
  }

  return (
    <div className="ml-auto flex shrink-0 items-center gap-2">
      {/* Nothing to sell and nothing to explain: you are looking at yourself,
          at somebody you have already vouched for, or at a business not yet
          verified enough to receive one. Facts about the pair hide the button.
          Money never does — that asymmetry is the UpgradePrompt doctrine. */}
      {targetOk &&
        (awaitingVerification ? (
          // A VERIFICATION gate, so no upgrade prompt: there is no plan that
          // opens this door. Disabled rather than hidden, with the free next
          // step named — the same treatment "Post an ask" gets on the asks
          // board, and the same order the server checks in POST /vouches.
          <Button size="sm" variant="outline" disabled title="Vouching unlocks once you're SSM-verified">
            Vouch
          </Button>
        ) : (
          viewerVerified && (
            // Fully styled on every plan, Free included. The click is what the
            // gate intercepts, and this is where the feed actually converts:
            // reaching for the button and being told the price beats watching
            // vouches you cannot give scroll past.
            <Button size="sm" variant="outline" onClick={() => onVouch(target)}>
              Vouch for them too
            </Button>
          )
        ))}

      {/* Never gated, on any plan. Uncapped, unannounced, and the one thing a
          Free member can always do about a business they have just read about.
          T0 listings cannot be followed, but no T0 ever reaches this row: a
          claim is what puts a business in the feed in the first place. */}
      <Button size="sm" variant="ghost" onClick={handleFollowToggle} disabled={followBusy}>
        {isFollowing(target.id) ? "Following" : "Follow"}
      </Button>
    </div>
  );
}

function FeedRow({ event, onVouch }) {
  const { icon: Icon, tone } = PRESENTATION[event.type] ?? PRESENTATION.business_claimed;

  return (
    <li className="flex gap-4 py-5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
        <Icon className={`h-4 w-4 ${tone}`} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <div className="text-sm text-muted-foreground">
            <Sentence event={event} />
          </div>
          <span className="text-xs text-muted-foreground">· {timeAgo(event.createdAt)}</span>
        </div>

        {/* The testimonial or the answer, quoted. This is the whole point of
            the feed — the sentence above is the headline and this is the
            evidence — so it gets the larger type, not the metadata does. */}
        {event.quote && (
          <blockquote className="mt-2 border-l-2 border-border pl-3 text-sm text-foreground">
            {event.quote}
          </blockquote>
        )}

        {/* Badge and actions share the metadata line, both describing the
            SUBJECT — the business the row is about and the one both buttons
            act on. Keeping them on one line is what stops the actions reading
            as belonging to the sentence's other name. */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <AppVerificationBadge verificationLevel={event.subject.verificationLevel} />
          <span className="text-xs text-muted-foreground">
            {event.subject.category} · {event.subject.location}
          </span>
          <FeedActions event={event} onVouch={onVouch} />
        </div>
      </div>
    </li>
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

// Its own copy rather than the one exported from AskCard.jsx, which hardcodes
// "Asks" as its eyebrow. Same reason ASK_BUSINESS_SELECT is copied rather than
// imported on the server: sharing it would mean the next change to one
// section's header silently restyled the other's.
function PageHeader({ title, eyebrow, children }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {eyebrow}
      </div>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
        {title}
      </h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

export { FeedRow, Empty, PageHeader, timeAgo };
