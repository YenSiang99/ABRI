import { createContext, useContext, useEffect, useState } from "react";

import { login as apiLogin, logout as apiLogout, getMe } from "@/lib/api/auth";
import { submitBusinessClaim } from "@/lib/api/businesses";

const AuthContext = createContext(null);

function AuthProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [business, setBusiness] = useState(null);
  // True until the initial /auth/me check resolves — the real session lives
  // in an httpOnly cookie, so (unlike the old localStorage-backed mock) we
  // can't know synchronously on first render whether one exists.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then((data) => {
        setAccount(data.account);
        setBusiness(data.business);
      })
      .catch(() => {
        setAccount(null);
        setBusiness(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    try {
      const data = await apiLogin(email, password);
      setAccount(data.account);
      setBusiness(data.business);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async function logout() {
    await apiLogout().catch(() => {});
    setAccount(null);
    setBusiness(null);
  }

  // Submits a claim (either against an existing T0 listing or a brand new
  // business) to the real backend — see routes/businesses.js POST /claim.
  // Deliberately does NOT log the user in: the backend response tells the
  // caller which of the two verification paths this claim landed on
  // (domain-match, needs the emailed link opened; manual review, needs an
  // admin to approve it first).
  async function claimOrRegister({
    businessId,
    businessName,
    category,
    location,
    regNumber,
    repName,
    repEmail,
    repPhone,
    repRole,
    password,
  }) {
    try {
      const result = await submitBusinessClaim({
        businessId,
        businessName,
        category,
        location,
        ssm: regNumber,
        repName,
        repEmail,
        repPhone,
        repRole,
        password,
      });
      return result.requiresEmailVerification
        ? { ok: true, requiresEmailVerification: true, token: result.token }
        : { ok: true, requiresAdminApproval: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  const value = {
    account,
    business,
    isAuthenticated: Boolean(account),
    loading,
    login,
    logout,
    claimOrRegister,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

export { AuthProvider, useAuth };
