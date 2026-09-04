import { useEffect, useState } from "react";
import { Link, useLocation, useParams, useSearchParams} from "react-router-dom";
import { ArrowLeft, MapPin, Building2, Radio, Clock } from "lucide-react";

import { isVouchable, VOUCHABLE_VERIFICATION_LEVELS } from "@/lib/vouchRules";
import { fetchBusiness } from "@/lib/api/businesses";
import { useConnections } from "@/context/ConnectionsContext";
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
          <div className="font-semibold text-ink dark:text-foreground">{vouch.fromBusiness.name}</div>
          <div className="text-xs text-grey-500 dark:text-muted-foreground">
            {vouch.fromBusiness.category} · {new Date(vouch.createdAt).toLocaleDateString()}
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
  const [vouchOpen, setVouchOpen] = useState(false);
  // Controlled rather than defaultValue, so ?tab=vouches is a link target.
  // Same shape Vouches.jsx uses: unknown values fall back, and the default
  // tab omits the param entirely.
  const [tabParams, setTabParams] = useSearchParams();
  const PROFILE_TABS = ["overview", "vouches", "card"];
  const tab = PROFILE_TABS.includes(tabParams.get("tab")) ? tabParams.get("tab") : "overview";
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
    inApp && VOUCHABLE_VERIFICATION_LEVELS.has(actingBusiness?.verificationLevel) && isVouchable(business, actingBusiness);
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
  const { services, vouchesReceived, ssm, vouchCount, testimonialsLocked } = business;
  const { contactLocked, contactLockedReason } = business;

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
                  <VerificationBadge verificationLevel={business.verificationLevel} size="inline" chip />
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
                    <Button size="sm" variant="secondary" onClick={handleWithdraw} disabled={connecting}>
                      <Clock className="h-3.5 w-3.5" />
                      {connecting ? "Withdrawing…" : "Requested · Withdraw"}
                    </Button>
                  ) : connectState === "incoming" ? (
                    <Button size="sm" onClick={handleConnect} disabled={connecting}>
                      {connecting ? "Accepting…" : "Accept request"}
                    </Button>
                  ) : (
                    <Button size="sm" onClick={handleConnect} disabled={connecting}>
                      {connecting ? "Sending…" : "Connect"}
                    </Button>
                  ))}
                {canVouch && (
                  <Button size="sm" variant="outline" onClick={vouchGate.guard(() => setVouchOpen(true))}>
                    Vouch
                  </Button>
                )}
              </div>
            </div>
          </div>

          {isUnclaimed && (
            <Button
              render={<Link to={`/register?business=${business.id}`} />}
              nativeButton={false}
            >
              Claim your business
            </Button>
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
              <div className="mt-1 text-sm text-ink dark:text-foreground">{business.category}</div>
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
              verifying it against SSM records — vouches and the NFC card
              unlock once that's complete.
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
            <TabsTrigger value="card">NFC Card</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6 space-y-6">
            <div className="rounded-2xl border border-grey-200 bg-white p-6 dark:border-border dark:bg-card">
              <h2 className="text-lg font-semibold tracking-tight text-ink dark:text-foreground">About</h2>
              <p className="mt-3 text-sm leading-relaxed text-grey-600 dark:text-muted-foreground">
                {business.description}
              </p>
            </div>
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
                <h2 className="text-lg font-semibold tracking-tight text-ink dark:text-foreground">Services</h2>
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

          <TabsContent value="vouches" className="mt-6 grid gap-4 md:grid-cols-2">
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
              <p className="text-sm text-grey-500 dark:text-muted-foreground">No vouches yet.</p>
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
                  This business carries an ABRI card. Verification status renders before contact
                  details on every tap.
                </p>

                <div className="mt-6 max-w-md">
                  <div className="relative aspect-[1.586/1] overflow-hidden rounded-2xl border border-ink/10 bg-ink p-6 text-yellow shadow-lg dark:border-foreground/10 dark:bg-foreground dark:text-background">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-[10px] font-medium uppercase tracking-widest opacity-60">
                          ABRI · Verified
                        </div>
                        <div className="mt-6 text-xl font-semibold">{business.name}</div>
                        <div className="text-xs opacity-70">{business.category}</div>
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
          <VouchDialog open={vouchOpen} onOpenChange={setVouchOpen} targetBusiness={business} onSuccess={refetchBusiness} />
          <UpgradePrompt gate={vouchGate} />
        </>
      )}
    </div>
  );
}

export { BusinessProfile };
