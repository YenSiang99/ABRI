import { useState } from "react";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useBusinesses } from "@/lib/store/businesses";
import { useConnectionsFor, addConnection, areConnected, SOURCE_DIRECTORY } from "@/lib/store/connections";
import { TIER_FILTERS, filterBusinesses } from "@/lib/directoryFilter";
import { BusinessCard } from "@/components/business/BusinessCard";
import { toast } from "@/lib/toast";

function AppDirectory() {
  const { business } = useAuth();
  const businesses = useBusinesses();
  useConnectionsFor(business.id); // subscribe so alreadyConnected re-renders after a connect
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState("all");

  const filtered = filterBusinesses(businesses, { query, tierFilter, excludeId: business.id });

  function handleConnect(target) {
    addConnection(business.id, target.id, SOURCE_DIRECTORY);
    toast.success(`Connected with ${target.name}`);
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
          Search other businesses on ABRI, view their profiles, and connect with the ones you know.
        </p>
      </div>

      <div className="relative mt-6 max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or category"
          className="w-full rounded-lg border border-border bg-background py-2 pr-3 pl-9 text-sm text-foreground outline-none focus:border-ring"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {TIER_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setTierFilter(filter.value)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
              tierFilter === filter.value
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="mt-4 text-sm text-muted-foreground">
        {filtered.length} {filtered.length === 1 ? "business" : "businesses"}
      </div>

      {filtered.length > 0 ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((b) => (
            <BusinessCard
              key={b.id}
              business={b}
              basePath="/app/business"
              showActions
              connectable={b.tier !== "T0"}
              alreadyConnected={areConnected(business.id, b.id)}
              onConnect={handleConnect}
            />
          ))}
        </div>
      ) : (
        <div className="mt-10 rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          No businesses match your search.
        </div>
      )}
    </div>
  );
}

export { AppDirectory };
