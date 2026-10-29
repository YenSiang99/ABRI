import { apiFetch } from "./client";

// Mirrors backend/src/routes/auth.js.

function login(email, password) {
  return apiFetch("/auth/login", { method: "POST", body: { email, password } });
}

function logout() {
  return apiFetch("/auth/logout", { method: "POST" });
}

function getMe() {
  return apiFetch("/auth/me");
}

function verifyClaimToken(token) {
  return apiFetch(`/auth/verify-claim/${token}`, { method: "POST" });
}

// body: { email, password } from the login screen, or { token } from an
// old confirmation link.
function resendVerification(body) {
  return apiFetch("/auth/resend-verification", { method: "POST", body });
}

function forgotPassword(email) {
  return apiFetch("/auth/forgot-password", { method: "POST", body: { email } });
}

// Starts a session, like logging in.
function resetPassword(token, password) {
  return apiFetch(`/auth/reset-password/${token}`, { method: "POST", body: { password } });
}

export { login, logout, getMe, verifyClaimToken, resendVerification, forgotPassword, resetPassword };
