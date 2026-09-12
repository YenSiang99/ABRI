import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { fetchBusinessPage } from "@/lib/api/businesses";
import { useConnections } from "@/context/ConnectionsContext";
import { SOURCE_DIRECTORY } from "@/lib/connectionSources";
import { VERIFICATION_LEVEL_FILTERS } from "@/lib/directoryFilter";
import { fetchServiceCatalogue } from "@/lib/api/serviceCatalogue";
import { BusinessCard } from "@/components/business/BusinessCard";
import { NoRecordPanel } from "@/components/business/InviteToClaim";
import { NetworkOverlap } from "@/components/business/NetworkOverlap";
import { WatchButton } from "@/components/business/WatchButton";
import { fetchWatches } from "@/lib/api/watches";
import { Button } from "@/components/ui/button";
import { MATCH_COPY } from "@/lib/matchCopy";
import { toast } from "@/lib/toast";
import { UNCLAIMED } from "@/lib/verificationLevels";

// The member's ONE search box.
//
// It absorbed /app/check in Sep 2026. That screen matched registration
// numbers and domains, said why a row matched, and had an honest "no record"
// state with an invite; this one browsed by name and category and dead-ended
// on a miss. Two boxes for one person in one session, and nothing to tell
// them which to use — so this one learned the other's tricks and the other
// was deleted. The public /check survives, because a stranger who cannot log
// in still needs a door.
// Why this business is where it is in the list.
//
// SHOWN EVEN WHEN ZERO, and that is the honest half. A ranked list whose
// reasons are invisible is a list that looks arbitrary; one that shows only
// the winners' numbers reads as a leaderboard. "Nobody has confirmed this yet"
// is a real, useful answer about a business that says it does the work.
//
// Counts DIFFERENT businesses, never engagements — ten confirmations from one
// friend is one counterparty. See engagementSummaryFor in
// backend/src/lib/engagements.js.
function ConfirmedForService({ confirmed }) {
  if (!confirmed) return null;
  const n = confirmed.counterparties;
  return (
    <p className="mt-1.5 text-xs text-muted-foreground">
      {n === 0
        ? `No confirmed ${confirmed.service.toLowerCase()} work yet`
        : `${confirmed.service} confirmed by ${n} ${n === 1 ? "business" : "different businesses"}`}
    </p>
  );
}

function AppDirectory() {
  const { business } = useAuth();
  const { connectionStateWith, connect } = useConnections();
  const [query, setQuery] = useState("");
  const [verificationLevelFilter, setVerificationLevelFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("");
  const [confirmedOnly, setConfirmedOnly] = useState(false);
  const [catalogue, setCatalogue] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [status, setStatus] = useState("loading");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Which businesses this member watches, so a card can say "Watching".
  // Below Pro the request 402s and the set stays empty — which renders the
  // unwatched state, correctly, because they have none.
  const [watchedIds, setWatchedIds] = useState(new Set());
  const refreshWatches = useCallback(async () => {
    try {
      const rows = await fetchWatches();
      setWatchedIds(new Set(rows.map((w) => w.business.id)));
    } catch {
      setWatchedIds(new Set());
    }
  }, []);
  useEffect(() => {
    refreshWatches();
  }, [refreshWatches]);
  // Which row's Connect button is mid-flight, so it can show progress and
  // refuse a second click.
  const [connectingId, setConnectingId] = useState(null);

  // Two entry points into one request, so "Load more" appends where a new
  // search replaces. The `cancelled` flag is what stops a slow early response
  // landing after a fast later one and answering a question the member has
  // finished typing.
  const load = useCallback(
    async (page) => {
      const filter =
        verificationLevelFilter === "all" ? undefined : verificationLevelFilter;
      const data = await fetchBusinessPage({
        search: query.trim(),
        verificationLevel: filter,
        service: serviceFilter || undefined,
        confirmedOnly: serviceFilter ? confirmedOnly : undefined,
        page,
      });
      // Your own business is never a search result — you cannot connect to,
      // follow or vouch for yourself, so every action on the card would be
      // dead. Filtered here rather than server-side because the same route
      // serves logged-out callers, who have no "own business".
      const rows = data.businesses.filter((b) => b.id !== business.id);
      setBusinesses((prev) => (page > 1 ? [...prev, ...rows] : rows));
      setHasMore(data.hasMore);
      setPage(data.page);
    },
    [query, verificationLevelFilter, serviceFilter, confirmedOnly, business.id],
  );

  // The whole catalogue, every category — this browse is not scoped to the
  // member's own trade. Someone looking for a company secretary is not an
  // accountant looking at accountants.
  useEffect(() => {
    let live = true;
    fetchServiceCatalogue()
      .then((data) => live && setCatalogue(data))
      .catch(() => live && setCatalogue({ others: [] }));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    const timer = setTimeout(() => {
      load(1)
        .then(() => !cancelled && setStatus("ready"))
        .catch(() => !cancelled && setStatus("error"));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [load]);

  // Sends a request, or accepts one already addressed to this member — the
  // server settles that inside POST /connections, so there is one handler
  // here rather than two.
  async function handleConnect(target) {
    setConnectingId(target.id);
    const wasIncoming = connectionStateWith(target.id).state === "incoming";
    const result = await connect(target.id, SOURCE_DIRECTORY);
    setConnectingId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    // Worded from what the server actually did, not from the button that was
    // pressed. A directory connect normally lands "pending", and saying
    // "Connected with X" when the other side hasn't answered is the exact
    // claim the approval step was added to stop — the member walks away
    // believing they have a connection they don't have.
    if (wasIncoming || result.connection?.status === "accepted") {
      toast.success(`You're connected with ${target.name}`);
    } else {
      toast.success(
        `Request sent to ${target.name} — you'll see it under Requests`,
      );
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div>
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Browse the network
        </div>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
          Directory
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Search by name or category to browse — or paste an SSM registration
          number or a website to check one specific business.
        </p>
      </div>

      <div className="relative mt-6 max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name, category, SSM number, or website"
          className="w-full rounded-lg border border-border bg-background py-2 pr-3 pl-9 text-sm text-foreground outline-none focus:border-ring"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {VERIFICATION_LEVEL_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setVerificationLevelFilter(filter.value)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
              verificationLevelFilter === filter.value
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* SERVICES ARE A SELECT, NOT CHIPS, unlike the four above. There are
          four verification levels and forty-odd services — rendering them the
          same way would bury the level filter under three rows of chips and
          make the cheaper filter look like the more important one. */}
      {catalogue && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label
            htmlFor="service-filter"
            className="text-[13px] text-muted-foreground"
          >
            Doing
          </label>
          <select
            id="service-filter"
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-[13px] text-foreground outline-none focus:border-ring"
          >
            <option value="">any service</option>
            {(catalogue.others ?? []).map((group) => (
              <optgroup key={group.category} label={group.category}>
                {group.services.map((sv) => (
                  <option key={sv} value={sv}>
                    {sv}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {serviceFilter && (
            <button
              type="button"
              onClick={() => setServiceFilter("")}
              className="text-[13px] text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Clear
            </button>
          )}
          {/* RANKING IS ALREADY ON whenever a service is chosen — this only
              hides the unconfirmed tail. Off by default, because a directory
              that showed only businesses somebody has confirmed would be
              nearly empty today and would punish every new member for being
              new. The count next to each card is the honest version; this is
              for a reader who has decided they only want evidence. */}
          {serviceFilter && (
            <label className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <input
                type="checkbox"
                checked={confirmedOnly}
                onChange={(e) => setConfirmedOnly(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Confirmed only
            </label>
          )}
        </div>
      )}

      {status === "ready" && (
        <div className="mt-4 text-sm text-muted-foreground">
          {businesses.length}{" "}
          {businesses.length === 1 ? "business" : "businesses"}
        </div>
      )}

      {status === "error" ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          Something went wrong loading the directory. Please try again.
        </div>
      ) : businesses.length > 0 ? (
        <>
          {/* auto-rows-fr makes every ROW the same height, not just every card
              within a row. Grid sizes rows independently by default, so a row
              whose names all fit on one line came out shorter than its
              neighbours and the grid still read as uneven even once the cards
              in each row matched. */}
          <div className="mt-4 grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {businesses.map((b) => (
              <div key={b.id} className="relative flex h-full flex-col">
                {/* Only when the member actually typed something, and only
                    above the card it explains. On an unfiltered browse every
                    row would carry "matched on name", which is noise. */}
                {b.matchReason && (
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {MATCH_COPY[b.matchReason] ?? MATCH_COPY.name}
                  </p>
                )}
                <BusinessCard
                  business={b}
                  basePath="/app/business"
                  showActions
                  connectable={b.verificationLevel !== UNCLAIMED}
                  connectionState={connectionStateWith(b.id).state}
                  connecting={connectingId === b.id}
                  onConnect={handleConnect}
                  reserveTopRight
                />
                {/* Plus, and silent when there is no overlap. */}
                <NetworkOverlap
                  vouchers={b.vouchersInYourNetwork}
                  basePath="/app/business"
                />
                <ConfirmedForService confirmed={b.confirmedForService} />
                {/* Pro. STILL A SIBLING OF THE CARD, NOT A CHILD — BusinessCard
                    is a <Link>, and a button inside an anchor both navigates
                    and fires. It used to sit in its own row below the card,
                    which read as a caption rather than a control and put a
                    Pro action further from the card than the card's own
                    buttons. Absolute positioning gets it into the corner
                    while keeping it out of the anchor: the DOM is unchanged,
                    only the paint order is.

                    The card reserves the space with `reserveTopRight`, so a
                    long business name truncates before it reaches this. */}
                <div className="absolute right-3 top-3 z-10">
                  <WatchButton
                    business={b}
                    watching={watchedIds.has(b.id)}
                    onChanged={refreshWatches}
                    iconOnly
                  />
                </div>
              </div>
            ))}
          </div>
          {hasMore && (
            <div className="mt-6 flex justify-center">
              <Button
                variant="outline"
                disabled={loadingMore}
                onClick={() => {
                  setLoadingMore(true);
                  load(page + 1).finally(() => setLoadingMore(false));
                }}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </>
      ) : status === "loading" ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          Loading businesses…
        </div>
      ) : query.trim() ? (
        // The honest miss, lifted from the deleted /app/check. A member who
        // pasted a counterparty's name and got nothing has NOT been told that
        // business is fake — ABRI has no registry access and can only speak
        // for its own members. The old copy here was "No businesses match
        // your search", which is fine for browsing and wrong for checking;
        // this box now does both, so it needs the careful sentence.
        <NoRecordPanel query={query.trim()} />
      ) : (
        <div className="mt-10 rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          No businesses match those filters.
        </div>
      )}
    </div>
  );
}

export { AppDirectory };
