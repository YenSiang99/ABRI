import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ClipboardList, Filter } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AskDialog } from "@/components/app/AskDialog";
import { useAuth } from "@/context/AuthContext";
import { ASK_CATEGORIES } from "@/lib/askVocab";
import { fetchAsk, fetchAsks, fetchMyAsks, fetchAnsweredAsks } from "@/lib/api/asks";
import { AskRowCard, Empty, PageHeader } from "./AskCard";
import { AskDetailPanel } from "./AskDetailPanel";
import { ASK_POSTING_VERIFICATION_LEVELS } from "@/lib/verificationLevels";

// The board, as a two-pane split: the list on the left, the whole of the
// selected ask on the right.
//
// IT WAS A GRID OF CARDS, and the grid was the problem. Every card carried
// five chips and an Open button, so the eye had to read a whole card to learn
// anything, and reading the ask itself meant leaving the board and coming back
// for the next one. A list you scan beside a pane that fills in is the shape a
// board of opportunities wants — it is what LinkedIn Jobs does, and for the
// same reason.
//
// SELECTION LIVES IN THE URL (?selected=), not in state. It makes a particular
// ask linkable, survives the back button, and sits alongside tab/matches/
// category, which were already there — one mechanism for screen state rather
// than two that can disagree.

const TABS = ["board", "mine", "offers"];
const MATCH_FILTERS = [
  { value: "all", label: "All requests" },
  { value: "exact", label: "Matches you" },
  { value: "category", label: "Your line of work" },
];

function Pill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:border-foreground/30"
      }`}
    >
      {children}
    </button>
  );
}

function AsksBoard() {
  const { business } = useAuth();
  const [params, setParams] = useSearchParams();

  const tab = TABS.includes(params.get("tab")) ? params.get("tab") : "board";
  const matches = params.get("matches") ?? "all";
  const category = params.get("category") ?? "";
  const selectedId = params.get("selected") ?? "";

  const [loaded, setLoaded] = useState({ asks: [], error: null, key: null });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  // The selected ask, fetched in full. The list payload carries no answers and
  // no detail body (ASK_INCLUDE vs ASK_DETAIL_INCLUDE on the server), so the
  // pane cannot be rendered from the row — it needs its own read.
  const [detail, setDetail] = useState({ ask: null, forId: null });

  // One key for everything that changes what's fetched, reloadToken included,
  // so a post refetches AND shows the loading state on the way.
  const key = `${tab}|${matches}|${category}|${reloadToken}`;

  useEffect(() => {
    let cancelled = false;
    const request =
      tab === "mine"
        ? fetchMyAsks()
        : tab === "offers"
          ? fetchAnsweredAsks()
          : // `matchStrength`, not `matches`. The URL param this screen reads
            // is called `matches` (see MATCH_FILTERS above) and the server's
            // query param is `matchStrength` — lib/api/asks.js destructures
            // the latter, so passing the former sent NOTHING and every
            // filtered view silently returned the whole board.
            //
            // It failed silently in both directions: GET /asks treats an
            // unrecognised param as no filter rather than a 400, which is the
            // footgun routes/businesses.js warns about in its own comment. The
            // dashboard's Pro alert link (/app/requests?matches=category) landed
            // here too, so the one thing askAlerts buys led to an unfiltered
            // board.
            fetchAsks({
              matchStrength: matches === "all" ? undefined : matches,
              category: category || undefined,
            });

    request
      .then((asks) => {
        if (!cancelled) setLoaded({ asks, error: null, key });
      })
      .catch((err) => {
        if (!cancelled) setLoaded({ asks: [], error: err.message, key });
      });

    return () => {
      cancelled = true;
    };
  }, [key, tab, matches, category]);

  const loading = loaded.key !== key;
  const asks = loaded.asks;

  // Auto-select the first ask once a list lands, and re-select when a filter
  // changes the list out from under the current selection. Derived from the
  // list rather than set in the fetch, so it stays right no matter which of the
  // four things above moved.
  const selectionIsStale = selectedId && !asks.some((a) => a.id === selectedId);
  useEffect(() => {
    if (loading) return;
    if (asks.length === 0) return;
    if (selectedId && !selectionIsStale) return;
    const next = new URLSearchParams(params);
    next.set("selected", asks[0].id);
    setParams(next, { replace: true });
    // params/setParams are deliberately out of the dep list: including them
    // re-runs this on every URL write, including its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, asks, selectedId, selectionIsStale]);

  // The pane's own read. Keyed by id and never cleared on change, the pattern
  // AskDialog uses for its service catalogue: a response for a previous
  // selection simply isn't `forId`, so it can never render against the new one.
  useEffect(() => {
    if (!selectedId) return undefined;
    let cancelled = false;
    fetchAsk(selectedId)
      .then((ask) => {
        if (!cancelled) setDetail({ ask, forId: selectedId });
      })
      .catch(() => {
        if (!cancelled) setDetail({ ask: null, forId: selectedId });
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, reloadToken]);

  function setParam(name, value) {
    const next = new URLSearchParams(params);
    if (!value || value === "all" || (name === "tab" && value === "board")) next.delete(name);
    else next.set(name, value);
    // Changing what the list holds invalidates which ask is showing beside it.
    if (name !== "selected") next.delete("selected");
    setParams(next, { replace: true });
  }

  const canPost = business && ASK_POSTING_VERIFICATION_LEVELS.has(business.verificationLevel);
  const filtering = tab === "board" && (matches !== "all" || category);
  const paneAsk = detail.forId === selectedId ? detail.ask : null;

  // Four distinct states, four distinct strings. A filtered-to-empty board and
  // a genuinely empty one mean completely different things to a member.
  function renderEmpty() {
    if (loading) return <Empty>Loading requests…</Empty>;
    if (loaded.error) return <Empty>Couldn't load the board. Refresh to try again.</Empty>;
    if (filtering) {
      return (
        <Empty icon={Filter}>
          No requests match those filters.
          <div className="mt-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setParams(new URLSearchParams(), { replace: true })}
            >
              Clear filters
            </Button>
          </div>
        </Empty>
      );
    }
    if (tab === "mine") {
      return (
        <Empty icon={ClipboardList}>
          You haven't posted a request yet. If you need something — a supplier, a partner, a
          service — post it and the members who do that work will see it.
        </Empty>
      );
    }
    if (tab === "offers") {
      return (
        <Empty icon={ClipboardList}>
          You haven't made an offer yet. Offering is how the network works: point somebody
          good at the work, or put yourself forward.
        </Empty>
      );
    }
    return (
      <Empty icon={ClipboardList}>
        Nobody has posted a request yet. If you need something — a supplier, a partner, a
        service — post it and the members who do that work will see it.
      </Empty>
    );
  }

  function renderSplit() {
    if (loading || loaded.error || asks.length === 0) return renderEmpty();

    return (
      <div className="mt-4 lg:grid lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:items-start lg:gap-6">
        {/* Its own scroller on desktop, so a long list never pushes the pane
            off the bottom of the page. On mobile it is simply the page. */}
        <div className="overflow-hidden rounded-2xl border border-border bg-card lg:sticky lg:top-6 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto">
          <div className="border-b border-border px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {asks.length} {asks.length === 1 ? "request" : "requests"}
          </div>
          {asks.map((ask) => (
            <AskRowCard
              key={ask.id}
              ask={ask}
              selected={ask.id === selectedId}
              onSelect={() => setParam("selected", ask.id)}
            />
          ))}
        </div>

        {/* Hidden below lg: at 400px a second pane is unreadable, so a row
            navigates to the full page instead — which is what AskRowCard's
            link half is for. */}
        <div className="hidden lg:block lg:sticky lg:top-6 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto">
          <AskDetailPanel ask={paneAsk} isOwn={paneAsk?.askedByYou} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <PageHeader
        title="Requests"
        action={
          <div className="text-right">
            {/* A tier gate, so neither useUpgradeGate nor LockedFeature: there
                is no plan to sell here. The button stays visible and says what
                the actual next step is — get SSM-verified, which is free —
                rather than naming a price that wouldn't open this door. */}
            <Button onClick={() => setDialogOpen(true)} disabled={!canPost}>
              Post a request
            </Button>
            {!canPost && (
              <p className="mt-2 max-w-56 text-xs text-muted-foreground">
                Posting a request unlocks once your business is SSM-verified.{" "}
                <a className="underline underline-offset-2" href="/app/verify">
                  Get verified
                </a>
              </p>
            )}
          </div>
        }
      >
        Somebody needs something. If it's your line of work, make an offer — either by suggesting a
        business you rate, or by putting yourself forward.
      </PageHeader>

      <Tabs value={tab} onValueChange={(v) => setParam("tab", v)} className="mt-8">
        <TabsList>
          <TabsTrigger value="board">Board</TabsTrigger>
          <TabsTrigger value="mine">Your requests</TabsTrigger>
          <TabsTrigger value="offers">Your offers</TabsTrigger>
        </TabsList>

        <TabsContent value="board" className="mt-6">
          <div className="flex flex-wrap gap-2">
            {MATCH_FILTERS.map((f) => (
              <Pill
                key={f.value}
                active={matches === f.value}
                onClick={() => setParam("matches", f.value)}
              >
                {f.label}
              </Pill>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Pill active={!category} onClick={() => setParam("category", "")}>
              All kinds
            </Pill>
            {ASK_CATEGORIES.map((c) => (
              <Pill key={c} active={category === c} onClick={() => setParam("category", c)}>
                {c}
              </Pill>
            ))}
          </div>
          {renderSplit()}
        </TabsContent>

        <TabsContent value="mine" className="mt-6">
          {renderSplit()}
        </TabsContent>

        <TabsContent value="offers" className="mt-6">
          {renderSplit()}
        </TabsContent>
      </Tabs>

      <AskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => {
          setParam("tab", "mine");
          setReloadToken((n) => n + 1);
        }}
      />
    </div>
  );
}

export { AsksBoard };
