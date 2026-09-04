// In production this should be "/api" — Vercel rewrites that to the Render
// backend (see frontend/vercel.json) so the browser only ever talks to its
// own origin, keeping the session cookie same-site. Locally it points
// straight at the backend dev server instead, since there's no proxy.
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

// Shared fetch wrapper for every backend route module in this directory —
// centralizes the base URL, cookie credentials, JSON handling, and error
// shaping so each domain file (businesses.js, auth.js, admin.js) only has
// to describe its own endpoints.
async function apiFetch(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // fetch only rejects when the request never got a response at all —
    // offline, DNS failure, backend not running. Its native message is
    // "Failed to fetch", which callers render straight into the UI.
    throw Object.assign(new Error("Can't reach the server. Check your connection and try again."), {
      status: 0,
    });
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw Object.assign(new Error(data?.error ?? "Something went wrong. Please try again."), {
      status: res.status,
      // Present only on a membership-tier gate (a 402 from backend's
      // failUpgrade), and
      // carried through so a caller can open an upgrade prompt instead of
      // toasting. Most call sites don't need it: components/app/UpgradePrompt
      // catches these before the request is made. It's here for the ones that
      // can't — a tier that lapsed mid-session, or a gate the client hasn't
      // mirrored — where the alternative is a toast that reads like a fault.
      requiredMembershipTier: data?.requiredMembershipTier,
    });
  }
  return data;
}

export { apiFetch };
