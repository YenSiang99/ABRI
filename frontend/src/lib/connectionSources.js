// How a connection came about. Mirrors CONNECTION_SOURCES in
// backend/src/lib/connections.js, which rejects anything else — these are
// shared constants rather than inline strings mostly because Network.jsx
// filters on them, and a filter that disagrees with the server's allowlist
// silently renders an empty tab.
const SOURCE_NFC_SCAN = "nfc_scan";
const SOURCE_DIRECTORY = "directory";

export { SOURCE_NFC_SCAN, SOURCE_DIRECTORY };
