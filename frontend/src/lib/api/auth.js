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

export { login, logout, getMe, verifyClaimToken };
