import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Inbox, Clock, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConnections } from "@/context/ConnectionsContext";
import { toast } from "@/lib/toast";
import { NetworkBusinessCard, Pill, Grid, Empty, PageHeader } from "./NetworkCard";

// Connection requests, both directions, on their own route rather than a tab
// inside Connections. A request is WORK — something is owed, by you or by
// them — and a list of work sitting behind a tab on a list of finished
// relationships is how it goes unread. It also gives the sidebar somewhere
// honest to hang a badge: the count points at this page and this page is the
// only thing that can clear it.
//
// Two tabs rather than two stacked sections. They are separate jobs, not two
// parts of one list: Received is a decision to make, Sent is a state to check
// on. Stacked, the sent list sat under the received one as though it were
// more of the same thing, and a member with a long inbox had to scroll past
// their own work to find it.
//
// Received is the default tab because it is the only one of the two with
// anything owed by this member — and it is where the sidebar badge and every
// "wants to connect" notification land.

const TABS = ["received", "sent"];

const FROM = { path: "requests", label: "Back to requests" };

// One card for both directions, because it's one row and one delete route.
// What changes is who's waiting, and therefore which buttons make sense.
function RequestCard({ connection }) {
  const { counterparty: business, id, requestedByYou } = connection;
  const { acceptConnection, disconnect } = useConnections();
  const [busy, setBusy] = useState(false);

  async function handleAccept() {
    setBusy(true);
    const result = await acceptConnection(id);
    if (result.ok) {
      toast.success(`You're connected with ${business.name}`);
      return;
    }
    // Only reached on a real failure — the card is still on screen, so the
    // buttons have to become usable again.
    setBusy(false);
    toast.error(result.error);
  }

  // Withdraw and decline are the same call — see removeConnection in
  // lib/api/connections.js. Only the wording differs, because from the
  // member's side they are genuinely different acts.
  async function handleRemove() {
    setBusy(true);
    const result = await disconnect(id);
    if (result.ok) {
      toast(requestedByYou ? `Withdrew your request to ${business.name}` : "Request declined");
      return;
    }
    setBusy(false);
    toast.error(result.error);
  }

  return (
    <NetworkBusinessCard
      business={business}
      from={FROM}
      badges={
        <Pill icon={Clock}>{requestedByYou ? "Waiting on them" : "Waiting on you"}</Pill>
      }
      actions={
        requestedByYou ? (
          <Button size="sm" variant="secondary" onClick={handleRemove} disabled={busy}>
            {busy ? "Withdrawing…" : "Withdraw"}
          </Button>
        ) : (
          <>
            <Button size="sm" onClick={handleAccept} disabled={busy}>
              Accept
            </Button>
            {/* Ghost, not destructive: declining is an ordinary answer, and a
                red button would make saying no feel like an accusation. */}
            <Button size="sm" variant="ghost" onClick={handleRemove} disabled={busy}>
              Decline
            </Button>
          </>
        )
      }
    />
  );
}

function NetworkRequests() {
  const { incoming, outgoing, status } = useConnections();

  // Tab in the URL, matching the Following page — so a link can point at the
  // Sent list directly instead of dropping the reader on the other one.
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab");
  const tab = TABS.includes(requested) ? requested : "received";

  function handleTabChange(next) {
    setSearchParams(next === "received" ? {} : { tab: next }, { replace: true });
  }

  // The list arrives over the network, so "none yet" and "not back yet" are
  // different states — without this the empty-state copy flashes on every
  // visit before the fetch lands.
  const pending = status === "loading" || status === "idle";

  // Both tabs share these two, so neither can render an empty state over a
  // list that simply hasn't arrived.
  const notReady = pending ? (
    <Empty>Loading requests…</Empty>
  ) : status === "error" ? (
    <Empty>Couldn't load your requests. Refresh to try again.</Empty>
  ) : null;

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <PageHeader title="Requests">
        Connections waiting on an answer. Accepting makes it mutual; declining leaves no record,
        and nobody is told either way.
      </PageHeader>

      <Tabs value={tab} onValueChange={handleTabChange} className="mt-8">
        <TabsList>
          <TabsTrigger value="received">
            Received
            {/* Only this tab gets a count. A number on Sent would be a tally
                of work owed by other people, which is nothing this member can
                act on — same rule as the sidebar badge. */}
            {incoming.length > 0 && (
              <span className="ml-1.5 rounded-full bg-accent px-1.5 text-[10px] font-semibold text-accent-foreground">
                {incoming.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="sent">Sent</TabsTrigger>
        </TabsList>

        <TabsContent value="received">
          {notReady ??
            (incoming.length === 0 ? (
              <Empty icon={Inbox}>
                No requests waiting on you. When someone asks to connect, it lands here to accept
                or decline.
                {/* Only worth saying when there is actually something on the
                    other tab — otherwise it points at a second empty list. */}
                {outgoing.length > 0 &&
                  ` You have ${outgoing.length} ${
                    outgoing.length === 1 ? "request" : "requests"
                  } still waiting on someone else, under Sent.`}
              </Empty>
            ) : (
              <>
                <div className="mt-6 text-sm text-muted-foreground">
                  {incoming.length} {incoming.length === 1 ? "request" : "requests"} waiting on you
                </div>
                <Grid>
                  {incoming.map((c) => (
                    <RequestCard key={c.id} connection={c} />
                  ))}
                </Grid>
              </>
            ))}
        </TabsContent>

        <TabsContent value="sent">
          {notReady ??
            (outgoing.length === 0 ? (
              <Empty icon={Send}>
                You haven't sent any requests that are still waiting. Ones that were accepted are
                in Connections; declined and withdrawn ones leave no record.
              </Empty>
            ) : (
              <>
                <div className="mt-6 text-sm text-muted-foreground">
                  {outgoing.length} {outgoing.length === 1 ? "request" : "requests"} waiting on
                  them · they aren't reminded
                </div>
                <Grid>
                  {outgoing.map((c) => (
                    <RequestCard key={c.id} connection={c} />
                  ))}
                </Grid>
              </>
            ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export { NetworkRequests };
