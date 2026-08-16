import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { VouchListItem } from "@/components/app/VouchListItem";
import { VouchRequestCard } from "@/components/app/VouchRequestCard";
import { VouchDialog } from "@/components/app/VouchDialog";
import { LockedFeature } from "@/components/app/LockedFeature";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationsContext";
import { fetchBusinesses } from "@/lib/api/businesses";
import { fetchVouchesGiven, fetchVouchesReceived, fetchVouchRequests } from "@/lib/api/vouches";
import { toast } from "@/lib/toast";

// The tabs split on what KIND of thing a vouch is, not on direction.
// "Requests" is a workflow — an in-flight negotiation where what matters is
// whose turn it is, and direction is almost incidental. "Received"/"Given"
// are records — settled, no state machine, where direction is the only
// thing that matters. The old three tabs mixed the two, which is how
// "Pending review" ended up listing vouches that needed nobody and "Given"
// ended up listing four unrelated states side by side.
function Section({ title, count, hint, children }) {
  return (
    <div className="md:col-span-2">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {title} ({count})
        </h2>
        {hint && <span className="text-xs text-muted-foreground">· {hint}</span>}
      </div>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </div>
  );
}

const TABS = ["requests", "received", "given"];

function Vouches() {
  const { business, refreshAccount } = useAuth();
  const { refreshVouchActions } = useNotifications();
  const locked = business.tier === "T1";

  // The open tab lives in the URL so the dashboard's activity feed can link
  // straight to it — "X accepted your vouch" belongs on Given, and landing on
  // Requests (which only lists in-flight vouches) would show an empty list for
  // an event that just told you something happened. Unrecognised values fall
  // back rather than rendering no tab at all.
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab");
  const tab = TABS.includes(requested) ? requested : "requests";

  function handleTabChange(next) {
    // replace: switching tabs isn't a navigation step worth a back-button
    // press, but arriving from a notification link is — that one stays.
    setSearchParams(next === "requests" ? {} : { tab: next }, { replace: true });
  }

  const [open, setOpen] = useState(false);
  const [allBusinesses, setAllBusinesses] = useState([]);
  const [given, setGiven] = useState([]);
  const [received, setReceived] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(!locked);

  // Mount-time load, matching pages/BusinessProfile.jsx's fetch-effect
  // shape (inline .then() chain with a `cancelled` guard) rather than
  // calling out to a shared function reference from within the effect.
  useEffect(() => {
    if (locked) return;
    let cancelled = false;
    // Not calling setLoading(true) here — the initial `useState(!locked)`
    // above already covers the mount case, and this effect only re-runs
    // if `locked` itself changes, which today only happens on a fresh
    // login/remount anyway.
    Promise.all([fetchBusinesses(), fetchVouchesGiven(), fetchVouchesReceived(), fetchVouchRequests()])
      .then(([biz, giv, rec, reqs]) => {
        if (cancelled) return;
        setAllBusinesses(biz);
        setGiven(giv);
        setReceived(rec);
        setRequests(reqs);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [locked]);

  // Reusable refetch for post-action callbacks (vouch submitted/accepted/
  // declined/etc) — an event-handler call, not an effect, so setState
  // here is unrelated to the effect-only lint constraint above. Also
  // refreshes AuthContext's `business` — accepting a vouch changes *this*
  // business's own received-vouch state (vouchCount/ladder/vouches),
  // which AuthContext otherwise only fetches once on mount and nothing
  // else would refresh.
  function refetchAll() {
    if (locked) return;
    setLoading(true);
    refreshAccount();
    // Keeps the sidebar's Vouches badge honest — accepting or declining here
    // changes whose turn it is, and the badge is rendered outside this page's
    // subtree so nothing else would tell it.
    refreshVouchActions();
    Promise.all([fetchBusinesses(), fetchVouchesGiven(), fetchVouchesReceived(), fetchVouchRequests()])
      .then(([biz, giv, rec, reqs]) => {
        setAllBusinesses(biz);
        setGiven(giv);
        setReceived(rec);
        setRequests(reqs);
      })
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }

  const needsYou = requests.filter((v) => v.waitingOn === "you");
  const waitingOnThem = requests.filter((v) => v.waitingOn === "them");
  // Flagged vouches are in flight but belong to neither business, so they
  // get their own section rather than being filed under "waiting on them"
  // — the counterparty can't move them either.
  const underReview = requests.filter((v) => v.waitingOn === "admin");
  const published = given.filter((v) => v.status === "published");
  const closed = given.filter((v) => v.status === "cancelled");
  // Received is published-only: a vouch someone else tried and failed to
  // give you isn't a record of anything you received.
  const receivedPublished = received.filter((v) => v.status === "published");

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            The give-first engine
          </div>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
            Vouches
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Real peers staking their reputation on real businesses. Give a vouch, unlock the next tier.
          </p>
        </div>

        {locked ? (
          <div className="text-sm text-muted-foreground">Vouching unlocks after SSM verification.</div>
        ) : (
          <>
            <Button onClick={() => setOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Vouch for a business
            </Button>
            <VouchDialog open={open} onOpenChange={setOpen} businesses={allBusinesses} onSuccess={refetchAll} />
          </>
        )}
      </div>

      <Tabs value={tab} onValueChange={handleTabChange} className="mt-8">
        <TabsList>
          <TabsTrigger value="requests">
            Requests
            {/* Counts only what's actually on you. The old badge counted the
                whole inbox including vouches awaiting the OTHER party's
                revision, so it nagged about work you couldn't do. */}
            {needsYou.length > 0 && (
              <span className="ml-1.5 rounded-full bg-accent px-1.5 text-[10px] font-semibold text-accent-foreground">
                {needsYou.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="received">Received ({locked ? 0 : receivedPublished.length})</TabsTrigger>
          <TabsTrigger value="given">Given ({published.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="mt-6 grid gap-8 md:grid-cols-2">
          {locked ? (
            <div className="md:col-span-2">
              <LockedFeature
                title="Vouch requests locked"
                description="Vouches waiting on you — and revisions you owe — will appear here once your SSM verification is complete."
              />
            </div>
          ) : loading ? (
            <p className="text-sm text-muted-foreground md:col-span-2">Loading…</p>
          ) : requests.length === 0 ? (
            <p className="text-sm text-muted-foreground md:col-span-2">Nothing in progress right now.</p>
          ) : (
            <>
              {needsYou.length > 0 && (
                <Section title="Needs you" count={needsYou.length}>
                  {needsYou.map((v) => (
                    <VouchRequestCard key={v.id} vouch={v} onChanged={refetchAll} />
                  ))}
                </Section>
              )}
              {/* Still shown, deliberately, even though there's nothing to
                  click. Hiding a vouch the moment you hand the turn over is
                  what made people wonder whether their change request had
                  gone through at all. */}
              {waitingOnThem.length > 0 && (
                <Section
                  title="Waiting on them"
                  count={waitingOnThem.length}
                  hint="no action needed from you"
                >
                  {waitingOnThem.map((v) => (
                    <VouchRequestCard key={v.id} vouch={v} onChanged={refetchAll} />
                  ))}
                </Section>
              )}
              {underReview.length > 0 && (
                <Section
                  title="With an admin"
                  count={underReview.length}
                  hint="on hold until they've reviewed it"
                >
                  {underReview.map((v) => (
                    <VouchRequestCard key={v.id} vouch={v} onChanged={refetchAll} />
                  ))}
                </Section>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="received" className="mt-6 grid gap-4 md:grid-cols-2">
          {locked ? (
            <div className="md:col-span-2">
              <LockedFeature
                title="Vouches locked"
                description="Vouches you receive will appear here once your SSM verification is complete."
              />
            </div>
          ) : loading ? (
            <p className="text-sm text-muted-foreground md:col-span-2">Loading…</p>
          ) : receivedPublished.length > 0 ? (
            receivedPublished.map((v) => (
              <VouchListItem key={v.id} vouch={v} mode="received" onChanged={refetchAll} />
            ))
          ) : (
            <p className="text-sm text-muted-foreground md:col-span-2">No vouches yet.</p>
          )}
        </TabsContent>

        <TabsContent value="given" className="mt-6 grid gap-8 md:grid-cols-2">
          {locked ? (
            <div className="md:col-span-2">
              <LockedFeature
                title="Vouching locked"
                description="You can vouch for other businesses once your SSM verification is complete."
              />
            </div>
          ) : loading ? (
            <p className="text-sm text-muted-foreground md:col-span-2">Loading…</p>
          ) : given.length === 0 ? (
            <p className="text-sm text-muted-foreground md:col-span-2">
              No vouches given yet. Anything still under review is in Requests.
            </p>
          ) : (
            <>
              {published.length > 0 && (
                <Section title="Published" count={published.length}>
                  {published.map((v) => (
                    <VouchListItem key={v.id} vouch={v} mode="given" onChanged={refetchAll} />
                  ))}
                </Section>
              )}
              {closed.length > 0 && (
                <Section title="Closed" count={closed.length} hint="cancelled or expired">
                  {closed.map((v) => (
                    <VouchListItem key={v.id} vouch={v} mode="given" onChanged={refetchAll} />
                  ))}
                </Section>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export { Vouches };
