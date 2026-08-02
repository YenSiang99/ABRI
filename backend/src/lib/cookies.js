import { SESSION_COOKIE } from "./jwt.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// In production the frontend (Vercel) and backend (Render) are different
// sites, so the cookie has to be SameSite=None to survive a cross-site
// fetch — which in turn requires Secure. Locally frontend/backend share
// the "localhost" site (just different ports), so Lax + non-Secure is
// both sufficient and necessary (a Secure cookie won't be stored over
// plain http).
const isProduction = process.env.NODE_ENV === "production";
const baseOptions = {
  httpOnly: true,
  sameSite: isProduction ? "none" : "lax",
  secure: isProduction,
};

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, { ...baseOptions, maxAge: SEVEN_DAYS_MS });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, baseOptions);
}

export { setSessionCookie, clearSessionCookie };
