import { createContext, useContext, useEffect, useMemo, useState } from "react";

import {
  fetchFollowing,
  fetchFollowers,
  followBusiness,
  unfollowBusiness,
} from "@/lib/api/follows";
import { useAuth } from "./AuthContext";

// The follow half of "businesses I care about", kept separate from
// ConnectionsContext on purpose even though the two load alongside each other
// and render on the same screen.
//
// They answer different questions and one of them has a state machine. A
// connection is a claim about a relationship: it can be requested, accepted,
// withdrawn, declined, and the button that shows it has four states. A follow
// is a private bookmark: it exists or it doesn't. Folding the second into the
// first would give every follow a `status` that is permanently "accepted" and
// a `requestedByYou` that is permanently true — fields whose only job would
// be to be ignored, which is how the next reader concludes a follow needs
// approving.
//
// Mirrors ConnectionsProvider's shape exactly otherwise: the same auth-timing
// guard, the same businessId-keyed `loaded` object so an account switch can't
// briefly show the previous member's list, the same "return, don't throw"
// convention on the mutators.
const FollowsContext = createContext(null);

function FollowsProvider({ children }) {
  const { business, loading: authLoading } = useAuth();
  const [loaded, setLoaded] = useState({
    businessId: null,
    following: [],
    followers: [],
    error: false,
  });

  const businessId = business?.id ?? null;

  useEffect(() => {
    // The session is an httpOnly cookie resolved by an async /auth/me, so
    // fetching before that lands would 401 on every logged-in page load.
    if (authLoading || !businessId) return;

    let cancelled = false;
    // Both sides in one go rather than lazily when the Followers tab opens.
    // They are two small reads off one table, they land in the same state
    // object, and fetching on tab change would make the tab flash empty every
    // time it's opened — the exact thing the `loaded`/`status` split exists
    // to avoid on first paint.
    Promise.all([fetchFollowing(), fetchFollowers()])
      .then(([following, followers]) => {
        if (cancelled) return;
        setLoaded({ businessId, following, followers, error: false });
      })
      .catch(() => {
        if (cancelled) return;
        setLoaded({ businessId, following: [], followers: [], error: true });
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, businessId]);

  const isCurrent = Boolean(businessId) && loaded.businessId === businessId;
  const status = !businessId ? "idle" : !isCurrent ? "loading" : loaded.error ? "error" : "ready";

  const following = useMemo(
    () => (isCurrent ? loaded.following : []),
    [isCurrent, loaded.following],
  );

  // Read-only everywhere. Nothing in the app mutates this list: you cannot
  // remove a follower, and there is deliberately no count of it rendered on
  // anyone's profile — see lib/follows.js on the server for why that line is
  // where it is.
  const followers = useMemo(
    () => (isCurrent ? loaded.followers : []),
    [isCurrent, loaded.followers],
  );

  const followedIds = useMemo(
    () => new Set(following.map((f) => f.business?.id).filter(Boolean)),
    [following],
  );

  function isFollowing(id) {
    return followedIds.has(id);
  }

  // Optimistic in neither direction: both calls await the server and then
  // refetch the row they changed from the list they already hold. A follow
  // button is not on a hot path, and an optimistic toggle that silently
  // reverts is worse than a button that takes 200ms.
  async function follow(targetBusiness) {
    try {
      const created = await followBusiness(targetBusiness.id);
      setLoaded((current) => ({
        ...current,
        following: [
          // Built from the business the caller already has rather than
          // refetching the list: the server's response carries only the row's
          // id and timestamp, and the card needs name/category/location/tier,
          // which is exactly what the caller was rendering when it pressed.
          { id: created.id, createdAt: created.createdAt, business: targetBusiness },
          ...current.following.filter((f) => f.business?.id !== targetBusiness.id),
        ],
      }));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async function unfollow(targetBusinessId) {
    try {
      await unfollowBusiness(targetBusinessId);
    } catch (err) {
      return { ok: false, error: err.message };
    }
    setLoaded((current) => ({
      ...current,
      following: current.following.filter((f) => f.business?.id !== targetBusinessId),
    }));
    return { ok: true };
  }

  const value = { following, followers, status, followedIds, isFollowing, follow, unfollow };

  return <FollowsContext.Provider value={value}>{children}</FollowsContext.Provider>;
}

function useFollows() {
  const context = useContext(FollowsContext);
  if (!context) {
    throw new Error("useFollows must be used within a FollowsProvider");
  }
  return context;
}

export { FollowsProvider, useFollows };
