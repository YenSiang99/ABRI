import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Building2, MapPin, Radio, Users } from "lucide-react";

import { fetchBusiness } from "@/lib/api/businesses";
import { useConnections } from "@/context/ConnectionsContext";
import { SOURCE_NFC_SCAN } from "@/lib/connectionSources";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { VerificationBadge } from "@/components/badge/VerificationBadge";

function BackLink() {
  return (
    <Link
      to="/directory"
      className="inline-flex items-center gap-1.5 text-sm font-bold text-grey-600 hover:text-ink dark:text-muted-foreground dark:hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      Back to directory
    </Link>
  );
}

function CardPanel({ business, children }) {
  const location = useLocation();
  return (
    <div className="mt-6 rounded-3xl border border-grey-200 bg-white p-6 dark:border-border dark:bg-card md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-ink text-2xl font-semibold text-yellow dark:bg-foreground dark:text-background">
            {business.name.charAt(0)}
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-grey-500 dark:text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Radio className="h-3.5 w-3.5" /> Tapped a card
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink dark:text-foreground md:text-3xl">
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
            <div className="mt-3">
              <VerificationBadge tier={business.tier} size="inline" chip />
            </div>
          </div>
        </div>
        <Link
          to={`/business/${business.id}`}
          state={{ from: location, label: "Back to tapped card" }}
          className="inline-flex items-center gap-1.5 rounded-full border border-grey-300 px-3.5 py-1.5 text-xs font-bold text-ink transition-colors hover:bg-surface-2 dark:border-border dark:text-foreground dark:hover:bg-muted"
        >
          View business profile <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {children}
    </div>
  );
}

function CardTap() {
  const { businessId } = useParams();
  const location = useLocation();
  const { isAuthenticated, business: myBusiness, loading: authLoading } = useAuth();
  const { isConnected, connect } = useConnections();
  // Holds the businessId this page has already fired a POST for, so a
  // re-render doesn't fire a second one but navigating to a different card
  // does. A boolean would stick across that navigation.
  const attemptedRef = useRef(null);
  const [business, setBusiness] = useState(null);
  const [error, setError] = useState(null);
  const [loadedId, setLoadedId] = useState(null);
  // The connect attempt's own state, kept apart from `error` above (which is
  // about resolving the card itself): a tap that found the business but
  // couldn't connect is a different thing to say, and the page still has a
  // real business to render. Phases: idle → connecting → connected | already
  // | error. Every path out of "connecting" lands on one of the last three,
  // which is what stops the page from sitting on the spinner forever.
  //
  // Carries the card it belongs to, and is read back through `connectPhase`
  // below, so navigating from one card to another drops the previous card's
  // result without an effect that resets it — the same shape as `loadedId`
  // above.
  const [connectState, setConnectState] = useState({ id: null, phase: "idle", error: null });

  useEffect(() => {
    let cancelled = false;
    fetchBusiness(businessId)
      .then((result) => {
        if (cancelled) return;
        setBusiness(result);
        setError(null);
        setLoadedId(businessId);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.status === 404 ? "notfound" : "error");
        setLoadedId(businessId);
      });
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  const status = loadedId !== businessId || authLoading ? "loading" : (error ?? "ready");
  const isThisCard = connectState.id === businessId;
  const connectPhase = isThisCard ? connectState.phase : "idle";
  const connectError = isThisCard ? connectState.error : null;

  const isSelf = isAuthenticated && myBusiness?.id === businessId;
  const alreadyConnected = Boolean(myBusiness && isConnected(businessId));
  // Deliberately does NOT wait on the connections list to load. The POST is
  // idempotent and tells us in its response whether it created the edge, so
  // it's the authority on both questions this page asks — am I connected,
  // and did that just happen. Gating on the list instead meant any failure
  // to load it (a 404 from a stale server, an offline moment) left the tap
  // with nothing to do and no way to say so.
  // `alreadyConnected` is here only to skip a pointless request when we
  // happen to know the answer — not as a precondition. False because the
  // list hasn't loaded is indistinguishable from false because they aren't
  // connected, and the POST resolves both.
  const canConnect =
    isAuthenticated &&
    myBusiness &&
    business &&
    !isSelf &&
    business.tier !== "T0" &&
    !alreadyConnected;

  async function attemptConnect(target) {
    setConnectState({ id: target, phase: "connecting", error: null });
    const result = await connect(target, SOURCE_NFC_SCAN);
    setConnectState(
      result.ok
        ? { id: target, phase: result.created ? "connected" : "already", error: null }
        : { id: target, phase: "error", error: result.error },
    );
  }

  useEffect(() => {
    if (!canConnect || attemptedRef.current === businessId) return;
    // Set before the await, not after: past the first suspension point a
    // second invocation has already read the old value. The real guarantee
    // against a double POST is that the endpoint is idempotent; this just
    // keeps the common case to one request.
    attemptedRef.current = businessId;
    attemptConnect(businessId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canConnect, businessId]);

  if (status === "loading") {
    return (
      <div className="mx-auto max-w-[640px] px-6 py-16">
        <BackLink />
        <div className="mt-6 rounded-lg border border-grey-200 bg-white p-8 text-center dark:border-border dark:bg-card">
          <p className="text-sm text-grey-600 dark:text-muted-foreground">Reading this card…</p>
        </div>
      </div>
    );
  }

  // Only a genuine 404 means the card is bad. A network or server failure
  // gets its own message — telling someone their card isn't a real business
  // when the request merely failed is a bad thing to be wrong about.
  if (!business) {
    return (
      <div className="mx-auto max-w-[640px] px-6 py-16">
        <BackLink />
        <div className="mt-6 rounded-lg border border-grey-200 bg-white p-8 text-center dark:border-border dark:bg-card">
          <p className="text-sm text-grey-600 dark:text-muted-foreground">
            {error === "notfound"
              ? "This card doesn't match a business on ABRI."
              : "Couldn't reach ABRI to read this card. Check your connection and try again."}
          </p>
        </div>
      </div>
    );
  }

  if (business.tier === "T0") {
    return (
      <div className="mx-auto max-w-[640px] px-6 py-16">
        <BackLink />
        <CardPanel business={business}>
          <div className="mt-6 rounded-md border border-grey-200 bg-surface p-5 dark:border-border dark:bg-muted">
            <p className="text-sm font-bold text-ink dark:text-foreground">
              This business isn't on ABRI yet.
            </p>
            <p className="mt-1 text-[13.5px] text-grey-600 dark:text-muted-foreground">
              It doesn't have an owner to connect you with. Are you the owner? Claim it to get
              your own card.
            </p>
            <Button
              className="mt-4"
              render={<Link to={`/register?business=${business.id}`} />}
              nativeButton={false}
            >
              Claim this business
            </Button>
          </div>
        </CardPanel>
      </div>
    );
  }

  if (isSelf) {
    return (
      <div className="mx-auto max-w-[640px] px-6 py-16">
        <BackLink />
        <CardPanel business={business}>
          <p className="mt-6 text-[14px] text-grey-600 dark:text-muted-foreground">
            That's your own card — nothing to connect here.
          </p>
        </CardPanel>
      </div>
    );
  }

  // Logged in, but the account has no business to connect from — an admin,
  // or a claimant whose claim is still in review. They'd otherwise fall
  // through to the logged-out pitch below and be told to log in.
  if (isAuthenticated && !myBusiness) {
    return (
      <div className="mx-auto max-w-[640px] px-6 py-16">
        <BackLink />
        <CardPanel business={business}>
          <div className="mt-6 rounded-md border border-grey-200 bg-surface p-5 dark:border-border dark:bg-muted">
            <p className="text-sm font-bold text-ink dark:text-foreground">
              Nothing to connect from yet
            </p>
            <p className="mt-1 text-[13.5px] text-grey-600 dark:text-muted-foreground">
              Connections are between businesses, and your account doesn't have a claimed one
              yet. Once your claim is approved, tap this card again.
            </p>
          </div>
        </CardPanel>
      </div>
    );
  }

  if (isAuthenticated && connectPhase === "error") {
    return (
      <div className="mx-auto max-w-[640px] px-6 py-16">
        <BackLink />
        <CardPanel business={business}>
          <div className="mt-6 rounded-md border border-grey-200 bg-surface p-5 dark:border-border dark:bg-muted">
            <p className="text-sm font-bold text-ink dark:text-foreground">
              Couldn't connect with {business.name}
            </p>
            <p className="mt-1 text-[13.5px] text-grey-600 dark:text-muted-foreground">
              {connectError}
            </p>
            {/* The tap itself can't be repeated — they've already put the
                card down — so the retry has to live on the page. */}
            <Button className="mt-4" onClick={() => attemptConnect(businessId)}>
              Try again
            </Button>
          </div>
        </CardPanel>
      </div>
    );
  }

  const connectSettled = connectPhase === "connected" || connectPhase === "already";

  if (isAuthenticated && (alreadyConnected || connectSettled)) {
    // Only the server's answer can call it new: `alreadyConnected` becoming
    // true is just the list arriving, which says nothing about who added it.
    const isNew = connectPhase === "connected";
    return (
      <div className="mx-auto max-w-[640px] px-6 py-16">
        <BackLink />
        <CardPanel business={business}>
          <div className="mt-6 rounded-md border border-grey-200 bg-surface p-5 dark:border-border dark:bg-muted">
            <p className="inline-flex items-center gap-2 text-sm font-bold text-ink dark:text-foreground">
              <Users className="h-4 w-4" />
              {isNew ? "You're now connected" : "You're already connected"}
            </p>
            <p className="mt-1 text-[13.5px] text-grey-600 dark:text-muted-foreground">
              {isNew
                ? `${business.name} has been added to your network, and you to theirs.`
                : `${business.name} is already in your network, and you in theirs.`}
            </p>
            <Button className="mt-4" render={<Link to="/app/network" />} nativeButton={false}>
              View your network
            </Button>
          </div>
        </CardPanel>
      </div>
    );
  }

  // The request is in flight (or about to be — the effect fires on the
  // render right after this one). Every path out of it sets a terminal
  // phase above, so this state always resolves.
  if (isAuthenticated) {
    return (
      <div className="mx-auto max-w-[640px] px-6 py-16">
        <BackLink />
        <CardPanel business={business}>
          <div className="mt-6 rounded-md border border-grey-200 bg-surface p-5 dark:border-border dark:bg-muted">
            <p className="inline-flex items-center gap-2 text-sm font-bold text-ink dark:text-foreground">
              <Users className="h-4 w-4" />
              Adding {business.name} to your network…
            </p>
          </div>
        </CardPanel>
      </div>
    );
  }

  // Not authenticated — preview the card and offer both paths in. Login
  // reuses ProtectedRoute's existing state.from redirect-back mechanism, so
  // landing back here already-authenticated falls into the connect case
  // above. Register can't rely on router state (a manual-review claim may
  // not log the claimant in until days later, in another tab) so it carries
  // the connect target as a query param instead.
  return (
    <div className="mx-auto max-w-[640px] px-6 py-16">
      <BackLink />
      <CardPanel business={business}>
        <p className="mt-6 text-[14px] text-grey-600 dark:text-muted-foreground">
          Log in or register on ABRI to add {business.name} to your network — and be added to
          theirs.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button render={<Link to="/login" state={{ from: location }} />} nativeButton={false}>
            Log in to connect
          </Button>
          <Button
            variant="outline"
            render={<Link to={`/register?connect=${business.id}`} />}
            nativeButton={false}
          >
            Register to connect
          </Button>
        </div>
      </CardPanel>
    </div>
  );
}

export { CardTap };
