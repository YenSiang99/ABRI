import { SESSION_COOKIE } from "./jwt.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// The frontend proxies /api/* to this backend (see frontend/vercel.json),
// so the browser only ever talks to the Vercel origin — the backend is
// never a cross-site request from the browser's point of view, in prod or
// locally. That means Lax is always correct (and gives us real CSRF
// protection, unlike None). Secure still needs to track environment: prod
// is HTTPS-only, but a Secure cookie won't be stored over plain local http.
const isProduction = process.env.NODE_ENV === "production";
const baseOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: isProduction,
};

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, { ...baseOptions, maxAge: SEVEN_DAYS_MS });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, baseOptions);
}

export { setSessionCookie, clearSessionCookie };
