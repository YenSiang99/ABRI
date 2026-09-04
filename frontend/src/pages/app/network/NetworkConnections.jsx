import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useConnections } from "@/context/ConnectionsContext";
import { SOURCE_NFC_SCAN, SOURCE_DIRECTORY } from "@/lib/connectionSources";
import { toast } from "@/lib/toast";
import { NetworkBusinessCard, SourceBadge, Grid, Empty, PageHeader } from "./NetworkCard";

// Accepted connections only — mutual, both sides agreed. Requests live on
// their own route now; this page is the finished relationships, which is what
// makes it the one place a search box earns its keep.
//
// This is also the list that later features are allowed to trust. A
// connection took two people to make, so messaging, introductions and
// collaboration can hang off it; a follow can't carry any of that, because
// one person made it alone.

const FROM = { path: "connections", label: "Back to connections" };

const SOURCE_FILTERS = [
  { value: "all", label: "All" },
  { value: SOURCE_NFC_SCAN, label: "Card tap" },
  { value: SOURCE_DIRECTORY, label: "Connected in app" },
];

function ConnectionCard({ connection }) {
  const { counterparty: business, id, source } = connection;
  const { disconnect } = useConnections();
  const [removing, setRemoving] = useState(false);

  async function handleRemove() {
    setRemoving(true);
    const result = await disconnect(id);
    if (result.ok) {
      toast(`Removed ${business.name} from your network`);
      return;
    }
    // Only reached on a real failure — the card is still on screen, so the
    // button has to become usable again.
    setRemoving(false);
    toast.error(result.error);
  }

  return (
    <NetworkBusinessCard
      business={business}
      from={FROM}
      badges={<SourceBadge source={source} />}
      actions={
        <Button size="sm" variant="secondary" onClick={handleRemove} disabled={removing}>
          {removing ? "Removing…" : "Remove"}
        </Button>
      }
    />
  );
}

function NetworkConnections() {
  const { accepted, incoming, status } = useConnections();
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");

  const q = query.trim().toLowerCase();
  const filtered = accepted.filter(
    (c) =>
      (sourceFilter === "all" || c.source === sourceFilter) &&
      (!q ||
        c.counterparty.name.toLowerCase().includes(q) ||
        c.counterparty.category.toLowerCase().includes(q)),
  );

  const pending = status === "loading" || status === "idle";

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <PageHeader title="Connections">
        Businesses you've both agreed to connect with — from a card tap, or a request one of you
        accepted.
      </PageHeader>

      {/* Points at the sibling route rather than duplicating the request
          cards here. The whole reason Requests moved out is that pending work
          and finished relationships are different jobs; a member sitting on
          this page still needs telling that the work exists. */}
      {!pending && incoming.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-secondary/50 px-4 py-3 text-sm text-foreground">
          <span>
            {incoming.length} {incoming.length === 1 ? "request is" : "requests are"} waiting on
            you.
          </span>
          <Button size="sm" variant="outline" render={<Link to="/app/network/requests" />} nativeButton={false}>
            Review
          </Button>
        </div>
      )}

      {accepted.length > 0 && (
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

          <div className="mt-4 text-sm text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "connection" : "connections"}
          </div>
        </>
      )}

      <Grid>
        {filtered.map((c) => (
          <ConnectionCard key={c.id} connection={c} />
        ))}
      </Grid>

      {pending ? (
        <Empty>Loading your network…</Empty>
      ) : status === "error" ? (
        <Empty>Couldn't load your network. Refresh to try again.</Empty>
      ) : accepted.length === 0 ? (
        <Empty icon={Users}>
          No connections yet — tap someone's ABRI card, or send a request from their profile.
        </Empty>
      ) : (
        filtered.length === 0 && (
          <Empty>
            {q ? `No connections match "${query}".` : "No connections match this filter."}
          </Empty>
        )
      )}
    </div>
  );
}

export { NetworkConnections };
