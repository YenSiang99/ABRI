import { SESSION_COOKIE } from "./jwt.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const baseOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
};

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, { ...baseOptions, maxAge: SEVEN_DAYS_MS });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, baseOptions);
}

export { setSessionCookie, clearSessionCookie };
