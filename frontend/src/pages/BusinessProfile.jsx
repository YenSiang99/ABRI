import { useEffect, useState } from "react";
import {
  Link,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { ArrowLeft, MapPin, Building2, Radio, Clock } from "lucide-react";

import { isVouchable, VOUCHABLE_VERIFICATION_LEVELS } from "@/lib/vouchRules";
import { verificationLevelLabel } from "@/lib/trustLabels";
import { fetchBusiness } from "@/lib/api/businesses";
import { useConnections } from "@/context/ConnectionsContext";
import { useFollows } from "@/context/FollowsContext";
import { SOURCE_DIRECTORY } from "@/lib/connectionSources";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VerificationBadge } from "@/components/badge/VerificationBadge";
import { ExplainBadge } from "@/components/badge/BadgeExplainer";
import { LockedFeature } from "@/components/app/LockedFeature";
import { ContactDetails } from "@/components/business/ContactDetails";
import { VouchDialog } from "@/components/app/VouchDialog";
import { UpgradePrompt, useUpgradeGate } from "@/components/app/UpgradePrompt";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/lib/toast";
import { CLAIMED, UNCLAIMED } from "@/lib/verificationLevels";

function VouchCard({ vouch }) {
  return (
    <div className="rounded-2xl border border-grey-200 bg-white p-5 dark:border-border dark:bg-card">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink text-sm font-semibold text-yellow dark:bg-foreground dark:text-background">
          {vouch.fromBusiness.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-ink dark:text-foreground">
            {vouch.fromBusiness.name}
          </div>
          <div className="text-xs text-grey-500 dark:text-muted-foreground">
            {vouch.fromBusiness.category} ·{" "}
            {new Date(vouch.createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>
      {/* Guarded because the field is nullable in principle — an unguarded
          interpolation renders a bordered blockquote containing two bare
          quote marks, which reads as a bug rather than as absence. */}
      {vouch.testimonial && (
        <blockquote className="mt-4 border-l-2 border-yellow pl-4 text-sm italic text-grey-700 dark:text-foreground">
          "{vouch.testimonial}"
        </blockquote>
      )}
    </div>
  );
}

// Who this business has actually worked with, confirmed by the other side.
//
// THE HEADLINE IS COUNTERPARTIES, NOT ENGAGEMENTS, and that is the anti-gaming
// design rather than a wording choice. Two businesses can confirm work that
// never happened — it costs them a colluder, which is more than a
// self-nomination costs, but it is possible. Reporting "12 engagements" would
// make the cheapest possible fake look like the strongest possible signal;
// "12 engagements with 2 businesses" lets a reader judge it for themselves.
// Never replace this with a single total.
//
// NOT A RATING, for the same reason the verification record is not a score.
// These rows say two businesses worked together on a date. Whether the work
// was any good is what a vouch is for, and conflating them would let the
// cheaper artifact borrow the dearer one's meaning.
function EngagementRecord({ entries, summary, businessName }) {
  if (!entries || entries.length === 0) return null;

  const top = summary?.services?.slice(0, 3) ?? [];
  const shown = entries.slice(0, 5);
  const rest = entries.length - shown.length;

  return (
    <div className="rounded-2xl border border-grey-200 bg-white p-6 dark:border-border dark:bg-card">
      <h2 className="text-lg font-semibold tracking-tight text-ink dark:text-foreground">
        Worked with
      </h2>
      <p className="mt-1 text-sm text-grey-500 dark:text-muted-foreground">
        Confirmed by the business on the other side, not self-reported.
      </p>

      {top.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {top.map((g) => (
            <li
              key={g.service}
              className="text-sm text-ink dark:text-foreground"
            >
              <span className="font-semibold">{g.service}</span>
              <span className="text-grey-500 dark:text-muted-foreground">
                {" — "}
                {g.engagements}{" "}
                {g.engagements === 1 ? "engagement" : "engagements"} with{" "}
                {g.counterparties}{" "}
                {g.counterparties === 1 ? "business" : "different businesses"}
              </span>
            </li>
          ))}
        </ul>
      )}

      <ol className="mt-4 space-y-3 border-t border-grey-200 pt-4 dark:border-border">
        {shown.map((e) => {
          // Both ends are named on a public profile and no `counterparty` is
          // resolved (the server sends null for an anonymous reader), so work
          // out which end is the other one here.
          const other =
            e.businessA?.name === businessName ? e.businessB : e.businessA;
          return (
            <li key={e.id} className="flex gap-3 text-sm">
              <span className="w-24 shrink-0 font-mono text-xs text-grey-500 dark:text-muted-foreground">
                {new Date(e.occurredOn).toLocaleDateString(undefined, {
                  month: "short",
                  year: "numeric",
                })}
              </span>
              <span className="min-w-0">
                <span className="text-ink dark:text-foreground">
                  {other?.name}
                </span>
                {e.service && (
                  <span className="text-grey-500 dark:text-muted-foreground">
                    {" "}
                    · {e.service}
                  </span>
                )}
                {e.note && (
                  <span className="mt-0.5 block text-xs text-grey-500 dark:text-muted-foreground">
                    {e.note}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      {rest > 0 && (
        <p className="mt-3 text-xs text-grey-500 dark:text-muted-foreground">
          and {rest} more
        </p>
      )}
    </div>
  );
}

// The verification record — what a registry said about this business, and when.
//
// THE ONE PANEL HERE THAT CAN SAY SOMETHING UNFLATTERING, and that is the
// point of it. Every other surface on this page shows what is currently true:
// the badge, the vouch count, the recommendations. A counterparty deciding
// whether to trust this business with work needs the other half — that the
// SSM verification they can see today was granted in April, or that one they
// cannot see was lost in August. No other directory will print that.
//
// FACTS AND DATES, NO SCORE. Each row is an event on a day. There is no
// aggregate and no rating: a dated fact is defensible, a number is an opinion
// somebody will eventually dispute.
//
// Public to everyone including logged-out visitors, on every plan — see the
// note on the server side in routes/businesses.js. Charging to find out that
// a verification lapsed would invert the entire product.
const TIMELINE_COPY = {
  business_claimed: "Claimed by its owner",
  business_verified: "SSM-verified",
  business_verification_revoked: "SSM verification revoked",
};

function VerificationTimeline({ entries }) {
  if (!entries || entries.length === 0) return null;

  return (
    <div className="rounded-2xl border border-grey-200 bg-white p-6 dark:border-border dark:bg-card">
      <h2 className="text-lg font-semibold tracking-tight text-ink dark:text-foreground">
        Verification record
      </h2>
      <p className="mt-1 text-sm text-grey-500 dark:text-muted-foreground">
        What changed, and when. Including anything that was later withdrawn.
      </p>
      <ol className="mt-4 space-y-3">
        {entries.map((entry) => {
          const revoked = entry.type === "business_verification_revoked";
          const lapsed = !entry.inForce;
          return (
            <li key={entry.id} className="flex gap-3 text-sm">
              {/* Date first and in mono, because this panel is read as a
                  record rather than prose — the eye should land on when. */}
              <span className="w-24 shrink-0 font-mono text-xs text-grey-500 dark:text-muted-foreground">
                {new Date(entry.at).toLocaleDateString()}
              </span>
              <span className="min-w-0">
                <span
                  className={
                    lapsed
                      ? "text-grey-500 line-through dark:text-muted-foreground"
                      : "text-ink dark:text-foreground"
                  }
                >
                  {TIMELINE_COPY[entry.type] ?? entry.type}
                </span>
                {/* Struck through AND labelled. The strike alone reads as a
                    style; the words are what a reader takes away, and this is
                    the line the whole panel exists to show. */}
                {lapsed && (
                  <span className="ml-2 text-xs text-grey-500 dark:text-muted-foreground">
                    no longer in force
                  </span>
                )}
                {revoked && (
                  <span className="ml-2 text-xs text-grey-500 dark:text-muted-foreground">
                    dropped to{" "}
                    {verificationLevelLabel[entry.level] ?? entry.level}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// Deliberately NOT shaped like VouchCard above.
//
// A vouch is two-party and unconditional: one business staking its own
// reputation on another, in italics behind the yellow left rule that is the
// vouch's visual signature. A recommendation is three-party and answers a
// specific question — X told Y about this business when Y asked for something.
//
// So: no yellow rule, no italics, and all three parties named. If the two
// rendered alike they would be read as the same claim, and the weaker one
// would quietly borrow the stronger one's credibility.
function RecommendationCard({ recommendation }) {
  const { answeredBy, ask } = recommendation;
  return (
    <div className="rounded-2xl border border-grey-200 bg-white p-5 dark:border-border dark:bg-card">
      <div className="text-sm text-ink dark:text-foreground">
        <span className="font-semibold">{answeredBy.name}</span> recommended
        them when{" "}
        <span className="font-semibold">{ask.askedByBusiness.name}</span> asked
        for something.
      </div>
      <div className="mt-1 text-xs text-grey-500 dark:text-muted-foreground">
        {ask.title} ·{" "}
        {recommendation.acceptedAt
          ? new Date(recommendation.acceptedAt).toLocaleDateString()
          : null}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-grey-600 dark:text-muted-foreground">
        {recommendation.comment}
      </p>
    </div>
  );
}

// Arriving via a Link that set state={{ from, label }} (the NFC tap page,
// the Network tab) returns you there instead of always dropping back to
// the directory — a bookmark or direct visit has no such state, so it
// falls back to the directory in that case.
function useBackLink(inApp) {
  const location = useLocation();
  return {
    to: location.state?.from ?? (inApp ? "/app/directory" : "/directory"),
    label: location.state?.label ?? "Back to directory",
  };
}

function BusinessProfile({ inApp = false }) {
  const { id } = useParams();
  const backLink = useBackLink(inApp);
  const { business: actingBusiness } = useAuth();
  const { connectionStateWith, connect, disconnect } = useConnections();
  const { isFollowing, follow, unfollow } = useFollows();
  const [vouchOpen, setVouchOpen] = useState(false);
  // Controlled rather than defaultValue, so ?tab=recommendations is a link
  // target — which is where the ask_recommendation_received activity event
  // points. Same shape Vouches.jsx uses: unknown values fall back, and the
  // default tab omits the param entirely.
  const [tabParams, setTabParams] = useSearchParams();
  const PROFILE_TABS = ["overview", "vouches", "recommendations", "card"];
  const tab = PROFILE_TABS.includes(tabParams.get("tab"))
    ? tabParams.get("tab")
    : "overview";
  const setTab = (value) => {
    const next = new URLSearchParams(tabParams);
    if (value === "overview") next.delete("tab");
    else next.set("tab", value);
    setTabParams(next, { replace: true });
  };
  const [business, setBusiness] = useState(null);
  const [error, setError] = useState(null);
  const [loadedId, setLoadedId] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchBusiness(id)
      .then((result) => {
        if (cancelled) return;
        setBusiness(result);
        setError(null);
        setLoadedId(id);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.status === 404 ? "notfound" : "error");
        setLoadedId(id);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const status = loadedId !== id ? "loading" : (error ?? "ready");

  // Submitting a vouch no longer changes anything visible immediately —
  // it's pending until the receiver accepts (see the Vouch review state
  // machine) — but refetching keeps this page consistent with the
  // backend rather than silently going stale.
  function refetchBusiness() {
    fetchBusiness(id)
      .then(setBusiness)
      .catch(() => {});
  }

  // Deliberately NOT part of `canVouch` below. The plan gate decides what
  // the button DOES, not whether it renders — a Free member browsing the
  // directory is exactly who this feature is being sold to, and hiding the
  // button from them would hide the pitch too. Every other clause in
  // `canVouch` is a fact about the pair (wrong tier, own business, already
  // vouched) that no amount of money changes, which is why those still hide
  // it. See components/app/UpgradePrompt.jsx.
  const vouchGate = useUpgradeGate("giveVouch");
  const canVouch =
    inApp &&
    VOUCHABLE_VERIFICATION_LEVELS.has(actingBusiness?.verificationLevel) &&
    isVouchable(business, actingBusiness);
  // Governs both buttons below: you have to be in the app, looking at
  // somebody else, and that somebody has to be claimed. An unclaimed listing
  // has no owner to agree to a connection or to generate anything worth
  // following.
  const canRelate =
    inApp &&
    actingBusiness &&
    business &&
    actingBusiness.id !== business.id &&
    business.verificationLevel !== UNCLAIMED;

  // Four states, not two, since connections became mutual — see
  // connectionStateWith in ConnectionsContext. Resolved here rather than in
  // the JSX so the button below reads as one switch on one value.
  const { state: connectState, connection } = canRelate
    ? connectionStateWith(business.id)
    : { state: "none", connection: null };

  // Sends a request, or accepts theirs. The server handles the second case
  // inside POST /connections — pressing Connect on someone who already asked
  // you IS accepting, and bouncing them to the Requests tab to press a second
  // button would be asking the same question twice.
  async function handleConnect() {
    setConnecting(true);
    const wasIncoming = connectState === "incoming";
    const result = await connect(business.id, SOURCE_DIRECTORY);
    setConnecting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    // Worded from what actually happened, not from what was pressed. A
    // directory connect normally lands "pending", and telling someone
    // "Connected" when the other side hasn't answered is the exact lie the
    // approval step was added to stop.
    if (wasIncoming || result.connection?.status === "accepted") {
      toast.success(`You're connected with ${business.name}`);
    } else {
      toast.success(`Request sent to ${business.name}`);
    }
  }

  async function handleWithdraw() {
    if (!connection) return;
    setConnecting(true);
    const result = await disconnect(connection.id);
    setConnecting(false);
    if (result.ok) toast(`Withdrew your request to ${business.name}`);
    else toast.error(result.error);
  }

  async function handleFollowToggle() {
    setFollowBusy(true);
    const wasFollowing = isFollowing(business.id);
    const result = wasFollowing
      ? await unfollow(business.id)
      : await follow(business);
    setFollowBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    // Says out loud that they aren't told. Following looks like a social
    // action and isn't one; a member who assumes otherwise has been misled by
    // the button.
    toast(
      wasFollowing
        ? `Unfollowed ${business.name}`
        : `Following ${business.name} — they aren't notified`,
    );
  }

  if (status === "loading") {
    return (
      <div className="mx-auto max-w-[1200px] px-6 py-24 text-center">
        <p className="text-grey-600 dark:text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (status !== "ready") {
    return (
      <div className="mx-auto max-w-[1200px] px-6 py-24 text-center">
        <p className="text-grey-600 dark:text-muted-foreground">
          {status === "notfound"
            ? "We couldn't find that business."
            : "Something went wrong loading this business. Please try again."}
        </p>
        <Link
          to={backLink.to}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-ink hover:underline dark:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {backLink.label}
        </Link>
      </div>
    );
  }

  const isUnclaimed = business.verificationLevel === UNCLAIMED;
  const isPendingVerification = business.verificationLevel === CLAIMED;
  // vouchCount comes from the server rather than vouchesReceived.length:
  // on a free business the array is withheld but the count is not, and
  // conflating them is what would silently show "0 vouches" for a business
  // that has twelve.
  const { services, vouchesReceived, ssm, vouchCount, testimonialsLocked } =
    business;
  const { contactLocked, contactLockedReason } = business;
  // Defaulted, because this profile is also rendered from the NFC tap page
  // and by the app-side route, and an older cached payload has neither key.
  const recommendationCount = business.recommendationCount ?? 0;
  const recommendations = business.recommendationsReceived ?? [];

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link
        to={backLink.to}
        className="inline-flex items-center gap-1.5 text-sm font-bold text-grey-600 hover:text-ink dark:text-muted-foreground dark:hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {backLink.label}
      </Link>

      <div className="mt-6 rounded-3xl border border-grey-200 bg-white p-6 dark:border-border dark:bg-card md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-ink text-2xl font-semibold text-yellow dark:bg-foreground dark:text-background">
              {business.name.charAt(0)}
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-grey-500 dark:text-muted-foreground">
                Business profile
              </div>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink dark:text-foreground md:text-4xl">
                {business.name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-grey-600 dark:text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="h-4 w-4" /> {business.category}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" /> {business.location}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {/* Tappable, and this is THE surface the explainer exists
                    for: a visitor meeting "L2" on a business they don't know
                    has no other way to find out what it means, and won't
                    leave this page to go looking. `business` is the company
                    being LOOKED AT, so the dialog marks their rung, never
                    the viewer's. */}
                <ExplainBadge axis="verification" business={business}>
                  <VerificationBadge
                    verificationLevel={business.verificationLevel}
                    size="inline"
                    chip
                  />
                </ExplainBadge>
                {canRelate &&
                  (connectState === "connected" ? (
                    <Button size="sm" variant="secondary" disabled>
                      Connected
                    </Button>
                  ) : connectState === "requested" ? (
                    // Live, not disabled: "Requested" with no way out strands
                    // the member on a request they can't take back. This is
                    // the withdraw affordance, and the only place one exists
                    // outside the Requests tab.
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleWithdraw}
                      disabled={connecting}
                    >
                      <Clock className="h-3.5 w-3.5" />
                      {connecting ? "Withdrawing…" : "Requested · Withdraw"}
                    </Button>
                  ) : connectState === "incoming" ? (
                    <Button
                      size="sm"
                      onClick={handleConnect}
                      disabled={connecting}
                    >
                      {connecting ? "Accepting…" : "Accept request"}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={handleConnect}
                      disabled={connecting}
                    >
                      {connecting ? "Sending…" : "Connect"}
                    </Button>
                  ))}
                {/* Always offered alongside Connect, never instead of it, and
                    never gated by plan. Following is the thing a member can
                    always do about a business they aren't going to connect
                    with — no approval, nobody told. */}
                {canRelate && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleFollowToggle}
                    disabled={followBusy}
                  >
                    {isFollowing(business.id) ? "Following" : "Follow"}
                  </Button>
                )}
                {canVouch && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={vouchGate.guard(() => setVouchOpen(true))}
                  >
                    Vouch
                  </Button>
                )}
              </div>
            </div>
          </div>

          {isUnclaimed && (
            <div className="text-right">
              {/* The growth loop, and its only piece of UI. Members can
                  recommend an unclaimed listing — the recommendation is real
                  and waiting, it just has nowhere to render until this
                  business claims. Naming the COUNT and withholding the NAMES
                  is the whole pull; the outbound invite that would push it
                  needs a messaging pipe that doesn't exist yet. */}
              {recommendationCount > 0 && (
                <p className="mb-2 max-w-64 text-sm text-grey-600 dark:text-muted-foreground">
                  <span className="font-semibold text-ink dark:text-foreground">
                    {recommendationCount}{" "}
                    {recommendationCount === 1 ? "member has" : "members have"}
                  </span>{" "}
                  recommended this business. Claim your listing to see who, and
                  why.
                </p>
              )}
              <Button
                render={<Link to={`/register?business=${business.id}`} />}
                nativeButton={false}
              >
                Claim your business
              </Button>
            </div>
          )}
        </div>

        {!isUnclaimed ? (
          <div className="mt-6 grid gap-4 border-t border-grey-200 pt-6 dark:border-border sm:grid-cols-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-grey-500 dark:text-muted-foreground">
                SSM Record
              </div>
              <div className="mt-1 font-mono text-sm text-ink dark:text-foreground">
                {ssm ? `Reg. ${ssm}` : "Not yet provided"}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-grey-500 dark:text-muted-foreground">
                Vouches Received
              </div>
              <div className="mt-1 text-sm text-ink dark:text-foreground">
                {isPendingVerification
                  ? "Unlocks after SSM verification"
                  : vouchCount > 0
                    ? `${vouchCount} peers`
                    : "No vouches yet"}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-grey-500 dark:text-muted-foreground">
                Category
              </div>
              <div className="mt-1 text-sm text-ink dark:text-foreground">
                {business.category}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-md border border-grey-200 bg-surface p-5 dark:border-border dark:bg-muted">
            <p className="text-sm font-bold text-ink dark:text-foreground">
              This listing hasn't been claimed yet.
            </p>
            <p className="mt-1 text-[13.5px] text-grey-600 dark:text-muted-foreground">
              Are you the owner? Claim this business to verify it and start
              building your vouch reputation.
            </p>
          </div>
        )}

        {isPendingVerification && (
          <div className="mt-4 rounded-md border border-dashed border-grey-300 bg-surface p-4 dark:border-border dark:bg-muted">
            <p className="text-[13.5px] font-bold text-ink dark:text-foreground">
              Claimed · SSM verification pending
            </p>
            <p className="mt-1 text-[13px] text-grey-600 dark:text-muted-foreground">
              This business was recently claimed by its owner. We're manually
              verifying it against SSM records — vouches and the NFC card unlock
              once that's complete.
            </p>
          </div>
        )}
      </div>

      {!isUnclaimed && (
        <Tabs value={tab} onValueChange={setTab} className="mt-8">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="vouches">
              Vouches ({isPendingVerification ? 0 : vouchCount})
            </TabsTrigger>
            {/* Always AFTER Vouches, never first and never the default. A
                recommendation is the lighter of the two signals and the tab
                order is where that has to be visible. It gets no cell in the
                stat grid above and no badge anywhere — that grid is the trust
                grid, and a fourth number in it would read as a fourth trust
                signal. */}
            <TabsTrigger value="recommendations">
              Recommendations ({recommendationCount})
            </TabsTrigger>
            <TabsTrigger value="card">NFC Card</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6 space-y-6">
            <div className="rounded-2xl border border-grey-200 bg-white p-6 dark:border-border dark:bg-card">
              <h2 className="text-lg font-semibold tracking-tight text-ink dark:text-foreground">
                About
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-grey-600 dark:text-muted-foreground">
                {business.description}
              </p>
            </div>
            <VerificationTimeline entries={business.verificationTimeline} />
            {/* Directly under the verification record: both are the factual
                half of this profile — what a registry said, and what a
                counterparty confirmed. The evaluative half (vouches,
                recommendations) lives in its own tabs. */}
            <EngagementRecord
              entries={business.engagements}
              summary={business.engagementSummary}
              businessName={business.name}
            />
            {/* No tier lock of its own here. On T0 this whole tab isn't
                rendered (the unclaimed panel replaces it), and on T1 the
                plan gate already covers it via reason "owner_plan". The
                verification-beats-plan rule used on the vouches and card
                tabs applies to features verification actually UNLOCKS —
                contact details aren't one of those. */}
            <ContactDetails
              business={business}
              contactLocked={contactLocked}
              contactLockedReason={contactLockedReason}
            />
            {services.length > 0 && (
              <div className="rounded-2xl border border-grey-200 bg-white p-6 dark:border-border dark:bg-card">
                <h2 className="text-lg font-semibold tracking-tight text-ink dark:text-foreground">
                  Services
                </h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {services.map((s) => (
                    <span
                      key={s}
                      className="rounded-full border border-grey-200 bg-surface px-3 py-1 text-sm text-grey-700 dark:border-border dark:bg-secondary dark:text-secondary-foreground"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent
            value="vouches"
            className="mt-6 grid gap-4 md:grid-cols-2"
          >
            {/* Tier lock wins when both apply: a T1 business can't have
                published vouches at all, so "get verified" is the more
                useful thing to say than "this is on a paid plan". */}
            {isPendingVerification ? (
              <div className="md:col-span-2">
                <LockedFeature
                  title="Vouches locked"
                  description="Vouches unlock once this business is SSM-verified."
                />
              </div>
            ) : testimonialsLocked && vouchCount > 0 ? (
              // Deliberately not an upgrade pitch. A visitor reading
              // someone else's profile is the wrong person to sell to —
              // the pressure belongs on the owner, who sees it on their
              // own /app/profile. The "N peers" count above is what
              // actually does the work here.
              <div className="md:col-span-2">
                <LockedFeature
                  title="Written vouches not shown"
                  description={`${vouchCount} ${vouchCount === 1 ? "business has" : "businesses have"} vouched for this company. Their written vouches aren't displayed on this profile.`}
                />
              </div>
            ) : vouchesReceived.length > 0 ? (
              vouchesReceived.map((v) => <VouchCard key={v.id} vouch={v} />)
            ) : (
              <p className="text-sm text-grey-500 dark:text-muted-foreground">
                No vouches yet.
              </p>
            )}
          </TabsContent>

          {/* Not plan-gated, unlike the vouches tab above. Withholding this
              would punish the RECOMMENDER, whose work would vanish because of
              somebody else's billing — and it feeds neither vouchCount nor
              the vouch level, so a downgrade has nothing to take away. */}
          <TabsContent
            value="recommendations"
            className="mt-6 grid gap-4 md:grid-cols-2"
          >
            {recommendations.length > 0 ? (
              recommendations.map((r) => (
                <RecommendationCard key={r.id} recommendation={r} />
              ))
            ) : (
              // Says the difference out loud, because this is the one place a
              // reader might otherwise conclude the two words mean the same.
              <p className="text-sm text-grey-500 md:col-span-2 dark:text-muted-foreground">
                No recommendations yet. Recommendations come from members
                answering someone's ask — they're not vouches. A vouch is a peer
                staking their own reputation on this business; a recommendation
                is a peer pointing someone towards them.
              </p>
            )}
          </TabsContent>

          <TabsContent value="card" className="mt-6">
            {isPendingVerification ? (
              <LockedFeature
                title="NFC card locked"
                description="The physical trust token unlocks once this business is SSM-verified."
              />
            ) : (
              <div className="rounded-3xl border border-grey-200 bg-white p-6 dark:border-border dark:bg-card">
                <div className="text-xs font-medium uppercase tracking-wider text-grey-500 dark:text-muted-foreground">
                  Physical trust token
                </div>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink dark:text-foreground">
                  Verified via NFC
                </h2>
                <p className="mt-2 text-sm text-grey-600 dark:text-muted-foreground">
                  This business carries an ABRI card. Verification status
                  renders before contact details on every tap.
                </p>

                <div className="mt-6 max-w-md">
                  <div className="relative aspect-[1.586/1] overflow-hidden rounded-2xl border border-ink/10 bg-ink p-6 text-yellow shadow-lg dark:border-foreground/10 dark:bg-foreground dark:text-background">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-[10px] font-medium uppercase tracking-widest opacity-60">
                          ABRI · Verified
                        </div>
                        <div className="mt-6 text-xl font-semibold">
                          {business.name}
                        </div>
                        <div className="text-xs opacity-70">
                          {business.category}
                        </div>
                      </div>
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-yellow text-sm font-bold text-yellow-ink dark:bg-accent dark:text-accent-foreground">
                        A
                      </div>
                    </div>
                    <div className="absolute right-6 bottom-5 left-6 flex items-end justify-between font-mono text-[10px] opacity-70">
                      <span>{ssm ? `SSM ${ssm}` : "SSM pending"}</span>
                      <span className="inline-flex items-center gap-1.5">
                        <Radio className="h-3 w-3" /> TAP TO VERIFY
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {canVouch && (
        <>
          <VouchDialog
            open={vouchOpen}
            onOpenChange={setVouchOpen}
            targetBusiness={business}
            onSuccess={refetchBusiness}
          />
          <UpgradePrompt gate={vouchGate} />
        </>
      )}
    </div>
  );
}

export { BusinessProfile };
