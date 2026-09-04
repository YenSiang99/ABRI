import { useEffect, useState } from "react";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { fetchBusinesses } from "@/lib/api/businesses";
import { useConnections } from "@/context/ConnectionsContext";
import { SOURCE_DIRECTORY } from "@/lib/connectionSources";
import { VERIFICATION_LEVEL_FILTERS } from "@/lib/directoryFilter";
import { BusinessCard } from "@/components/business/BusinessCard";
import { toast } from "@/lib/toast";
import { UNCLAIMED } from "@/lib/verificationLevels";

function AppDirectory() {
  const { business } = useAuth();
  const { connectionStateWith, connect } = useConnections();
  const [query, setQuery] = useState("");
  const [verificationLevelFilter, setVerificationLevelFilter] = useState("all");
  const [businesses, setBusinesses] = useState([]);
  const [status, setStatus] = useState("loading");
  // Which row's Connect button is mid-flight, so it can show progress and
  // refuse a second click.
  const [connectingId, setConnectingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      fetchBusinesses({ search: query.trim(), verificationLevel: verificationLevelFilter === "all" ? undefined : verificationLevelFilter })
        .then((results) => {
          if (cancelled) return;
          setBusinesses(results.filter((b) => b.id !== business.id));
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
  }, [query, verificationLevelFilter, business.id]);

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
      toast.success(`Request sent to ${target.name} — you'll see it under Requests`);
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
          Search other businesses on ABRI, view their profiles, and send a connection request to
          the ones you know.
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

      {status === "ready" && (
        <div className="mt-4 text-sm text-muted-foreground">
          {businesses.length} {businesses.length === 1 ? "business" : "businesses"}
        </div>
      )}

      {status === "error" ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          Something went wrong loading the directory. Please try again.
        </div>
      ) : businesses.length > 0 ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {businesses.map((b) => (
            <BusinessCard
              key={b.id}
              business={b}
              basePath="/app/business"
              showActions
              connectable={b.verificationLevel !== UNCLAIMED}
              connectionState={connectionStateWith(b.id).state}
              connecting={connectingId === b.id}
              onConnect={handleConnect}
            />
          ))}
        </div>
      ) : (
        <div className="mt-10 rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          {status === "loading" ? "Loading businesses…" : "No businesses match your search."}
        </div>
      )}
    </div>
  );
}

export { AppDirectory };
