import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

import { fetchBusinessPage } from "@/lib/api/businesses";
import { Button } from "@/components/ui/button";
import { BusinessCard } from "@/components/business/BusinessCard";
import { VERIFICATION_LEVEL_FILTERS } from "@/lib/directoryFilter";
import { fetchServiceCatalogue } from "@/lib/api/serviceCatalogue";

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
    <p className="mt-1.5 text-xs text-grey-600 dark:text-muted-foreground">
      {n === 0
        ? `No confirmed ${confirmed.service.toLowerCase()} work yet`
        : `${confirmed.service} confirmed by ${n} ${n === 1 ? "business" : "different businesses"}`}
    </p>
  );
}

function Directory() {
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

  // Paged since Sep 2026. This route used to return every matching row on
  // every request, unauthenticated — the whole member list in one call, which
  // is the asset the product sells.
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
      setBusinesses((prev) =>
        page > 1 ? [...prev, ...data.businesses] : data.businesses,
      );
      setHasMore(data.hasMore);
      setPage(data.page);
    },
    [query, verificationLevelFilter, serviceFilter, confirmedOnly],
  );

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

  const q = query.trim();

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-16">
      <span className="text-[11px] font-bold tracking-[0.14em] text-grey-500 uppercase dark:text-muted-foreground">
        The verified business network
      </span>
      <h1 className="mt-3 text-[clamp(28px,3.4vw,38px)] font-extrabold tracking-[-0.02em] text-ink dark:text-foreground">
        Directory
      </h1>
      <p className="mt-2 max-w-[36rem] text-[15px] text-grey-600 dark:text-muted-foreground">
        Browse businesses seeded from public registry data, claimed by their
        owners, and SSM-verified.
      </p>

      <div className="relative mt-8 max-w-md">
        <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-grey-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or category"
          className="w-full rounded-sm border border-grey-300 py-2.5 pr-3.5 pl-10 text-sm text-ink outline-none focus:border-ink dark:border-border dark:text-foreground dark:focus:border-yellow"
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
                ? "border-ink bg-ink text-yellow dark:border-grey-700 dark:bg-grey-700"
                : "border-grey-300 text-grey-600 hover:bg-surface-2 dark:border-border dark:text-muted-foreground dark:hover:bg-muted",
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* PUBLIC, AND THAT IS THE POINT. This is the only filter on this page a
          visitor who has never heard of ABRI would actually arrive with: they
          do not want "a business", they want someone who does company
          incorporation. The service vocabulary is what makes that answerable
          — see backend/src/lib/serviceVocab.js — and this is the surface where
          it earns its keep. */}
      {catalogue && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label
            htmlFor="public-service-filter"
            className="text-[13px] text-grey-600 dark:text-muted-foreground"
          >
            Doing
          </label>
          <select
            id="public-service-filter"
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="rounded-lg border border-grey-300 bg-white px-3 py-1.5 text-[13px] text-ink outline-none focus:border-ink dark:border-border dark:bg-background dark:text-foreground dark:focus:border-ring"
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
              className="text-[13px] text-grey-600 underline underline-offset-4 hover:text-ink dark:text-muted-foreground dark:hover:text-foreground"
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
            <label className="inline-flex items-center gap-1.5 text-[13px] text-grey-600 dark:text-muted-foreground">
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
        <div className="mt-4 text-[13px] text-grey-500 dark:text-muted-foreground">
          {businesses.length}{" "}
          {businesses.length === 1 ? "business" : "businesses"}
        </div>
      )}

      {status === "error" ? (
        <div className="mt-16 text-center text-grey-500 dark:text-muted-foreground">
          Something went wrong loading the directory. Please try again.
        </div>
      ) : businesses.length > 0 ? (
        <>
          <div className="mt-6 grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {businesses.map((business) => (
              <div key={business.id} className="flex h-full flex-col">
                <BusinessCard business={business} />
                <ConfirmedForService confirmed={business.confirmedForService} />
              </div>
            ))}
          </div>
          {hasMore && (
            <div className="mt-8 flex justify-center">
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
      ) : (
        <div className="mt-16 text-center text-grey-500 dark:text-muted-foreground">
          {status === "loading"
            ? "Loading businesses…"
            : q
              ? `No businesses match "${query}".`
              : "No businesses match this filter."}
        </div>
      )}
    </div>
  );
}

export { Directory };
