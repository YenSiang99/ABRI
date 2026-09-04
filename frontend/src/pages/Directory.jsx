import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

import { fetchBusinesses } from "@/lib/api/businesses";
import { BusinessCard } from "@/components/business/BusinessCard";
import { VERIFICATION_LEVEL_FILTERS } from "@/lib/directoryFilter";

function Directory() {
  const [query, setQuery] = useState("");
  const [verificationLevelFilter, setVerificationLevelFilter] = useState("all");
  const [businesses, setBusinesses] = useState([]);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      fetchBusinesses({ search: query.trim(), verificationLevel: verificationLevelFilter === "all" ? undefined : verificationLevelFilter })
        .then((results) => {
          if (cancelled) return;
          setBusinesses(results);
          setStatus("ready");
        })
        .catch(() => {
          if (cancelled) return;
          setStatus("error");
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, verificationLevelFilter]);

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

      {status === "ready" && (
        <div className="mt-4 text-[13px] text-grey-500 dark:text-muted-foreground">
          {businesses.length} {businesses.length === 1 ? "business" : "businesses"}
        </div>
      )}

      {status === "error" ? (
        <div className="mt-16 text-center text-grey-500 dark:text-muted-foreground">
          Something went wrong loading the directory. Please try again.
        </div>
      ) : businesses.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {businesses.map((business) => (
            <BusinessCard key={business.id} business={business} />
          ))}
        </div>
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
