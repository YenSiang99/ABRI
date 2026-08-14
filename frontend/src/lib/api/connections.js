import { apiFetch } from "./client";

// Mirrors backend/src/routes/connections.js.

// Every edge touching the logged-in business, newest first. Each carries a
// `counterparty` resolved server-side, so nothing here has to know which
// end of the stored pair it is.
function fetchConnections() {
  return apiFetch("/connections").then((data) => data.connections);
}

// Idempotent: connecting to someone you're already connected to returns the
// existing edge rather than erroring, which is what lets CardTap fire this
// from an effect without guarding perfectly against a double-invoke.
//
// Resolves to `{ connection, created }` rather than the connection alone —
// `created` is false when the pair was already connected, which is the only
// way a caller can tell the two apart without the full list to compare
// against.
function createConnection({ businessId, source }) {
  return apiFetch("/connections", { method: "POST", body: { businessId, source } });
}

// Removes it for both sides — there's one row per pair and both parties own
// it equally. Takes the connection's own id, not the counterparty's.
function removeConnection(id) {
  return apiFetch(`/connections/${id}`, { method: "DELETE" });
}

export { fetchConnections, createConnection, removeConnection };
