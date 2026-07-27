import { useSyncExternalStore } from "react";

import { readJSON, writeJSON } from "./persist";
import { getBusiness } from "./businesses";

const CONNECTIONS_KEY = "abri:connections:v1";

let connectionCache = null;
const connectionListeners = new Set();

function loadConnections() {
  if (connectionCache) return connectionCache;
  connectionCache = readJSON(CONNECTIONS_KEY, []);
  return connectionCache;
}

function persistConnections() {
  writeJSON(CONNECTIONS_KEY, connectionCache);
  connectionListeners.forEach((cb) => cb());
}

function subscribeConnections(cb) {
  connectionListeners.add(cb);
  return () => connectionListeners.delete(cb);
}

function getConnectionsSnapshot() {
  return loadConnections();
}

// Forces a fresh read from localStorage, discarding the in-memory cache —
// see refreshBusinesses in businesses.js for why this is needed (a scan on
// one tab/device must be visible to the other side without a reload).
function refreshConnections() {
  connectionCache = null;
  loadConnections();
  connectionListeners.forEach((cb) => cb());
  return connectionCache;
}

// A connection is one edge shared by both businesses (mutual — scanning a
// card connects both sides, and removing it removes it for both), so it's
// keyed by the sorted pair rather than by direction. This makes add/remove/
// lookup direct key operations and a duplicate scan naturally idempotent.
function connectionId(businessIdA, businessIdB) {
  return [businessIdA, businessIdB].sort().join("__");
}

function addConnection(businessIdA, businessIdB, source = "nfc_scan") {
  if (!businessIdA || !businessIdB || businessIdA === businessIdB) return null;

  const all = loadConnections();
  const id = connectionId(businessIdA, businessIdB);
  const existing = all.find((c) => c.id === id);
  if (existing) return existing;

  const record = {
    id,
    businessAId: businessIdA,
    businessBId: businessIdB,
    source,
    createdAt: new Date().toISOString(),
  };
  connectionCache = [...all, record];
  persistConnections();
  return record;
}

function removeConnection(connectionIdToRemove) {
  const all = loadConnections();
  connectionCache = all.filter((c) => c.id !== connectionIdToRemove);
  persistConnections();
}

function areConnected(businessIdA, businessIdB) {
  const id = connectionId(businessIdA, businessIdB);
  return loadConnections().some((c) => c.id === id);
}

function listConnectionsFor(businessId) {
  return loadConnections()
    .filter((c) => c.businessAId === businessId || c.businessBId === businessId)
    .map((c) => {
      const otherId = c.businessAId === businessId ? c.businessBId : c.businessAId;
      return {
        connectionId: c.id,
        business: getBusiness(otherId),
        source: c.source,
        createdAt: c.createdAt,
      };
    })
    .filter((c) => c.business)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function useConnectionsFor(businessId) {
  const all = useSyncExternalStore(subscribeConnections, getConnectionsSnapshot);
  if (!businessId) return [];
  return all
    .filter((c) => c.businessAId === businessId || c.businessBId === businessId)
    .map((c) => {
      const otherId = c.businessAId === businessId ? c.businessBId : c.businessAId;
      return {
        connectionId: c.id,
        business: getBusiness(otherId),
        source: c.source,
        createdAt: c.createdAt,
      };
    })
    .filter((c) => c.business)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export {
  addConnection,
  removeConnection,
  areConnected,
  listConnectionsFor,
  useConnectionsFor,
  refreshConnections,
};
