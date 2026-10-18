import { useEffect, useState } from "react";
import {
  Link,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { ArrowLeft, MapPin, Building2, Clock } from "lucide-react";

import { isEndorsable, ENDORSABLE_VERIFICATION_LEVELS } from "@/lib/endorsementRules";
import { fetchBusiness } from "@/lib/api/businesses";
import { useConnections } from "@/context/ConnectionsContext";
import { useFollows } from "@/context/FollowsContext";
import { SOURCE_DIRECTORY } from "@/lib/connectionSources";
import { Button } from "@/components/ui/button";
import { VerificationBadge } from "@/components/badge/VerificationBadge";
import { ExplainBadge } from "@/components/badge/BadgeExplainer";
import {
  AboutSection,
  CardSection,
  ClaimStrip,
  ContactSection,
  KeyFacts,
  PortfolioSection,
  VerificationSection,
  EndorsementsSection,
} from "@/components/business/ProfileSections";
import { EndorseDialog } from "@/components/app/EndorseDialog";
import { UpgradePrompt, useUpgradeGate } from "@/components/app/UpgradePrompt";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/lib/toast";
import { UNCLAIMED } from "@/lib/verificationLevels";

function EndorsementCard({ endorsement }) {
  return (
    <div className="rounded-2xl border border-grey-200 bg-white p-5 dark:border-border dark:bg-card">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink text-sm font-semibold text-yellow dark:bg-foreground dark:text-background">
          {endorsement.fromBusiness.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-ink dark:text-foreground">
            {endorsement.fromBusiness.name}
          </div>
          <div className="text-xs text-grey-500 dark:text-muted-foreground">
            {endorsement.fromBusiness.category} ·{" "}
            {new Date(endorsement.createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>
      {/* Guarded because the field is nullable in principle — an unguarded
          interpolation renders a bordered blockquote containing two bare
          quote marks, which reads as a bug rather than as absence. */}
      {endorsement.testimonial && (
        <blockquote className="mt-4 border-l-2 border-yellow pl-4 text-sm italic text-grey-700 dark:text-foreground">
          "{endorsement.testimonial}"
        </blockquote>
      )}
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
  const [endorsementOpen, setEndorsementOpen] = useState(false);
  // Two designs of the same standard sections, being compared (28 Sep 2026):
  // "cards" (each section its own card) and "single" (one card). ?layout=single
  // picks the second; the switch that sets it only renders in development.
  const [layoutParams, setLayoutParams] = useSearchParams();
  const layout = layoutParams.get("layout") === "single" ? "single" : "cards";
  const setLayout = (value) => {
    const next = new URLSearchParams(layoutParams);
    if (value === "cards") next.delete("layout");
    else next.set("layout", value);
    setLayoutParams(next, { replace: true });
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

  // Submitting an endorsement no longer changes anything visible immediately —
  // it's pending until the receiver accepts (see the Endorsement review state
  // machine) — but refetching keeps this page consistent with the
  // backend rather than silently going stale.
  function refetchBusiness() {
    fetchBusiness(id)
      .then(setBusiness)
      .catch(() => {});
  }

  // Deliberately NOT part of `canEndorse` below. The plan gate decides what
  // the button DOES, not whether it renders — a Free member browsing the
  // directory is exactly who this feature is being sold to, and hiding the
  // button from them would hide the pitch too. Every other clause in
  // `canEndorse` is a fact about the pair (wrong tier, own business, already
  // endorsed) that no amount of money changes, which is why those still hide
  // it. See components/app/UpgradePrompt.jsx.
  const endorsementGate = useUpgradeGate("giveEndorsement");
  const canEndorse =
    inApp &&
    ENDORSABLE_VERIFICATION_LEVELS.has(actingBusiness?.verificationLevel) &&
    isEndorsable(business, actingBusiness);
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

  // The standard sections, in order — see components/business/ProfileSections.jsx.
  const sections = (
    <>
      {/* Contact first: finding or reaching the business is why most
          visitors land here, and on a seeded listing it's most of what
          there is. */}
      <ContactSection layout={layout} business={business} first />
      <AboutSection layout={layout} business={business} />
      <VerificationSection layout={layout} business={business} />
      <EndorsementsSection layout={layout} business={business} EndorsementCard={EndorsementCard} />
      <PortfolioSection layout={layout} business={business} />
      <CardSection layout={layout} business={business} />
    </>
  );

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link
        to={backLink.to}
        className="inline-flex items-center gap-1.5 text-sm font-bold text-grey-600 hover:text-ink dark:text-muted-foreground dark:hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {backLink.label}
      </Link>

      {import.meta.env.DEV && (
        <div className="float-right inline-flex rounded-full border border-grey-300 p-0.5 text-xs dark:border-border">
          {[["cards", "Cards"], ["single", "One card"]].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setLayout(value)}
              className={`rounded-full px-3 py-1 font-semibold ${layout === value ? "bg-ink text-yellow dark:bg-grey-700" : "text-grey-600 dark:text-muted-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

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
                {business.location && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" /> {business.location}
                  </span>
                )}
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
                {canEndorse && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={endorsementGate.guard(() => setEndorsementOpen(true))}
                  >
                    Endorse
                  </Button>
                )}
              </div>
            </div>
          </div>

        </div>

        <KeyFacts business={business} />
        {isUnclaimed && <ClaimStrip business={business} />}

        {layout === "single" && sections}
      </div>

      {layout === "cards" && <div className="mt-6 space-y-6">{sections}</div>}

      {canEndorse && (
        <>
          <EndorseDialog
            open={endorsementOpen}
            onOpenChange={setEndorsementOpen}
            targetBusiness={business}
            onSuccess={refetchBusiness}
          />
          <UpgradePrompt gate={endorsementGate} />
        </>
      )}
    </div>
  );
}

export { BusinessProfile };
