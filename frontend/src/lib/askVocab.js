// Mirrors ASK_CATEGORIES in backend/src/lib/asks.js, which is itself the only
// surviving copy of ABRI-feature-checklist.md §7's "a request can be posted
// under" list.
//
// The server rejects anything not in this list, so this copy exists only so
// the compose dialog can render the options. Flat array, no logic — the
// moment it grows any, it stops being a mirror.
const ASK_CATEGORIES = [
  "Customer requirement",
  "Supplier requirement",
  "Partnership",
  "Distribution",
  "Export",
  "Service requirement",
  "Collaboration",
];

export { ASK_CATEGORIES };
