import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ClipboardList, Filter } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AskDialog } from "@/components/app/AskDialog";
import { useAuth } from "@/context/AuthContext";
import { ASK_CATEGORIES } from "@/lib/askVocab";
import { fetchAsks, fetchMyAsks, fetchAnsweredAsks } from "@/lib/api/asks";
import { AskListCard, Grid, Empty, PageHeader } from "./AskCard";
import { ASK_POSTING_VERIFICATION_LEVELS } from "@/lib/verificationLevels";



const TABS = ["board", "mine", "answered"];
const MATCH_FILTERS = [
  { value: "all", label: "All asks" },
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

  const [loaded, setLoaded] = useState({ asks: [], error: null, key: null });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  // One key for everything that changes what's fetched, reloadToken included,
  // so a post refetches AND shows the loading state on the way.
  const key = `${tab}|${matches}|${category}|${reloadToken}`;

  useEffect(() => {
    let cancelled = false;
    const request =
      tab === "mine"
        ? fetchMyAsks()
        : tab === "answered"
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
            // dashboard's Pro alert link (/app/asks?matches=category) landed
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

  // Derived, never set inside the effect — the convention BusinessProfile.jsx
  // and the network pages use (`status = loadedId !== id ? "loading" : ...`).
  const loading = loaded.key !== key;

  function setParam(name, value) {
    const next = new URLSearchParams(params);
    if (!value || value === "all" || (name === "tab" && value === "board")) next.delete(name);
    else next.set(name, value);
    setParams(next, { replace: true });
  }

  const canPost = business && ASK_POSTING_VERIFICATION_LEVELS.has(business.verificationLevel);
  const asks = loaded.asks;
  const filtering = tab === "board" && (matches !== "all" || category);

  // Four distinct states, four distinct strings. A filtered-to-empty board and
  // a genuinely empty one mean completely different things to a member.
  function renderList() {
    if (loading) return <Empty>Loading asks…</Empty>;
    if (loaded.error) return <Empty>Couldn't load the board. Refresh to try again.</Empty>;
    if (asks.length === 0 && filtering) {
      return (
        <Empty icon={Filter}>
          No asks match those filters.
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
    if (asks.length === 0) {
      if (tab === "mine") {
        return (
          <Empty icon={ClipboardList}>
            You haven't posted an ask yet. If you need something — a supplier, a partner, a service
            — post it and the members who do that work will see it.
          </Empty>
        );
      }
      if (tab === "answered") {
        return (
          <Empty icon={ClipboardList}>
            You haven't answered anything yet. Answering is how the network works: recommend
            somebody good and they find out who sent them.
          </Empty>
        );
      }
      return (
        <Empty icon={ClipboardList}>
          Nobody has posted an ask yet. If you need something — a supplier, a partner, a service —
          post it and the members who do that work will see it.
        </Empty>
      );
    }
    return (
      <>
        <div className="mt-4 text-sm text-muted-foreground">
          {asks.length} {asks.length === 1 ? "ask" : "asks"}
        </div>
        <Grid>
          {asks.map((ask) => (
            <AskListCard key={ask.id} ask={ask} />
          ))}
        </Grid>
      </>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <PageHeader
        title="Asks"
        action={
          <div className="text-right">
            {/* A tier gate, so neither useUpgradeGate nor LockedFeature: there
                is no plan to sell here. The button stays visible and says what
                the actual next step is — get SSM-verified, which is free —
                rather than naming a price that wouldn't open this door. */}
            <Button onClick={() => setDialogOpen(true)} disabled={!canPost}>
              Post an ask
            </Button>
            {!canPost && (
              <p className="mt-2 max-w-56 text-xs text-muted-foreground">
                Posting an ask unlocks once your business is SSM-verified.{" "}
                <a className="underline underline-offset-2" href="/app/verify">
                  Get verified
                </a>
              </p>
            )}
          </div>
        }
      >
        Somebody needs something. If it's your line of work, you can answer — by recommending a
        business you rate, or by putting yourself forward.
      </PageHeader>

      <Tabs value={tab} onValueChange={(v) => setParam("tab", v)} className="mt-8">
        <TabsList>
          <TabsTrigger value="board">Board</TabsTrigger>
          <TabsTrigger value="mine">Your asks</TabsTrigger>
          <TabsTrigger value="answered">You answered</TabsTrigger>
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
          {renderList()}
        </TabsContent>

        <TabsContent value="mine" className="mt-6">
          {renderList()}
        </TabsContent>

        <TabsContent value="answered" className="mt-6">
          {renderList()}
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
