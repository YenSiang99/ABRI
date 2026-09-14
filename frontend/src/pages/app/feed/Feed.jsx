import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Radio, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { VouchDialog } from "@/components/app/VouchDialog";
import { UpgradePrompt, useUpgradeGate } from "@/components/app/UpgradePrompt";
import { useAuth } from "@/context/AuthContext";
import { fetchFeed } from "@/lib/api/feed";
import { FeedRow, Empty, PageHeader } from "./FeedCard";

// The network's trust activity, in one column: vouches published,
// listings claimed and businesses verified.
//
// WHAT THIS SCREEN IS FOR. Today trust is invisible until you open a specific
// profile, which means a member has to already be looking for it to find any.
// A feed makes "14 verified businesses vouch for this company" something you
// WITNESS, repeatedly, without asking — which is the difference between a
// directory and a network.
//
// It is also the only content surface in the app that needs no anti-spam
// machinery at all. Every row is a third-party positive act about somebody
// else, so there is nothing to advertise on it: no cap, no expiry, no
// ephemerality, no report button, no moderation queue. Compare the header of
// routes/asks.js, which needs four mechanisms to hold a board open to
// anyone's own words. Keep it that way — the moment this screen grows a
// compose box it inherits every one of those problems.
//
// NOT gated by plan, ever. A Free member watching vouches go past that they
// cannot give is the best argument for Plus in the product; it only works if
// they can watch. See the header of backend/src/routes/feed.js.

const TABS = ["network", "following"];

function Feed() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get("tab")) ? params.get("tab") : "network";

  const [events, setEvents] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  // ONE dialog for the whole column, re-pointed per row, rather than one per
  // FeedRow. VouchDialog's open-time reset (the prevOpen comparison, not a
  // useEffect) was written to make exactly this re-pointing safe, and a feed
  // can run to hundreds of rows.
  const { refreshAccount } = useAuth();
  const vouchGate = useUpgradeGate("giveVouch");
  const [vouchTarget, setVouchTarget] = useState(null);

  // Guarded HERE rather than in the row, so the plan check sits in one place
  // and the row keeps rendering a plain button. Below Plus this opens the
  // upgrade dialog and never touches vouchTarget — the button stays fully
  // styled either way, which is the whole point of the gate.
  const openVouch = vouchGate.guard((target) => setVouchTarget(target));

  // vouchedFor lives on the session business, so without this the button
  // stays lit on a row the server would now answer 409 for. The new vouch is
  // "pending" until the receiver accepts, so it correctly does NOT appear in
  // the feed yet — the row's button simply goes away.
  async function handleVouched() {
    setVouchTarget(null);
    await refreshAccount();
  }

  // Two entry points into one request so "Load more" can append where the
  // first page replaces. The cursor is the server's, never derived from the
  // last row's timestamp on the client — ties inside a millisecond are
  // exactly what an id-in-the-sort cursor exists to resolve.
  const load = useCallback(
    async (scope, after = null) => {
      const setBusy = after ? setLoadingMore : setLoading;
      setBusy(true);
      try {
        const { events: page, nextCursor } = await fetchFeed({ scope, cursor: after });
        setEvents((prev) => (after ? [...prev, ...page] : page));
        setCursor(nextCursor);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  // Reset on a tab change rather than keeping two cached lists. Switching
  // scope changes what the cursor even means, and carrying one across would
  // page the network feed using a position in the following feed.
  useEffect(() => {
    setEvents([]);
    setCursor(null);
    load(tab);
  }, [tab, load]);

  function setTab(value) {
    const next = new URLSearchParams(params);
    next.set("tab", value);
    setParams(next, { replace: true });
  }

  // Four states, four distinct strings — the AsksBoard.jsx precedent. An
  // empty Following tab and an empty network are different problems with
  // different next steps, and one shared "Nothing here" tells the reader
  // neither of them.
  function body() {
    if (loading) return <Empty>Loading…</Empty>;
    if (error) return <Empty>{error}</Empty>;

    if (events.length === 0) {
      return tab === "following" ? (
        <Empty icon={Eye}>
          Nothing from the businesses you follow yet. Following someone is private — they're never
          told — so follow freely from any profile and their vouches show up here.
        </Empty>
      ) : (
        <Empty icon={Radio}>
          Nothing has happened on the network yet. The first published vouch lands here.
        </Empty>
      );
    }

    return (
      <>
        <ul className="mt-2 divide-y divide-border">
          {events.map((event) => (
            <FeedRow key={event.id} event={event} onVouch={openVouch} />
          ))}
        </ul>
        {/* A button rather than infinite scroll. There is no scroll
            infrastructure in this app, and a button is honest about the fact
            that the server hands out one page at a time. A null cursor means
            the end, so nothing renders — the client never has to compare
            lengths to guess. */}
        {cursor && (
          <div className="mt-6 flex justify-center">
            <Button variant="outline" disabled={loadingMore} onClick={() => load(tab, cursor)}>
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <PageHeader eyebrow="Feed" title="The network">
        Every vouch published, and every business that joins or gets
        verified. Nobody posts here — this is what the network did.
      </PageHeader>

      <Tabs value={tab} onValueChange={setTab} className="mt-8">
        <TabsList>
          <TabsTrigger value="network">Network</TabsTrigger>
          <TabsTrigger value="following">Following</TabsTrigger>
        </TabsList>

        {/* Both tabs render the same body — the scope is a server filter, not
            two screens. Two TabsContent blocks because the primitive needs
            one per value to know which is active. */}
        <TabsContent value="network" className="mt-6">
          {body()}
        </TabsContent>
        <TabsContent value="following" className="mt-6">
          {body()}
        </TabsContent>
      </Tabs>

      {/* Both render nothing until something opens them, so they sit at the
          page root rather than inside a row. targetBusiness is the row's own
          subject object — VouchDialog needs only id/name/category off it, all
          of which the feed already sends. */}
      <VouchDialog
        open={Boolean(vouchTarget)}
        onOpenChange={(next) => !next && setVouchTarget(null)}
        targetBusiness={vouchTarget}
        onSuccess={handleVouched}
      />
      <UpgradePrompt gate={vouchGate} />
    </div>
  );
}

export { Feed };
