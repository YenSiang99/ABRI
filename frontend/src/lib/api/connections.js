import { apiFetch } from "./client";

// Mirrors backend/src/routes/connections.js.

// Every edge touching the logged-in business, newest first, PENDING ONES
// INCLUDED. Each carries a `counterparty` resolved server-side, so nothing
// here has to know which end of the stored pair it is, plus `status`
// ("pending" | "accepted") and `requestedByYou` — between them, everything
// needed to sort a row into requests-to-answer, requests-you-sent, or the
// network itself.
function fetchConnections() {
  return apiFetch("/connections").then((data) => data.connections);
}

// Sends a request, or connects outright — the server decides from `source`:
// a card tap ("nfc_scan") is physical proof the two met and lands accepted,
// a directory connect waits for the other side. So a resolved connection
// here may have status "pending"; check it before saying "connected".
//
// Connecting to someone who has already asked YOU accepts their request
// rather than doing nothing, so this doubles as the accept path from a
// profile page.
//
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

// Accepts a request someone sent you. Only the recipient may call it — the
// requester gets a 403, which is the whole point of the status column.
function acceptConnection(id) {
  return apiFetch(`/connections/${id}/accept`, { method: "POST" }).then((data) => data.connection);
}

// One call for three things, matching the single DELETE route on the server:
// remove an accepted connection, withdraw a request you sent, or decline one
// you received. They're the same delete by different people, and the server
// works out which from who's asking.
//
// Declining leaves no record — nothing stores that someone said no. Takes the
// connection's own id, not the counterparty's.
function removeConnection(id) {
  return apiFetch(`/connections/${id}`, { method: "DELETE" });
}

export { fetchConnections, createConnection, acceptConnection, removeConnection };
