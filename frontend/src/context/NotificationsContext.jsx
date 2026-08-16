import { createContext, useCallback, useContext, useEffect, useState } from "react";

import {
  fetchUnreadActivityCount,
  markActivityRead,
  markOneActivityRead,
} from "@/lib/api/activity";
import { fetchVouchRequests } from "@/lib/api/vouches";
import { useAuth } from "./AuthContext";

// The two numbers the sidebar puts on nav items: unread activity, and vouches
// whose turn is yours. Both answer "what needs me?", both have to be readable
// from the sidebar and writable from the page that clears them, and those two
// never share a subtree — AppSidebar sits beside the <Outlet> in AppLayout.
// Without a shared copy the badges would hold their mount-time numbers for the
// whole session, so a member who had just cleared their vouch queue would
// still be told three were waiting.
const NotificationsContext = createContext(null);

function NotificationsProvider({ children }) {
  const { business, loading: authLoading } = useAuth();
  const [loaded, setLoaded] = useState({ businessId: null, unread: 0, vouchActions: 0 });

  const businessId = business?.id ?? null;

  useEffect(() => {
    // Same guard as ConnectionsProvider: the session resolves through an
    // async /auth/me, so anything fetched before that lands 401s. Admins
    // have no business and no feed, so they never fetch at all.
    if (authLoading || !businessId) return;

    let cancelled = false;
    // Settled together so one slow call can't publish a half-updated pair of
    // badges, and so a failure in either leaves both at a known zero rather
    // than one stale and one fresh.
    Promise.all([
      fetchUnreadActivityCount().catch(() => 0),
      // Counts only what's on you, matching the "Needs you" section and tab
      // badge in Vouches.jsx. A badge that included vouches awaiting the
      // other party's revision would nag about work the member can't do.
      fetchVouchRequests()
        .then((vouches) => vouches.filter((v) => v.waitingOn === "you").length)
        .catch(() => 0),
    ]).then(([unread, vouchActions]) => {
      if (!cancelled) setLoaded({ businessId, unread, vouchActions });
    });

    return () => {
      cancelled = true;
    };
  }, [authLoading, businessId]);

  // Derived from which business the counts belong to rather than set alongside
  // them — the same shape ConnectionsContext uses, and for the same reason: it
  // keeps setState out of the effect body, and it means switching accounts
  // shows zero rather than the previous member's badges while the new fetch is
  // in flight.
  const isCurrent = Boolean(businessId) && loaded.businessId === businessId;
  const unreadCount = isCurrent ? loaded.unread : 0;
  const vouchActionCount = isCurrent ? loaded.vouchActions : 0;

  // Opening a notification clears that one. Decrements rather than refetching
  // because the click is usually a navigation away from the dashboard — the
  // badge has to be right before the next page paints, and a round trip
  // wouldn't land in time.
  //
  // Math.max guards the floor: two rapid clicks, or a click on something the
  // server already considered read, would otherwise push the badge negative.
  const markOneRead = useCallback(async (id) => {
    setLoaded((current) => ({ ...current, unread: Math.max(0, current.unread - 1) }));
    try {
      await markOneActivityRead(id);
    } catch {
      // Same reasoning as markAllRead below — a badge that's one too low for
      // one page load is a smaller lie than one that bounces back up while
      // the member is looking at the thing it's counting.
    }
  }, []);

  // The "Mark all read" escape hatch, for events with nothing to open. Zeroes
  // the badge immediately and lets the write settle behind it.
  //
  // useCallback for the same reason as markOneRead: these are passed into
  // Dashboard's render path, and a fresh identity each render would churn
  // anything that lists them as a dependency.
  const markAllRead = useCallback(async () => {
    // Functional update so this doesn't need businessId in its closure and
    // can stay identity-stable for the whole session.
    setLoaded((current) => ({ ...current, unread: 0 }));
    try {
      await markActivityRead();
    } catch {
      // Left at zero on failure. The badge reappears on the next load if the
      // write really didn't land, which is a quieter wrong answer than
      // re-raising a count against events the member is currently reading.
    }
  }, []);

  // Called by Vouches.jsx after any action that can change whose turn it is.
  // Refetches rather than decrementing: accepting one vouch can settle others
  // (an expiry swept on read, an admin decision landing between loads), so the
  // server's count is the only one worth trusting.
  const refreshVouchActions = useCallback(async () => {
    try {
      const vouches = await fetchVouchRequests();
      const vouchActions = vouches.filter((v) => v.waitingOn === "you").length;
      setLoaded((current) => ({ ...current, vouchActions }));
    } catch {
      // Leave the badge as-is. The page that triggered this shows the real
      // list anyway, so a stale number beside it is better than a wrong one.
    }
  }, []);

  return (
    <NotificationsContext.Provider
      value={{ unreadCount, vouchActionCount, markOneRead, markAllRead, refreshVouchActions }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationsProvider");
  }
  return context;
}

export { NotificationsProvider, useNotifications };
