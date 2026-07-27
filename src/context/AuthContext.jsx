import { createContext, useContext, useState } from "react";

import * as businessStore from "@/lib/store/businesses";
import * as accountStore from "@/lib/store/accounts";
import { createVerificationToken } from "@/lib/store/emailVerifications";
import { addConnection } from "@/lib/store/connections";
import { addPendingConnection, consumePendingConnections } from "@/lib/store/pendingConnections";

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
    connectTarget,
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
      // Not verified yet either way — the domain-match path sets this true
      // the moment its (immediate) confirmation link is clicked; the manual
      // path sets it true once its (delayed, admin-gated) link is clicked.
      emailVerified: false,
      phoneVerified: true,
    });

    businessStore.setBusinessOwner(claimedBusiness.id, newAccount.id);

    // Guards scanning-then-claiming the same T0 listing (nothing to
    // self-connect to) — everything else queues, since this account may not
    // get a session for days yet (see persistSession).
    if (connectTarget && connectTarget !== claimedBusiness.id) {
      addPendingConnection({ accountId: newAccount.id, businessId: connectTarget });
    }

    return { ok: true, business: claimedBusiness, account: newAccount };
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
  // claimant retrieves it via the /claim-status lookup page, since they
  // have no session to check back with.
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

  // Completes a claim that was auto-verified via company domain match:
  // creates the account/business (still starting "pending", same as the
  // manual path) then immediately auto-approves and signs the claimant in
  // directly. Deliberately bypasses login()'s pending-claim gate rather than
  // calling it — login() reads `businesses` from this render's closure,
  // which would still reflect the pre-mutation snapshot taken just above.
  function completeDomainVerifiedClaim(claimPayload) {
    const result = claimOrRegister(claimPayload);
    if (!result.ok) return result;

    businessStore.autoApproveClaim(result.business.id);
    accountStore.setEmailVerified(result.account.id, true);
    persistSession({ accountId: result.account.id });
    return { ok: true, business: result.business, account: result.account };
  }

  // Completes the manual-review path's final step: the account and business
  // were already created (pending) at submission time and already approved
  // by an admin — this just confirms the claimant controls the email the
  // link was sent to, and signs them in.
  function completeManualVerifiedClaim({ accountId }) {
    // Same reasoning as login(): this link may be opened in a tab whose
    // cache predates the admin's approval, so re-read before trusting it.
    accountStore.refreshAccounts();
    businessStore.refreshBusinesses();

    const account = accountStore.getAccount(accountId);
    if (!account) return { ok: false, error: "Account not found." };

    accountStore.setEmailVerified(accountId, true);
    persistSession({ accountId });
    return { ok: true, account };
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
    completeDomainVerifiedClaim,
    completeManualVerifiedClaim,
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
