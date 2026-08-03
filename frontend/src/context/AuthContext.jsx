import { createContext, useContext, useState } from "react";

import * as businessStore from "@/lib/store/businesses";
import * as accountStore from "@/lib/store/accounts";
import { createVerificationToken } from "@/lib/store/emailVerifications";
import { addConnection } from "@/lib/store/connections";
import { consumePendingConnections } from "@/lib/store/pendingConnections";
import { submitBusinessClaim } from "@/lib/api/businesses";

const AuthContext = createContext(null);

const SESSION_KEY = "abri:session:v1";
// Manually-reviewed claims can sit for days before an admin approves, so the
// confirmation link minted at approval time needs a much longer window than
// the domain-match link (which is expected to be clicked in one sitting).
const MANUAL_APPROVAL_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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
      // Single choke point every session-establishing path runs through
      // (login, domain-verified claim, manual-verified claim) — materialize
      // any NFC-scan connection this account queued while it had no session
      // yet, rather than hooking each call site separately.
      const sessionAccount = accountStore.getAccount(next.accountId);
      if (sessionAccount?.businessId) {
        const targetBusinessIds = consumePendingConnections(next.accountId);
        targetBusinessIds.forEach((businessId) => {
          addConnection(sessionAccount.businessId, businessId, "nfc_scan");
        });
      }
    } else {
      window.localStorage.removeItem(SESSION_KEY);
    }
  }

  function login(email, password) {
    // Re-read from localStorage before checking anything — this account's
    // claim may have been approved by an admin in a different tab/session,
    // which only wrote to localStorage, not this tab's in-memory cache.
    accountStore.refreshAccounts();
    businessStore.refreshBusinesses();

    const found = accountStore.verifyPassword(email, password);
    if (!found) return { ok: false, error: "Incorrect email or password." };

    const claimedBusiness = businessStore.getBusiness(found.businessId);
    if (claimedBusiness?.claimStatus === "pending") {
      return {
        ok: false,
        error: "We're still verifying your claim. We'll email you a confirmation link once that's ready.",
      };
    }
    if (!found.emailVerified) {
      return {
        ok: false,
        error: "Please confirm your email using the link we sent before logging in.",
      };
    }

    persistSession({ accountId: found.id });
    return { ok: true };
  }

  function logout() {
    persistSession(null);
  }

  // Submits a claim (either against an existing T0 listing or a brand new
  // business) to the real backend — see routes/businesses.js POST /claim.
  // Deliberately does NOT log the user in: the backend response tells the
  // caller which of the two verification paths this claim landed on
  // (domain-match, needs the emailed link opened; manual review, needs an
  // admin to approve it first — see AdminReview, not yet wired to this
  // backend). NFC-scan-then-claim auto-connect (connectTarget) is dropped
  // here — it depended on a local-store account id that no longer exists
  // once claims are created server-side, and there's no real /connections
  // endpoint yet either. Needs real login/session + connections wiring
  // before it can come back.
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

  function markSsmVerified(businessId) {
    return businessStore.setTier(businessId, "T2");
  }

  function revokeSsmVerification(businessId) {
    return businessStore.setTier(businessId, "T1");
  }

  // Approving here does NOT log the claimant in or fully verify their email
  // — it only clears the business-affiliation gate. A confirmation link is
  // minted at this point (not before), the same action the domain-match
  // path performs immediately at submission time, so the claimant's final
  // step — click a link, get signed in — is identical either way. The
  // link is emailed to the claimant, since they have no session to check
  // back with.
  function approveClaim(businessId) {
    const approved = businessStore.approveClaim(businessId);
    const account = approved?.claimedByAccountId
      ? accountStore.getAccount(approved.claimedByAccountId)
      : null;
    if (account) {
      createVerificationToken({
        email: account.email,
        businessId,
        accountId: account.id,
        ttlMs: MANUAL_APPROVAL_TOKEN_TTL_MS,
      });
    }
    return approved;
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
