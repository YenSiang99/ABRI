import { MapPin, Radio, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AppTierBadge } from "@/components/badge/AppTierBadge";
import { useConnectionsFor, removeConnection } from "@/lib/store/connections";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/lib/toast";

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
        {source === "nfc_scan" && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-foreground">
            <Radio className="h-3 w-3" /> Card tap
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-sm">
        <span className="text-muted-foreground">{business.category}</span>
        <Button size="sm" variant="secondary" onClick={handleRemove}>
          Remove
        </Button>
      </div>
    </div>
  );
}

function Network() {
  const { business } = useAuth();
  const connections = useConnectionsFor(business?.id);

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

      <div className="mt-6 text-sm text-muted-foreground">
        {connections.length} {connections.length === 1 ? "connection" : "connections"}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {connections.map((c) => (
          <ConnectionCard key={c.connectionId} connection={c} />
        ))}
      </div>

      {connections.length === 0 && (
        <div className="mt-10 rounded-2xl border border-dashed border-border p-12 text-center">
          <Users className="mx-auto h-8 w-8 text-muted-foreground" />
          <div className="mt-3 text-sm text-muted-foreground">
            No connections yet — tap someone's ABRI card, or have them tap yours, to add them
            here.
          </div>
        </div>
      )}
    </div>
  );
}

export { Network };
