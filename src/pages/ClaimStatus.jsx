import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import { findAccountByEmail, refreshAccounts } from "@/lib/store/accounts";
import { getBusiness, refreshBusinesses } from "@/lib/store/businesses";
import { findActiveToken } from "@/lib/store/emailVerifications";
import { cn } from "@/lib/utils";

// text-base (not text-sm) below md: inputs under 16px make iOS Safari
// auto-zoom on focus, and the zoom tends to stick around after navigating
// away in an SPA.
const fieldClass =
  "w-full rounded-sm border border-grey-300 px-3.5 py-2.5 text-base md:text-sm text-ink outline-none focus:border-ink dark:border-border dark:text-foreground dark:focus:border-yellow";
const labelClass = "text-[13px] font-bold text-ink dark:text-foreground";

// Lets a claimant check on their claim without a session — the manual-review
// path never logs them in until they click the (delayed) confirmation link,
// so this is their only way back once they close the "claim submitted" page.
function lookupStatus(email) {
  // This page has no session to key off of, so a claimant may check back
  // here in a tab that's been open since before an admin approved their
  // claim — always re-read from localStorage rather than the cached state.
  refreshAccounts();
  refreshBusinesses();

  const account = findAccountByEmail(email);
  if (!account) {
    return { kind: "not-found" };
  }

  const business = getBusiness(account.businessId);
  if (business?.claimStatus === "pending") {
    return { kind: "pending", businessName: business.name };
  }

  if (account.emailVerified) {
    return { kind: "verified", businessName: business?.name };
  }

  const active = findActiveToken({ accountId: account.id });
  if (active) {
    return { kind: "ready", businessName: business?.name, token: active.token };
  }

  return { kind: "no-link", businessName: business?.name };
}

function StatusResult({ result, email }) {
  if (result.kind === "not-found") {
    return (
      <p className="mt-6 text-[14px] text-grey-600 dark:text-muted-foreground">
        We couldn't find a claim for {email}. Double-check the email you used, or{" "}
        <Link to="/register" className="font-bold text-ink underline-offset-2 hover:underline dark:text-foreground">
          start a new claim
        </Link>
        .
      </p>
    );
  }

  if (result.kind === "pending") {
    return (
      <p className="mt-6 text-[14px] text-grey-600 dark:text-muted-foreground">
        We're still finishing verification on your claim
        {result.businessName ? ` for ${result.businessName}` : ""}. We'll send a
        confirmation link to {email} once that's ready — check back anytime.
      </p>
    );
  }

  if (result.kind === "verified") {
    return (
      <p className="mt-6 text-[14px] text-grey-600 dark:text-muted-foreground">
        {email} is verified{result.businessName ? ` for ${result.businessName}` : ""}. You
        can{" "}
        <Link to="/login" className="font-bold text-ink underline-offset-2 hover:underline dark:text-foreground">
          log in
        </Link>{" "}
        now.
      </p>
    );
  }

  if (result.kind === "ready") {
    return (
      <div className="mt-6 rounded-md border border-grey-200 bg-surface-2 p-4 dark:border-border dark:bg-muted">
        <p className="text-[12.5px] font-bold text-ink dark:text-foreground">
          Simulated email — sent to {email}
        </p>
        <p className="mt-1 text-[12.5px] text-grey-600 dark:text-muted-foreground">
          In production this link would already be in your inbox. For this demo, click it
          directly below.
        </p>
        <Link
          to={`/verify-claim/${result.token}`}
          className="mt-3 inline-flex items-center gap-2 rounded-sm border border-transparent bg-yellow px-4 py-2 text-[13px] font-bold text-yellow-ink transition-all hover:-translate-y-px hover:bg-yellow-hi"
        >
          Open verification link
        </Link>
      </div>
    );
  }

  return (
    <p className="mt-6 text-[14px] text-grey-600 dark:text-muted-foreground">
      We don't have an active confirmation link for {email} right now. Please check back
      shortly.
    </p>
  );
}

function ClaimStatus() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [checkedEmail, setCheckedEmail] = useState(null);

  function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setCheckedEmail(email.trim());
  }

  const result = checkedEmail ? lookupStatus(checkedEmail) : null;

  return (
    <div className="mx-auto max-w-[520px] px-6 py-16">
      <Link
        to="/directory"
        className="inline-flex items-center gap-1.5 text-sm font-bold text-grey-600 hover:text-ink dark:text-muted-foreground dark:hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to directory
      </Link>

      <div className="mt-6 rounded-lg border border-grey-200 bg-white p-8 dark:border-border dark:bg-card">
        <span className="text-[11px] font-bold tracking-[0.14em] text-grey-500 uppercase dark:text-muted-foreground">
          Claim your business
        </span>
        <h1 className="mt-2 text-2xl font-extrabold tracking-[-0.02em] text-ink dark:text-foreground">
          Check your claim status
        </h1>
        <p className="mt-2 text-[14px] text-grey-600 dark:text-muted-foreground">
          Enter the email you used when claiming your business.
        </p>

        <form onSubmit={handleSubmit} className="mt-6">
          <label className={labelClass}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={cn(fieldClass, "mt-1.5")}
            autoFocus
          />
          <button
            type="submit"
            className="mt-4 inline-flex items-center gap-2 rounded-sm border border-transparent bg-yellow px-5 py-2.5 text-[14px] font-bold text-yellow-ink transition-all hover:-translate-y-px hover:bg-yellow-hi hover:shadow-md"
          >
            Check status
          </button>
        </form>

        {result && <StatusResult result={result} email={checkedEmail} />}
      </div>
    </div>
  );
}

export { ClaimStatus };
