import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Eye, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFollows } from "@/context/FollowsContext";
import { toast } from "@/lib/toast";
import { NetworkBusinessCard, Pill, Grid, Empty, PageHeader } from "./NetworkCard";

// The two sides of following, on one route with two tabs — unlike Requests,
// which got its own route. The split is by whether there is anything to do:
// nothing on either list here is work, so both can sit behind a tab. A
// request is work, so it can't.
//
// What a follow gets you and a connection doesn't, stated plainly because the
// page has to teach it: a follow is one-way and needs nobody's agreement, and
// the only thing you can do with one is open the profile. Anything that
// involves the other party — messaging, introductions, collaboration — needs
// a connection, because a connection took two people to make and a follow
// took one.
//
// Followers is READ-ONLY and that is deliberate. There is no remove-a-
// follower button (you cannot un-invite someone from reading a public
// listing), and there is no follower count rendered on anyone's profile — see
// the Follow comment in backend/prisma/schema.prisma for why that second line
// is the one that matters.

const TABS = ["following", "followers"];

function FollowingCard({ entry }) {
  const business = entry.business;
  const { unfollow } = useFollows();
  const [busy, setBusy] = useState(false);

  async function handleUnfollow() {
    setBusy(true);
    const result = await unfollow(business.id);
    if (result.ok) {
      toast(`Unfollowed ${business.name}`);
      return;
    }
    setBusy(false);
    toast.error(result.error);
  }

  return (
    <NetworkBusinessCard
      business={business}
      from={{ path: "following", label: "Back to following" }}
      badges={<Pill icon={Eye}>Following</Pill>}
      actions={
        <Button size="sm" variant="secondary" onClick={handleUnfollow} disabled={busy}>
          {busy ? "…" : "Unfollow"}
        </Button>
      }
    />
  );
}

// No actions at all beyond the profile link. Following someone back is a
// decision to make on their profile, where you can see who they are, rather
// than a reflex button on a list — and there is nothing else you are entitled
// to do to a follower.
function FollowerCard({ entry }) {
  return (
    <NetworkBusinessCard
      business={entry.business}
      from={{ path: "following?tab=followers", label: "Back to followers" }}
      badges={<Pill icon={Users}>Follows you</Pill>}
    />
  );
}

function NetworkFollowing() {
  const { following, followers, status } = useFollows();

  // Tab in the URL, same as the Vouches screen — a link can point at the
  // Followers list directly instead of dropping the reader on the other one.
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab");
  const tab = TABS.includes(requested) ? requested : "following";

  function handleTabChange(next) {
    setSearchParams(next === "following" ? {} : { tab: next }, { replace: true });
  }

  const pending = status === "loading" || status === "idle";

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <PageHeader title="Following">
        One-way and unannounced. Nobody is told when you follow them, and following someone lets
        you open their profile — nothing more. Anything mutual needs a connection.
      </PageHeader>

      <Tabs value={tab} onValueChange={handleTabChange} className="mt-8">
        <TabsList>
          <TabsTrigger value="following">Following</TabsTrigger>
          {/* No badge on this one, ever. A follower is not work, and a count
              that nags would push a member to treat followers as a score. */}
          <TabsTrigger value="followers">Followers</TabsTrigger>
        </TabsList>

        <TabsContent value="following">
          {pending ? (
            <Empty>Loading…</Empty>
          ) : status === "error" ? (
            <Empty>Couldn't load what you're following. Refresh to try again.</Empty>
          ) : following.length === 0 ? (
            <Empty icon={Eye}>
              You're not following anyone yet. Following is one-way and private — the business
              isn't told, and it doesn't need to agree.
            </Empty>
          ) : (
            <>
              <div className="mt-6 text-sm text-muted-foreground">
                {following.length} {following.length === 1 ? "business" : "businesses"} · they
                aren't told you're following them
              </div>
              <Grid>
                {following.map((f) => (
                  <FollowingCard key={f.id} entry={f} />
                ))}
              </Grid>
            </>
          )}
        </TabsContent>

        <TabsContent value="followers">
          {pending ? (
            <Empty>Loading…</Empty>
          ) : status === "error" ? (
            <Empty>Couldn't load your followers. Refresh to try again.</Empty>
          ) : followers.length === 0 ? (
            <Empty icon={Users}>
              Nobody is following you yet. When someone does, they appear here — you're never
              notified, and this list is only visible to you.
            </Empty>
          ) : (
            <>
              <div className="mt-6 text-sm text-muted-foreground">
                {followers.length} {followers.length === 1 ? "business" : "businesses"} · only you
                can see this list
              </div>
              <Grid>
                {followers.map((f) => (
                  <FollowerCard key={f.id} entry={f} />
                ))}
              </Grid>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export { NetworkFollowing };
