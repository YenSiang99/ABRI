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
  const res = await fetch(`${API_URL}${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw Object.assign(new Error(data?.error ?? "Something went wrong. Please try again."), {
      status: res.status,
    });
  }
  return data;
}

export { apiFetch };
