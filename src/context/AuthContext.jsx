import { createContext, useContext, useState } from "react";

import * as businessStore from "@/lib/store/businesses";
import * as accountStore from "@/lib/store/accounts";

const AuthContext = createContext(null);

const SESSION_KEY = "abri:session:v1";

function getInitialSession() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function AuthProvider({ children }) {
  const [session, setSession] = useState(getInitialSession);
  const businesses = businessStore.useBusinesses();

  const account = session ? accountStore.getAccount(session.accountId) : null;
  const business = account ? (businesses.find((b) => b.id === account.businessId) ?? null) : null;

  function persistSession(next) {
    setSession(next);
    if (next) {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    } else {
      window.localStorage.removeItem(SESSION_KEY);
    }
  }

  function login(email, password) {
    const found = accountStore.verifyPassword(email, password);
    if (!found) return { ok: false, error: "Incorrect email or password." };

    const claimedBusiness = businesses.find((b) => b.id === found.businessId);
    if (claimedBusiness?.claimStatus === "pending") {
      return {
        ok: false,
        error:
          "Your claim is still pending admin review. We'll email you once it's approved — usually within a couple of business days.",
      };
    }

    persistSession({ accountId: found.id });
    return { ok: true };
  }

  function logout() {
    persistSession(null);
  }

  // Handles both entry paths from Register.jsx (claiming an existing T0
  // listing, or registering a business not in the seed data) — both create
  // an account and flip the business to T1 with claimStatus "pending". It
  // deliberately does NOT log the user in: the claim needs admin approval
  // first (see AdminReview), so login() will refuse this account until then.
  function claimOrRegister({
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
    if (accountStore.findAccountByEmail(repEmail)) {
      return { ok: false, error: "An account with this email already exists — log in instead." };
    }

    const claimedBusiness = businessStore.claimOrCreateBusiness({
      businessId,
      name: businessName,
      category,
      location,
      ssm: regNumber,
    });

    const newAccount = accountStore.createAccount({
      email: repEmail,
      phone: repPhone,
      name: repName,
      role: repRole,
      password,
      businessId: claimedBusiness.id,
      emailVerified: true,
      phoneVerified: true,
    });

    businessStore.setBusinessOwner(claimedBusiness.id, newAccount.id);
    return { ok: true, business: claimedBusiness, account: newAccount };
  }

  function markSsmVerified(businessId) {
    return businessStore.setTier(businessId, "T2");
  }

  function revokeSsmVerification(businessId) {
    return businessStore.setTier(businessId, "T1");
  }

  function approveClaim(businessId) {
    return businessStore.approveClaim(businessId);
  }

  // Rejects a pending claim or revokes one already approved — either way the
  // claimant's account is deleted (they lose login access) and the listing
  // reverts to unclaimed. Logs the current session out if it's the account
  // being removed.
  function removeClaim(businessId) {
    const target = businessStore.getBusiness(businessId);
    if (target?.claimedByAccountId) {
      const removedAccountId = target.claimedByAccountId;
      accountStore.deleteAccount(removedAccountId);
      if (session?.accountId === removedAccountId) {
        persistSession(null);
      }
    }
    return businessStore.removeClaim(businessId);
  }

  const value = {
    account,
    business,
    isAuthenticated: Boolean(account),
    login,
    logout,
    claimOrRegister,
    markSsmVerified,
    revokeSsmVerification,
    approveClaim,
    removeClaim,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

export { AuthProvider, useAuth };
