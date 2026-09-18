import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Inbox as InboxIcon,
  Briefcase,
  Handshake,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { VouchRequestCard } from "@/components/app/VouchRequestCard";
import { RequestCard } from "@/pages/app/network/NetworkRequests";
import { useConnections } from "@/context/ConnectionsContext";
import { useNotifications } from "@/context/NotificationsContext";
import { fetchVouchRequests } from "@/lib/api/vouches";
import {
  fetchPortfolio,
  confirmPortfolioEntry,
  declinePortfolioEntry,
} from "@/lib/api/portfolio";
import { toast } from "@/lib/toast";

// Everything waiting on this member, in one place.
//
// THE PROBLEM THIS SOLVES is that "what needs me?" used to be four badges on
// four rows in two sidebar groups — unread activity on Dashboard, vouch turns
// on Vouches, work waiting to be confirmed, and connection requests two
// levels deep under Network. The badge doctrine in AppSidebar.jsx was already right
// (a count means somebody is owed something); what was wrong was that a
// member had to assemble the answer from four places.
//
// IT OWNS THE WORK, IT DOES NOT DUPLICATE IT. Every card here is the component
// the original page already renders — VouchRequestCard, and RequestCard
// exported from NetworkRequests — so accepting a vouch or a connection runs
// exactly one implementation. The pages those came from still exist and still
// show the same items in their own fuller context; this is a second door onto
// the same rows, not a second copy of them.
//
// WHAT IS NOT HERE: unread feed activity. A feed item is news, not work.
// Nobody is owed anything by it, nothing is blocked on reading it, and folding
// it in would make the one number on this row mean "things that happened"
// instead of "things you owe" — which is the distinction that makes an inbox
// worth opening at all. It stays on Home.

const TABS = ["vouches", "connections", "portfolio"];

// One proposed portfolio entry waiting on this member.
//
// CONFIRM IS A CLAIM ABOUT THEM, so the card leads with who said it and what
// they said — not with the buttons. A member who confirms without reading has
// put their name on somebody else's record of the relationship, which is the
// one thing this model exists to prevent.
//
// Declining is a ghost button, not a destructive one, for the reason
// NetworkRequests gives about declining a connection: saying "that didn't
// happen" is an ordinary answer, and a red button would make it read as an
// accusation.
function PortfolioRequestCard({ entry, onChanged }) {
  const [busy, setBusy] = useState(false);
  const { counterparty, service, note, occurredOn } = entry;

  const month = new Date(occurredOn).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  async function act(fn, message) {
    setBusy(true);
    try {
      await fn(entry.id);
      toast(message);
      await onChanged();
    } catch (err) {
      setBusy(false);
      toast.error(err.message ?? "Couldn't update that.");
    }
  }

  return (
    <li className="rounded-2xl border border-border p-5">
      <div className="text-sm text-foreground">
        <span className="font-semibold">{counterparty?.name}</span> says you
        worked together.
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {month}
        {service ? ` · ${service}` : ""}
      </div>
      {note && (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {note}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={() => act(confirmPortfolioEntry, "Confirmed")}
        >
          Confirm
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() =>
            act(declinePortfolioEntry, "Marked as not worked together")
          }
        >
          That didn&rsquo;t happen
        </Button>
      </div>
      {/* Said once, plainly. Confirming publishes to both profiles, and a
          member who learns that afterwards has been surprised by their own
          click. */}
      <p className="mt-3 text-xs text-muted-foreground">
        Confirming shows this on both your profiles. Declining is private — only
        they are told.
      </p>
    </li>
  );
}

function TabButton({ active, onClick, count, icon: Icon, children }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        "flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-semibold transition-colors " +
        (active
          ? "border-foreground text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground")
      }
    >
      <Icon className="h-4 w-4" />
      <span>{children}</span>
      {/* The per-tab count, so a member can see which pile the work is in
          before opening it. Zero renders nothing rather than a "0" chip: an
          empty pile is not news. */}
      {count > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-semibold text-accent-foreground">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </button>
  );
}

function Empty({ children }) {
  return (
    <div className="mt-8 rounded-2xl border border-dashed border-border p-12 text-center">
      <InboxIcon className="mx-auto h-8 w-8 text-muted-foreground" />
      <p className="mt-3 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

function Inbox() {
  const { incoming } = useConnections();
  const {
    vouchActionCount,
    refreshVouchActions,
  } = useNotifications();

  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab");
  const tab = TABS.includes(requested) ? requested : "vouches";

  const [vouches, setVouches] = useState([]);
  const [entries, setEntries] = useState([]);
  const [status, setStatus] = useState("loading");

  // Both lists are fetched up front rather than per tab, because the tab
  // counts have to be right before the member picks one — a count that only
  // appeared after you opened the pile would defeat the point of the row.
  function load() {
    return Promise.all([
      fetchVouchRequests().catch(() => []),
      fetchPortfolio("pending").catch(() => []),
    ]).then(([vouchRows, portfolioRows]) => {
      setVouches(vouchRows.filter((v) => v.waitingOn === "you"));
      // Only the ones waiting on THIS member. A pending portfolio entry they
      // proposed is waiting on the other side and is not their work — the same
      // rule the vouch filter above applies with waitingOn.
      setEntries(portfolioRows.filter((e) => !e.proposedByYou));
      setStatus("ready");
    });
  }

  useEffect(() => {
    let live = true;
    Promise.all([
      fetchVouchRequests().catch(() => []),
      fetchPortfolio("pending").catch(() => []),
    ]).then(([vouchRows, portfolioRows]) => {
      if (!live) return;
      setVouches(vouchRows.filter((v) => v.waitingOn === "you"));
      setEntries(portfolioRows.filter((e) => !e.proposedByYou));
      setStatus("ready");
    });
    return () => {
      live = false;
    };
  }, []);

  // Acting on a vouch changes both this list and the sidebar badge, and the
  // two read from different places — refetch both rather than adjusting one
  // and letting them drift.
  async function onVouchChanged() {
    await load();
    refreshVouchActions?.();
  }

  function setTab(next) {
    setSearchParams(next === "vouches" ? {} : { tab: next }, { replace: true });
  }

  // Counted off the fetched rows, not the context badges: the context is the
  // sidebar's copy and can be a moment stale after an accept, while these are
  // what the member is looking at.
  const counts = {
    vouches: status === "ready" ? vouches.length : vouchActionCount,
    connections: incoming.length,
    entries: entries.length,
  };
  const total = counts.vouches + counts.connections + counts.entries;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Waiting on you
      </div>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
        Inbox
      </h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        {total === 0
          ? "Nothing is waiting on you right now."
          : `${total} ${total === 1 ? "thing needs" : "things need"} a decision from you.`}
      </p>

      <div role="tablist" className="mt-8 flex gap-6 border-b border-border">
        <TabButton
          active={tab === "vouches"}
          onClick={() => setTab("vouches")}
          count={counts.vouches}
          icon={Handshake}
        >
          Vouches
        </TabButton>
        <TabButton
          active={tab === "connections"}
          onClick={() => setTab("connections")}
          count={counts.connections}
          icon={Users}
        >
          Connections
        </TabButton>
        <TabButton
          active={tab === "portfolio"}
          onClick={() => setTab("portfolio")}
          count={counts.entries}
          icon={Briefcase}
        >
          Portfolio
        </TabButton>
      </div>

      {status === "loading" && (
        <p className="mt-8 text-sm text-muted-foreground">Loading…</p>
      )}

      {status === "ready" && tab === "vouches" && (
        <div className="mt-6 flex flex-col gap-4">
          {vouches.length === 0 ? (
            <Empty>
              No vouch requests need you. They appear here when someone vouches
              for you, or sends one back for editing.
            </Empty>
          ) : (
            vouches.map((v) => (
              <VouchRequestCard
                key={v.id}
                vouch={v}
                onChanged={onVouchChanged}
              />
            ))
          )}
        </div>
      )}

      {tab === "connections" && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {incoming.length === 0 ? (
            <div className="sm:col-span-2">
              <Empty>No connection requests waiting.</Empty>
            </div>
          ) : (
            incoming.map((connection) => (
              <RequestCard key={connection.id} connection={connection} />
            ))
          )}
        </div>
      )}

      {status === "ready" && tab === "portfolio" && (
        <div className="mt-6">
          {entries.length === 0 ? (
            <Empty>
              Nobody has said you worked together. When a business logs work
              with you, it waits here for you to confirm.
            </Empty>
          ) : (
            <ul className="flex flex-col gap-4">
              {entries.map((e) => (
                <PortfolioRequestCard
                  key={e.id}
                  entry={e}
                  onChanged={load}
                />
              ))}
            </ul>
          )}
        </div>
      )}

    </div>
  );
}

export { Inbox };
