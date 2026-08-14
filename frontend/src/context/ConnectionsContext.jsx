import { createContext, useContext, useEffect, useMemo, useState } from "react";

import {
  fetchConnections,
  createConnection,
  removeConnection as apiRemoveConnection,
} from "@/lib/api/connections";
import { useAuth } from "./AuthContext";

// One copy of "who am I connected to", shared by everything that renders a
// connect button. Four pages need this and only one of them (Network) is
// actually about connections — the other three just need to know whether to
// say "Connect" or "Connected". Without a shared copy each would fetch the
// whole list on mount to answer that, and each would carry its own version
// of the connect call, the auth-timing guard, and the dedupe below.
//
// Replaces lib/store/connections.js, which got the same job done with a
// localStorage store components subscribed to. That store's real problem
// wasn't the sharing, it was that a card tap only ever reached the tapper's
// own browser.
const ConnectionsContext = createContext(null);

function ConnectionsProvider({ children }) {
  const { business, loading: authLoading } = useAuth();
  const [loaded, setLoaded] = useState({ businessId: null, connections: [], error: false });

  const businessId = business?.id ?? null;

  useEffect(() => {
    // The session is an httpOnly cookie resolved by an async /auth/me, so
    // fetching before that lands would 401 on every logged-in page load.
    // Nothing to fetch for a logged-out visitor or an admin with no
    // business either — both just sit at "idle" below.
    if (authLoading || !businessId) return;

    let cancelled = false;
    fetchConnections()
      .then((connections) => {
        if (cancelled) return;
        setLoaded({ businessId, connections, error: false });
      })
      .catch(() => {
        if (cancelled) return;
        setLoaded({ businessId, connections: [], error: true });
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, businessId]);

  // Status and the visible list are derived from which business the loaded
  // data belongs to, rather than being set alongside it. That's partly the
  // same shape BusinessProfile.jsx uses (`loadedId !== id ? "loading"`), and
  // partly because it means the effect never calls setState synchronously —
  // so switching accounts can't briefly show the previous one's network
  // while the new fetch is in flight.
  //
  // "idle" is the resting state for anyone who can't have connections at
  // all. It's distinct from "ready" so CardTap can tell "none" apart from
  // "haven't looked yet" before deciding to auto-connect.
  const isCurrent = Boolean(businessId) && loaded.businessId === businessId;
  const status = !businessId ? "idle" : !isCurrent ? "loading" : loaded.error ? "error" : "ready";

  // Memoized for identity, not cost: the `[]` branch would otherwise be a
  // fresh array every render, rebuilding the Set below each time and
  // changing the context value on every parent render.
  const connections = useMemo(
    () => (isCurrent ? loaded.connections : []),
    [isCurrent, loaded.connections],
  );

  const connectedIds = useMemo(
    () => new Set(connections.map((c) => c.counterparty?.id).filter(Boolean)),
    [connections],
  );

  function isConnected(id) {
    return connectedIds.has(id);
  }

  // Replaces the whole list for whichever business is current now, not the
  // one that was current when this was called — an account switch mid-flight
  // makes the result stale, and the isCurrent check above will discard it.
  //
  // Carries the error flag through rather than clearing it: a connect that
  // succeeds after the initial load failed proves one edge exists, not that
  // we now know all of them, and clearing it would promote a one-item list
  // to "ready" and render it as the member's whole network.
  function replaceConnections(update) {
    setLoaded((current) => ({
      businessId: current.businessId,
      connections: update(current.connections),
      error: current.error,
    }));
  }

  async function refreshConnections() {
    if (!businessId) return;
    try {
      const connections = await fetchConnections();
      setLoaded({ businessId, connections, error: false });
    } catch {
      setLoaded({ businessId, connections: [], error: true });
    }
  }

  // Returns rather than throws, matching AuthContext's login/claimOrRegister
  // — callers toast the message and carry on.
  async function connect(targetId, source) {
    try {
      const { connection, created } = await createConnection({ businessId: targetId, source });
      // Deduped by id because the server answers an already-connected pair
      // with 200 and the existing row, so this can legitimately be called
      // for a connection already in the list.
      replaceConnections((current) => [
        connection,
        ...current.filter((c) => c.id !== connection.id),
      ]);
      // `created` distinguishes a new edge from one that was already there —
      // CardTap words its confirmation from it.
      return { ok: true, connection, created };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async function disconnect(connectionId) {
    try {
      await apiRemoveConnection(connectionId);
    } catch (err) {
      // A 404 means the other side already removed it. The server and this
      // list agree on the outcome; it's the local copy that's behind, so
      // drop it rather than reporting a failure for something that's true.
      if (err.status !== 404) return { ok: false, error: err.message };
    }
    replaceConnections((current) => current.filter((c) => c.id !== connectionId));
    return { ok: true };
  }

  const value = {
    connections,
    status,
    connectedIds,
    isConnected,
    connect,
    disconnect,
    refreshConnections,
  };

  return <ConnectionsContext.Provider value={value}>{children}</ConnectionsContext.Provider>;
}

function useConnections() {
  const context = useContext(ConnectionsContext);
  if (!context) {
    throw new Error("useConnections must be used within a ConnectionsProvider");
  }
  return context;
}

export { ConnectionsProvider, useConnections };
