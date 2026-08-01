import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, MapPin, Radio, Link2, Search, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AppTierBadge } from "@/components/badge/AppTierBadge";
import { useConnectionsFor, removeConnection } from "@/lib/store/connections";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/lib/toast";

const SOURCE_FILTERS = [
  { value: "all", label: "All" },
  { value: "nfc_scan", label: "Card tap" },
  { value: "directory", label: "Connected in app" },
];

function ConnectionCard({ connection }) {
  const { business, connectionId, source } = connection;
  const initial = business.name.charAt(0);

  function handleRemove() {
    removeConnection(connectionId);
    toast(`Removed ${business.name} from your network`);
  }

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-5 transition-colors hover:border-foreground/20">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-foreground text-lg font-semibold text-background">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold text-foreground">{business.name}</div>
          <div className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" /> {business.location}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <AppTierBadge tier={business.tier} />
        {source === "nfc_scan" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-foreground">
            <Radio className="h-3 w-3" /> Card tap
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-foreground">
            <Link2 className="h-3 w-3" /> Connected in app
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-sm">
        <span className="text-muted-foreground">{business.category}</span>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            render={<Link to={`/app/business/${business.id}`} state={{ from: "/app/network", label: "Back to network" }} />}
            nativeButton={false}
          >
            Profile <ArrowUpRight className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="secondary" onClick={handleRemove}>
            Remove
          </Button>
        </div>
      </div>
    </div>
  );
}

function Network() {
  const { business } = useAuth();
  const connections = useConnectionsFor(business?.id);
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");

  const q = query.trim().toLowerCase();
  const filtered = connections.filter((c) => {
    const matchesSource = sourceFilter === "all" || c.source === sourceFilter;
    const matchesQuery =
      !q || c.business.name.toLowerCase().includes(q) || c.business.category.toLowerCase().includes(q);
    return matchesSource && matchesQuery;
  });

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div>
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Your network</div>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
          Connections
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Everyone you've connected with by tapping cards or being tapped.
        </p>
      </div>

      {connections.length > 0 && (
        <>
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
            {SOURCE_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setSourceFilter(filter.value)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
                  sourceFilter === filter.value
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="mt-4 text-sm text-muted-foreground">
        {filtered.length} {filtered.length === 1 ? "connection" : "connections"}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((c) => (
          <ConnectionCard key={c.connectionId} connection={c} />
        ))}
      </div>

      {connections.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border p-12 text-center">
          <Users className="mx-auto h-8 w-8 text-muted-foreground" />
          <div className="mt-3 text-sm text-muted-foreground">
            No connections yet — tap someone's ABRI card, or have them tap yours, to add them
            here.
          </div>
        </div>
      ) : (
        filtered.length === 0 && (
          <div className="mt-10 rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            {q ? `No connections match "${query}".` : "No connections match this filter."}
          </div>
        )
      )}
    </div>
  );
}

export { Network };
