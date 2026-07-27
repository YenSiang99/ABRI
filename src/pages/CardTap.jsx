import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowLeft, Building2, MapPin, Radio, Users } from "lucide-react";

import { getBusiness, refreshBusinesses } from "@/lib/store/businesses";
import { refreshAccounts } from "@/lib/store/accounts";
import { addConnection, areConnected, refreshConnections } from "@/lib/store/connections";
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
  return (
    <div className="mt-6 rounded-3xl border border-grey-200 bg-white p-6 dark:border-border dark:bg-card md:p-8">
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
      {children}
    </div>
  );
}

function CardTap() {
  const { businessId } = useParams();
  const location = useLocation();
  const { isAuthenticated, business: myBusiness } = useAuth();
  const connectedRef = useRef(false);
  const [justConnected, setJustConnected] = useState(false);

  useEffect(() => {
    // A scan may arrive right after the other side registered or claimed in
    // a different tab/session, which only wrote to localStorage — always
    // read fresh rather than trusting whatever was cached before landing here.
    refreshBusinesses();
    refreshAccounts();
    refreshConnections();
  }, []);

  const business = getBusiness(businessId);
  const isSelf = isAuthenticated && myBusiness?.id === businessId;
  const alreadyConnected = Boolean(
    isAuthenticated && myBusiness && business && areConnected(myBusiness.id, businessId),
  );
  const canConnect =
    isAuthenticated && myBusiness && business && !isSelf && business.tier !== "T0" && !alreadyConnected;

  useEffect(() => {
    if (!canConnect || connectedRef.current) return;
    connectedRef.current = true;
    addConnection(myBusiness.id, business.id, "nfc_scan");
    setJustConnected(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canConnect]);

  if (!business) {
    return (
      <div className="mx-auto max-w-[640px] px-6 py-16">
        <BackLink />
        <div className="mt-6 rounded-lg border border-grey-200 bg-white p-8 text-center dark:border-border dark:bg-card">
          <p className="text-sm text-grey-600 dark:text-muted-foreground">
            This card doesn't match a business on ABRI.
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

  if (isAuthenticated && (alreadyConnected || justConnected)) {
    return (
      <div className="mx-auto max-w-[640px] px-6 py-16">
        <BackLink />
        <CardPanel business={business}>
          <div className="mt-6 rounded-md border border-grey-200 bg-surface p-5 dark:border-border dark:bg-muted">
            <p className="inline-flex items-center gap-2 text-sm font-bold text-ink dark:text-foreground">
              <Users className="h-4 w-4" />
              {justConnected ? "You're now connected" : "You're already connected"}
            </p>
            <p className="mt-1 text-[13.5px] text-grey-600 dark:text-muted-foreground">
              {business.name} has been added to your network, and you to theirs.
            </p>
            <Button className="mt-4" render={<Link to="/app/network" />} nativeButton={false}>
              View your network
            </Button>
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
